import express from 'express'
import { randomUUID } from 'crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { createMcpServer } from './server.js'
import { validateMcpToken } from './auth.js'

const app = express()
app.use(express.json())

const PORT = Number(process.env.MCP_PORT) || 3002

// Mapa de sessões ativas: sessionId → transport
const activeSessions = new Map<string, StreamableHTTPServerTransport>()

// POST /mcp — recebe mensagens do cliente
app.post('/mcp', async (req, res) => {
  const authHeader = req.headers['authorization'] as string | undefined

  // Em sessões existentes, o token já foi validado na inicialização
  const sessionId = req.headers['mcp-session-id'] as string | undefined

  if (sessionId && activeSessions.has(sessionId)) {
    const transport = activeSessions.get(sessionId)!
    await transport.handleRequest(req, res, req.body)
    return
  }

  // Nova sessão — exige token e mensagem Initialize
  if (!isInitializeRequest(req.body)) {
    res.status(400).json({ error: 'Sessão não encontrada. Envie uma mensagem Initialize primeiro.' })
    return
  }

  const context = await validateMcpToken(authHeader)
  if (!context) {
    res.status(401).json({ error: 'Token MCP inválido ou ausente. Use Authorization: Bearer mcp_...' })
    return
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId) => {
      activeSessions.set(newSessionId, transport)
    },
  })

  transport.onclose = () => {
    if (transport.sessionId) {
      activeSessions.delete(transport.sessionId)
    }
  }

  const server = createMcpServer(context)
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

// GET /mcp — SSE stream para mensagens do servidor ao cliente
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined
  if (!sessionId || !activeSessions.has(sessionId)) {
    res.status(404).json({ error: 'Sessão não encontrada' })
    return
  }

  const transport = activeSessions.get(sessionId)!
  await transport.handleRequest(req, res)
})

// DELETE /mcp — encerra sessão
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined
  if (sessionId && activeSessions.has(sessionId)) {
    const transport = activeSessions.get(sessionId)!
    await transport.close()
    activeSessions.delete(sessionId)
  }
  res.status(200).end()
})

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', sessions: activeSessions.size })
})

app.listen(PORT, () => {
  console.log(`MCP Server rodando em http://localhost:${PORT}/mcp`)
  console.log(`Health check: http://localhost:${PORT}/health`)
})
