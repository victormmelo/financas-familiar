#!/usr/bin/env node
/**
 * Verificação rápida do documento RFC 9728 (OAuth Protected Resource Metadata).
 * Uso: MCP_RESOURCE_URL=https://host/mcp node scripts/check-oauth-prm.mjs
 */
const base = (process.env.MCP_RESOURCE_URL || process.env.MCP_PUBLIC_URL || 'http://127.0.0.1:3002/mcp').replace(
  /\/$/,
  '',
)
let url = `${base}/.well-known/oauth-protected-resource`
try {
  const u = new URL(base)
  const prefix = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/$/, '') : ''
  url = `${u.origin}${prefix}/.well-known/oauth-protected-resource`
} catch {
  /* ignore */
}

const res = await fetch(url)
if (!res.ok) {
  console.error(`Falha HTTP ${res.status} ao obter ${url}`)
  process.exit(1)
}
const json = await res.json()
const required = ['resource', 'authorization_servers']
for (const k of required) {
  if (!(k in json)) {
    console.error(`Campo ausente no PRM: ${k}`)
    process.exit(1)
  }
}
console.log('OK', url)
console.log(JSON.stringify(json, null, 2))
