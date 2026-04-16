#!/usr/bin/env node
/**
 * Verifica a cadeia mínima para conectores ChatGPT (PRM → issuer → registration_endpoint).
 * Opcional: GET do espelho AS metadata no host do MCP (após deploy com oauth-as-metadata-mirror).
 *
 * Uso:
 *   KEYCLOAK_ISSUER=https://auth.exemplo/realms/realm MCP_RESOURCE_URL=https://mcp.exemplo/mcp node keycloak/verify-dcr-readiness.mjs
 */
const issuer = process.env.KEYCLOAK_ISSUER?.replace(/\/$/, '')
const mcpResource = (process.env.MCP_RESOURCE_URL || process.env.MCP_PUBLIC_URL)?.replace(/\/$/, '')

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

if (!issuer) fail('KEYCLOAK_ISSUER é obrigatório.')

async function probeDcrEndpoint(url, label) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const status = res.status
    const body = (await res.text()).slice(0, 240)

    if (status >= 200 && status < 300) {
      console.log(`OK: ${label} aceita POST de DCR (HTTP ${status}).`)
      return { ok: true, status, body }
    }
    if (status === 400) {
      console.log(`OK: ${label} respondeu HTTP 400 (endpoint DCR alcançável; payload inválido esperado).`)
      return { ok: true, status, body }
    }
    if (status === 401 || status === 403) {
      console.log(
        `WARN: ${label} respondeu HTTP ${status} (endpoint existe, mas DCR anónimo pode estar bloqueado por política).`,
      )
      return { ok: true, status, body }
    }
    if (status === 404) {
      console.log(`ERRO: ${label} respondeu HTTP 404 (rota não exposta na borda/proxy).`)
      return { ok: false, status, body }
    }

    console.log(`WARN: ${label} respondeu HTTP ${status}.`)
    return { ok: false, status, body }
  } catch (error) {
    console.log(`ERRO: falha de rede ao testar ${label}:`, error instanceof Error ? error.message : String(error))
    return { ok: false, status: 0, body: '' }
  }
}

async function main() {
  const wellKnown = `${issuer}/.well-known/openid-configuration`
  const res = await fetch(wellKnown)
  if (!res.ok) fail(`openid-configuration: HTTP ${res.status}`)
  const doc = await res.json()
  if (!doc.registration_endpoint) {
    fail('openid-configuration sem registration_endpoint (DCR não anunciado).')
  }
  if (!Array.isArray(doc.code_challenge_methods_supported) || !doc.code_challenge_methods_supported.includes('S256')) {
    fail('code_challenge_methods_supported deve incluir S256.')
  }
  console.log('OK: issuer discovery tem registration_endpoint e PKCE S256.')
  console.log('   registration_endpoint:', doc.registration_endpoint)
  const upstreamProbe = await probeDcrEndpoint(doc.registration_endpoint, 'registration_endpoint do issuer')
  if (!upstreamProbe.ok) {
    fail('registration_endpoint indisponível publicamente (ver rota/proxy/CDN).')
  }

  if (mcpResource) {
    let prmUrl = `${mcpResource}/.well-known/oauth-protected-resource`
    try {
      const u = new URL(mcpResource)
      const prefix = u.pathname && u.pathname !== '/' ? u.pathname.replace(/\/$/, '') : ''
      prmUrl = `${u.origin}${prefix}/.well-known/oauth-protected-resource`
    } catch {
      /* use prmUrl default */
    }
    const pr = await fetch(prmUrl)
    if (!pr.ok) fail(`PRM (${prmUrl}): HTTP ${pr.status}`)
    const prm = await pr.json()
    const servers = prm.authorization_servers
    if (!Array.isArray(servers) || !servers.includes(issuer)) {
      fail(`PRM.authorization_servers deve incluir o issuer (${issuer}).`)
    }
    console.log('OK: PRM e authorization_servers alinhados com o issuer.')
    console.log('   PRM:', prmUrl)

    let mirrorProbeOk = true
    try {
      const u = new URL(mcpResource)
      const asMirror = `${u.origin}/.well-known/oauth-authorization-server`
      const mr = await fetch(asMirror)
      if (mr.ok) {
        const m = await mr.json()
        if (m.registration_endpoint) {
          console.log('OK: espelho AS metadata no host MCP (opcional):', asMirror)
          const mirrorProbe = await probeDcrEndpoint(m.registration_endpoint, 'registration_endpoint espelhado no host MCP')
          mirrorProbeOk = mirrorProbe.ok
        }
      } else {
        console.log('INFO: espelho AS no host MCP ainda não disponível (HTTP', mr.status, ') — faça deploy do apps/mcp atualizado se quiser este fallback.')
      }
    } catch {
      /* ignore */
    }
    if (!mirrorProbeOk) {
      fail('registration_endpoint espelhado no host MCP indisponível.')
    }
  }

  console.log('')
  console.log('Próximo passo manual: no ChatGPT, crie o conector com a URL canónica do MCP, ex.:', mcpResource ?? '(defina MCP_RESOURCE_URL)')
}

await main()
