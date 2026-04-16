#!/usr/bin/env node
/**
 * Atualiza a política legada "Trusted Hosts" do registo anónimo de clientes (DCR / RFC 7591)
 * para aceitar redirects do ChatGPT/OpenAI sem exigir que o *host* da requisição HTTP coincida.
 *
 * Uso (na raiz do monorepo, com variáveis de ambiente):
 *   KEYCLOAK_BASE_URL=https://auth.exemplo.com KEYCLOAK_REALM=meu-realm \
 *   KEYCLOAK_ADMIN=admin KEYCLOAK_ADMIN_PASSWORD=*** \
 *   node keycloak/patch-dcr-trusted-hosts.mjs
 *
 * Hosts extra (opcional): KEYCLOAK_DCR_TRUSTED_HOSTS_EXTRA="meuapp.com,outro.com"
 */

const baseUrl = process.env.KEYCLOAK_BASE_URL?.replace(/\/$/, '')
const realm = process.env.KEYCLOAK_REALM
const adminUser = process.env.KEYCLOAK_ADMIN ?? 'admin'
const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD

const EXTRA_HOSTS = (process.env.KEYCLOAK_DCR_TRUSTED_HOSTS_EXTRA ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

/** Hosts cujos redirect URIs o ChatGPT usa (authorization code). */
const DEFAULT_TRUSTED_HOSTS = [
  'localhost',
  '127.0.0.1',
  'chatgpt.com',
  'chat.openai.com',
  'openai.com',
]

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
    const t = await res.text()
    fail(`Falha ao obter token admin (${res.status}): ${t.slice(0, 500)}`)
  }
  const json = await res.json()
  if (!json.access_token) fail('Resposta de token sem access_token.')
  return json.access_token
}

async function probeAnonymousDcr(base, realm) {
  const endpoint = `${base}/realms/${encodeURIComponent(realm)}/clients-registrations/openid-connect`
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    return { status: res.status, endpoint }
  } catch {
    return { status: 0, endpoint }
  }
}

/** @param {unknown} c */
function isTrustedHostsAnonymous(c) {
  if (!c || typeof c !== 'object') return false
  const o = /** @type {Record<string, unknown>} */ (c)
  return o.providerId === 'trusted-hosts' && (o.subType === 'anonymous' || o.subType == null)
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string[]>}
 */
function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object') return {}
  const out = /** @type {Record<string, string[]>} */ ({})
  for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (raw))) {
    if (Array.isArray(v)) out[k] = v.map(String)
    else if (v != null) out[k] = [String(v)]
  }
  return out
}

