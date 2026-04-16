import './env.js'
import express from 'express'
import { randomUUID } from 'crypto'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { createMcpServer } from './server.js'
import { validateMcpToken } from './auth.js'
import { env } from './env.js'
import {
  buildOAuthProtectedResourceDocument,
  buildWwwAuthenticateBearerChallenge,
  oauthProtectedResourcePaths,
} from './oauth-resource.js'
import {
  getMirroredOAuthAuthorizationServerMetadata,
  getMirroredOpenIdConfigurationMetadata,
  oauthDynamicClientRegistrationProxyPaths,
  oauthAuthorizationServerMirrorPaths,
} from './oauth-as-metadata-mirror.js'
import type { McpContext } from './context.js'

const app = express()
app.use(express.json())

const PORT = env.MCP_PORT

function principalKeyOf(ctx: McpContext): string {
  return `${ctx.principalType}:${ctx.principalId}`
}

type SessionEntry = {
  transport: StreamableHTTPServerTransport
  contextRef: { current: McpContext }
  principalKey: string
}

const activeSessions = new Map<string, SessionEntry>()

function sendJson401(res: express.Response, body: Record<string, unknown>) {
  res.setHeader('WWW-Authenticate', buildWwwAuthenticateBearerChallenge())
  res.status(401).json(body)
}

const oauthDoc = buildOAuthProtectedResourceDocument()
for (const path of oauthProtectedResourcePaths()) {
  app.get(path, (_req, res) => {
    res.json(oauthDoc)
  })
}

for (const path of oauthAuthorizationServerMirrorPaths()) {
  app.get(path, async (_req, res) => {
    try {
      const doc = path.endsWith('/openid-configuration')
        ? await getMirroredOpenIdConfigurationMetadata()
        : await getMirroredOAuthAuthorizationServerMetadata()
      res.json(doc)
    } catch {
      res.status(502).json({
        error: 'Falha ao obter metadata do servidor de autorização (Keycloak).',
      })
    }
  })
}

async function proxyDynamicClientRegistration(req: express.Request, res: express.Response) {
  const endpoint = `${env.KEYCLOAK_ISSUER.replace(/\/$/, '')}/clients-registrations/openid-connect`
  const headers = new Headers()
  headers.set('Content-Type', 'application/json')

  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.length > 0) {
    headers.set('Authorization', auth)
  }

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body ?? {}),
    })
    res.status(upstream.status)

    const contentType = upstream.headers.get('content-type')
    if (contentType) res.setHeader('Content-Type', contentType)
    const location = upstream.headers.get('location')
    if (location) res.setHeader('Location', location)

    res.send(await upstream.text())
  } catch {
    res.status(502).json({
      error: 'Falha ao encaminhar registo dinâmico de cliente para o Keycloak.',
    })
  }
}

for (const path of oauthDynamicClientRegistrationProxyPaths()) {
  app.post(path, proxyDynamicClientRegistration)
}

// POST /mcp — recebe mensagens do cliente
app.post('/mcp', async (req, res) => {
  const authHeader = req.headers.authorization as string | undefined
  const sessionId = req.headers['mcp-session-id'] as string | undefined

  if (sessionId && activeSessions.has(sessionId)) {
    const entry = activeSessions.get(sessionId)!
    if (authHeader?.startsWith('Bearer ')) {
      const refreshed = await validateMcpToken(authHeader)
      if (!refreshed) {
        sendJson401(res, { error: 'Bearer token inválido, expirado ou sem permissão para este recurso.' })
        return
      }
      if (principalKeyOf(refreshed) !== entry.principalKey) {
        res.setHeader('WWW-Authenticate', buildWwwAuthenticateBearerChallenge())
        res.status(403).json({ error: 'Token de outro utilizador ou integração; reabra a sessão MCP.' })
        return
      }
      entry.contextRef.current = refreshed
    }
    await entry.transport.handleRequest(req, res, req.body)
    return
  }

  if (!isInitializeRequest(req.body)) {
    res.status(400).json({ error: 'Sessão não encontrada. Envie uma mensagem Initialize primeiro.' })
    return
  }

  const context = await validateMcpToken(authHeader)
  if (!context) {
    sendJson401(res, { error: 'Bearer token do Keycloak inválido, expirado ou sem vínculo com utilizador/integração ativa.' })
    return
  }

  const contextRef: { current: McpContext } = { current: context }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId) => {
      activeSessions.set(newSessionId, {
        transport,
        contextRef,
        principalKey: principalKeyOf(context),
      })
    },
  })

  transport.onclose = () => {
    if (transport.sessionId) {
      activeSessions.delete(transport.sessionId)
    }
  }

  const server = createMcpServer(() => contextRef.current)
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

  const entry = activeSessions.get(sessionId)!
  await entry.transport.handleRequest(req, res)
})

// DELETE /mcp — encerra sessão
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined
  if (sessionId && activeSessions.has(sessionId)) {
    const entry = activeSessions.get(sessionId)!
    await entry.transport.close()
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
  console.log(`OAuth PRM: ${JSON.stringify(oauthDoc.resource)} → ${oauthProtectedResourcePaths().join(', ')}`)
  console.log(`OAuth AS mirror (well-known): ${oauthAuthorizationServerMirrorPaths().join(', ')}`)
  console.log(`OAuth DCR proxy: ${oauthDynamicClientRegistrationProxyPaths().join(', ')}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
})
