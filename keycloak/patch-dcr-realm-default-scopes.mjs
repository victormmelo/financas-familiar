#!/usr/bin/env node
/**
 * Garante scopes default do realm para clientes criados via DCR.
 * Objetivo: evitar invalid_scope no ChatGPT ao solicitar openid profile email offline_access.
 *
 * Uso:
 *   KEYCLOAK_BASE_URL=https://auth.exemplo.com KEYCLOAK_REALM=meu-realm \
 *   KEYCLOAK_ADMIN=admin KEYCLOAK_ADMIN_PASSWORD=*** \
 *   node keycloak/patch-dcr-realm-default-scopes.mjs
 */

const baseUrl = process.env.KEYCLOAK_BASE_URL?.replace(/\/$/, '')
const realm = process.env.KEYCLOAK_REALM
const adminUser = process.env.KEYCLOAK_ADMIN ?? 'admin'
const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD

const REQUIRED_DEFAULT_SCOPES = ['profile', 'email', 'mcp-resource-audience']
const REQUIRED_OPTIONAL_SCOPES = ['offline_access']

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

if (!baseUrl) fail('KEYCLOAK_BASE_URL é obrigatória.')
if (!realm) fail('KEYCLOAK_REALM é obrigatório.')
if (!adminPassword) fail('KEYCLOAK_ADMIN_PASSWORD é obrigatória.')

async function getAdminAccessToken() {
  const body = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: adminUser,
    password: adminPassword,
  })
  const res = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    fail(`Falha ao obter token admin (${res.status}): ${(await res.text()).slice(0, 500)}`)
  }
  const json = await res.json()
  if (!json.access_token) fail('Resposta de token sem access_token.')
  return json.access_token
}

async function main() {
  const token = await getAdminAccessToken()
  const headers = { Authorization: `Bearer ${token}` }

  const scopesRes = await fetch(`${baseUrl}/admin/realms/${encodeURIComponent(realm)}/client-scopes`, { headers })
  if (!scopesRes.ok) fail(`Falha ao listar client scopes (${scopesRes.status}).`)
  const allScopes = await scopesRes.json()
  if (!Array.isArray(allScopes)) fail('Resposta inesperada ao listar client scopes.')

  const scopeIdByName = new Map(
    allScopes
      .filter((s) => s && typeof s === 'object' && typeof s.name === 'string' && typeof s.id === 'string')
      .map((s) => [s.name, s.id]),
  )

  for (const scopeName of [...REQUIRED_DEFAULT_SCOPES, ...REQUIRED_OPTIONAL_SCOPES]) {
    if (!scopeIdByName.has(scopeName)) {
      fail(`Client scope obrigatório não encontrado no realm: ${scopeName}`)
    }
  }

  async function ensureScope(kind, scopeName) {
    const scopeId = scopeIdByName.get(scopeName)
    const url = `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/default-${kind}-client-scopes/${encodeURIComponent(scopeId)}`
    const res = await fetch(url, { method: 'PUT', headers })
    if (!(res.ok || res.status === 409)) {
      fail(`Falha ao anexar scope ${scopeName} em default-${kind}-client-scopes (${res.status}): ${(await res.text()).slice(0, 300)}`)
    }
  }

  for (const scopeName of REQUIRED_DEFAULT_SCOPES) {
    await ensureScope('default', scopeName)
  }
  for (const scopeName of REQUIRED_OPTIONAL_SCOPES) {
    await ensureScope('optional', scopeName)
  }

  const checkDefaults = await fetch(`${baseUrl}/admin/realms/${encodeURIComponent(realm)}/default-default-client-scopes`, {
    headers,
  })
  const checkOptional = await fetch(`${baseUrl}/admin/realms/${encodeURIComponent(realm)}/default-optional-client-scopes`, {
    headers,
  })
  if (!checkDefaults.ok || !checkOptional.ok) {
    fail(`Falha ao validar scopes default do realm (${checkDefaults.status}/${checkOptional.status}).`)
  }

  const defaults = await checkDefaults.json()
  const optionals = await checkOptional.json()
  const defaultNames = new Set(Array.isArray(defaults) ? defaults.map((s) => s?.name).filter(Boolean) : [])
  const optionalNames = new Set(Array.isArray(optionals) ? optionals.map((s) => s?.name).filter(Boolean) : [])

  for (const scopeName of REQUIRED_DEFAULT_SCOPES) {
    if (!defaultNames.has(scopeName)) fail(`Validação falhou: default-default-client-scopes sem ${scopeName}`)
  }
  for (const scopeName of REQUIRED_OPTIONAL_SCOPES) {
    if (!optionalNames.has(scopeName)) fail(`Validação falhou: default-optional-client-scopes sem ${scopeName}`)
  }

  console.log('OK: scopes default do realm ajustados para DCR.')
  console.log('   default-default-client-scopes:', [...defaultNames].sort().join(', '))
  console.log('   default-optional-client-scopes:', [...optionalNames].sort().join(', '))
}

await main()