async function main() {
  const token = await getAdminAccessToken()
  const auth = { Authorization: `Bearer ${token}` }
  const type = 'org.keycloak.services.clientregistration.policy.ClientRegistrationPolicy'
  const listUrl = `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/components`
  const listRes = await fetch(listUrl, { headers: auth })
  if (!listRes.ok) {
    fail(`Falha ao listar components (${listRes.status}): ${(await listRes.text()).slice(0, 400)}`)
  }
  const components = await listRes.json()
  if (!Array.isArray(components)) fail('Resposta inesperada: components não é array.')

  const policies = components.filter(
    (c) => c && typeof c === 'object' && c.providerType === type,
  )

  let target = policies.find(isTrustedHostsAnonymous)
  if (!target) {
    target = policies.find((c) => c && typeof c === 'object' && c.providerId === 'trusted-hosts')
  }
  const upsertBase = target && typeof target === 'object' ? target : {}
  const config = normalizeConfig(/** @type {{ config?: unknown }} */ (upsertBase).config)
  const existing = new Set(
    (config['trusted-hosts'] ?? []).map((h) => h.toLowerCase().trim()).filter(Boolean),
  )
  for (const h of [...DEFAULT_TRUSTED_HOSTS, ...EXTRA_HOSTS]) existing.add(h)

  const nextConfig = {
    ...config,
    'host-sending-registration-request-must-match': ['false'],
    'client-uris-must-match': ['true'],
    'trusted-hosts': [...existing].sort(),
  }

  const putBody = {
    ...upsertBase,
    name: 'trusted-hosts',
    providerId: 'trusted-hosts',
    providerType: type,
    parentId: realm,
    subType: 'anonymous',
    config: nextConfig,
  }
  if (target && typeof target === 'object' && 'id' in target) {
    const id = String(/** @type {{ id: string }} */ (target).id)
    const putRes = await fetch(`${baseUrl}/admin/realms/${encodeURIComponent(realm)}/components/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(putBody),
    })
    if (!putRes.ok) {
      fail(`Falha ao atualizar Trusted Hosts (${putRes.status}): ${(await putRes.text()).slice(0, 600)}`)
    }
  } else {
    const createRes = await fetch(`${baseUrl}/admin/realms/${encodeURIComponent(realm)}/components`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(putBody),
    })
    if (!createRes.ok) {
      fail(`Falha ao criar política Trusted Hosts (${createRes.status}): ${(await createRes.text()).slice(0, 600)}`)
    }
    target = putBody
  }

  const verifyRes = await fetch(listUrl, { headers: auth })
  if (!verifyRes.ok) {
    fail(`Falha ao validar components após patch (${verifyRes.status}): ${(await verifyRes.text()).slice(0, 400)}`)
  }
  const verifyRowsRaw = await verifyRes.json()
  if (!Array.isArray(verifyRowsRaw)) fail('Validação pós-patch devolveu formato inesperado.')
  const verifyRows = verifyRowsRaw.filter(
    (c) => c && typeof c === 'object' && c.providerType === type,
  )

  let verified = verifyRows.find(isTrustedHostsAnonymous)
  if (!verified) {
    verified = verifyRows.find((c) => c && typeof c === 'object' && c.providerId === 'trusted-hosts')
  }
  if (!verified || typeof verified !== 'object') {
    const probe = await probeAnonymousDcr(baseUrl, realm)
    if (probe.status >= 200 && probe.status < 300) {
      console.log(
        'WARN: política trusted-hosts não encontrada, porém DCR anónimo está funcional ' +
          `(HTTP ${probe.status}) em ${probe.endpoint}.`,
      )
      return
    }
    if (probe.status === 400) {
      console.log(
        'WARN: política trusted-hosts não encontrada, porém endpoint DCR anónimo está acessível ' +
          `(HTTP 400 esperado com payload vazio) em ${probe.endpoint}.`,
      )
      return
    }
    fail(
      'Política trusted-hosts (subType=anonymous) não encontrada após patch. ' +
        'Garanta KC_SPI_CLIENT_REGISTRATION_POLICY_TRUSTED_HOSTS_ENABLED=true no Keycloak.',
    )
  }
  const verifiedConfig = normalizeConfig(/** @type {{ config?: unknown }} */ (verified).config)
  const mustMatchHost = verifiedConfig['host-sending-registration-request-must-match']?.[0]
  const mustMatchUris = verifiedConfig['client-uris-must-match']?.[0]
  const trustedHosts = new Set((verifiedConfig['trusted-hosts'] ?? []).map((h) => h.toLowerCase()))
  if (mustMatchHost !== 'false') {
    fail('Validação pós-patch falhou: host-sending-registration-request-must-match não está como false.')
  }
  if (mustMatchUris !== 'true') {
    fail('Validação pós-patch falhou: client-uris-must-match não está como true.')
  }
  for (const requiredHost of [...DEFAULT_TRUSTED_HOSTS, ...EXTRA_HOSTS]) {
    if (!trustedHosts.has(requiredHost)) {
      fail(`Validação pós-patch falhou: trusted-hosts sem ${requiredHost}.`)
    }
  }

  console.log('OK: política Trusted Hosts (anonymous DCR) atualizada.')
  console.log('   trusted-hosts:', nextConfig['trusted-hosts'].join(', '))
  console.log(
    '   host-sending-registration-request-must-match:',
    nextConfig['host-sending-registration-request-must-match']?.join(', '),
  )
  console.log('   client-uris-must-match:', nextConfig['client-uris-must-match']?.join(', '))
}

await main()
