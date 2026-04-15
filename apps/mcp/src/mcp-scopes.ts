/**
 * Scopes pedidos nas tools (OAuth2) e anunciados em `/.well-known/oauth-protected-resource`.
 * Devem existir no realm Keycloak (client scopes) e estar disponíveis no consentimento.
 */
export const MCP_OAUTH_SCOPES = ['openid', 'profile', 'email'] as const

export type McpOAuthScope = (typeof MCP_OAUTH_SCOPES)[number]

export const MCP_TOOL_SECURITY_SCHEMES = [
  { type: 'oauth2' as const, scopes: [...MCP_OAUTH_SCOPES] },
]

/** Anexa `securitySchemes` exigidos pelo Apps SDK / ChatGPT à definição de uma tool. */
export function withMcpToolOAuth<T extends Record<string, unknown>>(tool: T): T & { securitySchemes: typeof MCP_TOOL_SECURITY_SCHEMES } {
  return { ...tool, securitySchemes: MCP_TOOL_SECURITY_SCHEMES }
}
