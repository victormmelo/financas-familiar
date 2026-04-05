import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { McpContext } from './context.js'
import { transactionToolDefinitions, registerTransactionHandlers } from './tools/transactions.js'
import { accountToolDefinitions, registerAccountHandlers } from './tools/accounts.js'
import { categoryToolDefinitions, registerCategoryHandlers } from './tools/categories.js'
import { creditCardToolDefinitions, registerCreditCardHandlers } from './tools/credit-cards.js'
import { transferToolDefinitions, registerTransferHandlers } from './tools/transfers.js'
import { goalToolDefinitions, registerGoalHandlers } from './tools/goals.js'
import { budgetToolDefinitions, registerBudgetHandlers } from './tools/budgets.js'
import { reportToolDefinitions, registerReportHandlers } from './tools/reports.js'
import { familyToolDefinitions, registerFamilyHandlers } from './tools/family.js'

const ALL_TOOL_DEFINITIONS = [
  ...transactionToolDefinitions,
  ...accountToolDefinitions,
  ...categoryToolDefinitions,
  ...creditCardToolDefinitions,
  ...transferToolDefinitions,
  ...goalToolDefinitions,
  ...budgetToolDefinitions,
  ...reportToolDefinitions,
  ...familyToolDefinitions,
]

export function createMcpServer(context: McpContext): Server {
  const server = new Server(
    { name: 'financas-familiar', version: '1.0.0' },
    { capabilities: { tools: {} } },
  )

  // Map de handlers indexado por nome de tool
  const toolHandlerMap = new Map<string, (args: unknown) => Promise<unknown>>()

  // Registra todos os handlers com o contexto do usuário capturado em closure
  registerTransactionHandlers(server, context, toolHandlerMap)
  registerAccountHandlers(context, toolHandlerMap)
  registerCategoryHandlers(context, toolHandlerMap)
  registerCreditCardHandlers(context, toolHandlerMap)
  registerTransferHandlers(context, toolHandlerMap)
  registerGoalHandlers(context, toolHandlerMap)
  registerBudgetHandlers(context, toolHandlerMap)
  registerReportHandlers(context, toolHandlerMap)
  registerFamilyHandlers(context, toolHandlerMap)

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOL_DEFINITIONS,
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    const handler = toolHandlerMap.get(name)
    if (!handler) {
      return {
        content: [{ type: 'text', text: `Tool desconhecida: ${name}` }],
        isError: true,
      }
    }

    try {
      const result = await handler(args ?? {})
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro interno'
      return {
        content: [{ type: 'text', text: `Erro: ${message}` }],
        isError: true,
      }
    }
  })

  return server
}
