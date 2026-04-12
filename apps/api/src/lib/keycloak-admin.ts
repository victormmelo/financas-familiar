import { env } from '../env.js'

type KeycloakAccessTokenResponse = {
  access_token?: string
}

type KeycloakClientRepresentation = {
  id: string
  clientId: string
  enabled?: boolean
}

function kcBase(path: string): string {
  return `${env.KEYCLOAK_BASE_URL.replace(/\/$/, '')}${path}`
}

function realmPath(path: string): string {
  return kcBase(`/admin/realms/${encodeURIComponent(env.KEYCLOAK_REALM)}${path}`)
}

function oidcPath(path: string): string {
  return kcBase(`/realms/${encodeURIComponent(env.KEYCLOAK_REALM)}/protocol/openid-connect${path}`)
}

async function getAdminAccessToken(): Promise<string> {
  const body = new URLSearchParams()
  if (env.KEYCLOAK_IDENTITY_ADMIN_CLIENT_SECRET) {
    body.set('grant_type', 'client_credentials')
    body.set('client_id', env.KEYCLOAK_IDENTITY_ADMIN_CLIENT_ID)
    body.set('client_secret', env.KEYCLOAK_IDENTITY_ADMIN_CLIENT_SECRET)
  } else if (env.KEYCLOAK_ADMIN_USERNAME && env.KEYCLOAK_ADMIN_PASSWORD) {
    body.set('grant_type', 'password')
    body.set('client_id', 'admin-cli')
    body.set('username', env.KEYCLOAK_ADMIN_USERNAME)
    body.set('password', env.KEYCLOAK_ADMIN_PASSWORD)
  } else {
    throw Object.assign(
      new Error('Configure KEYCLOAK_IDENTITY_ADMIN_CLIENT_SECRET ou KEYCLOAK_ADMIN_USERNAME/KEYCLOAK_ADMIN_PASSWORD'),
      { statusCode: 500 },
    )
  }

  const res = await fetch(oidcPath('/token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const detail = await readKeycloakErrorBody(res)
    throw Object.assign(new Error(`Falha ao autenticar no Admin API do Keycloak (${res.status}): ${detail}`), {
      statusCode: 502,
    })
  }

  const data = (await res.json()) as KeycloakAccessTokenResponse
  if (!data.access_token) {
    throw Object.assign(new Error('Resposta inválida do Keycloak ao solicitar token administrativo'), { statusCode: 502 })
  }

  return data.access_token
}

async function readKeycloakErrorBody(res: Response): Promise<string> {
  const text = await res.text()
  if (!text.trim()) return res.statusText || `HTTP ${res.status}`
  try {
    const json = JSON.parse(text) as { errorMessage?: string; error?: string; error_description?: string }
    return (
      json.errorMessage ??
      json.error_description ??
      json.error ??
      text.slice(0, 400)
    )
  } catch {
    return text.slice(0, 400)
  }
}

async function keycloakFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = await getAdminAccessToken()
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${accessToken}`)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(path, { ...init, headers })
}

async function parseClientIdByLocation(location: string | null): Promise<string | null> {
  if (!location) return null
  const match = location.match(/\/clients\/([^/]+)$/)
  return match?.[1] ?? null
}

async function resolveClientInternalId(clientId: string): Promise<string | null> {
  const res = await keycloakFetch(`${realmPath('/clients')}?clientId=${encodeURIComponent(clientId)}`)
  if (!res.ok) {
    const detail = await readKeycloakErrorBody(res)
    throw Object.assign(new Error(`Falha ao consultar client no Keycloak (${res.status}): ${detail}`), {
      statusCode: 502,
    })
  }
  const data = (await res.json()) as KeycloakClientRepresentation[]
  return data[0]?.id ?? null
}

export async function createIntegrationClientInKeycloak(input: {
  clientId: string
  name: string
  description?: string
}): Promise<{ internalId: string; clientSecret: string }> {
  const payload = {
    clientId: input.clientId,
    name: input.name,
    description: input.description ?? '',
    protocol: 'openid-connect',
    publicClient: false,
    bearerOnly: false,
    standardFlowEnabled: false,
    directAccessGrantsEnabled: false,
    serviceAccountsEnabled: true,
    implicitFlowEnabled: false,
    frontchannelLogout: false,
    enabled: true,
    redirectUris: [] as string[],
    webOrigins: [] as string[],
    defaultClientScopes: ['web-origins', 'roles', 'profile', 'email'],
    optionalClientScopes: ['address', 'phone', 'offline_access', 'microprofile-jwt'],
  }

  const createRes = await keycloakFetch(realmPath('/clients'), {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  if (!createRes.ok) {
    const detail = await readKeycloakErrorBody(createRes)
    throw Object.assign(new Error(`Falha ao criar integração no Keycloak (${createRes.status}): ${detail}`), {
      statusCode: 502,
    })
  }

  const internalIdFromLocation = await parseClientIdByLocation(createRes.headers.get('location'))
  const internalId = internalIdFromLocation ?? (await resolveClientInternalId(input.clientId))
  if (!internalId) {
    throw Object.assign(new Error('Integração criada, mas não foi possível resolver o client interno no Keycloak'), {
      statusCode: 502,
    })
  }

  const secretRes = await keycloakFetch(realmPath(`/clients/${encodeURIComponent(internalId)}/client-secret`))
  if (!secretRes.ok) {
    const detail = await readKeycloakErrorBody(secretRes)
    throw Object.assign(
      new Error(`Falha ao obter segredo inicial da integração no Keycloak (${secretRes.status}): ${detail}`),
      { statusCode: 502 },
    )
  }

  const secretData = (await secretRes.json()) as { value?: string }
  if (!secretData.value) {
    throw Object.assign(new Error('Keycloak não retornou um client secret válido'), { statusCode: 502 })
  }

  return { internalId, clientSecret: secretData.value }
}

export async function updateClientEnabledState(clientId: string, enabled: boolean): Promise<void> {
  const internalId = await resolveClientInternalId(clientId)
  if (!internalId) {
    throw Object.assign(new Error('Client não encontrado no Keycloak'), { statusCode: 404 })
  }

  const currentRes = await keycloakFetch(realmPath(`/clients/${encodeURIComponent(internalId)}`))
  if (!currentRes.ok) {
    const detail = await readKeycloakErrorBody(currentRes)
    throw Object.assign(new Error(`Falha ao consultar client no Keycloak (${currentRes.status}): ${detail}`), {
      statusCode: 502,
    })
  }

  const current = (await currentRes.json()) as Record<string, unknown>

  const res = await keycloakFetch(realmPath(`/clients/${encodeURIComponent(internalId)}`), {
    method: 'PUT',
    body: JSON.stringify({ ...current, enabled }),
  })

  if (!res.ok) {
    const detail = await readKeycloakErrorBody(res)
    throw Object.assign(new Error(`Falha ao atualizar status do client no Keycloak (${res.status}): ${detail}`), {
      statusCode: 502,
    })
  }
}

export async function rotateIntegrationClientSecret(clientId: string): Promise<string> {
  const internalId = await resolveClientInternalId(clientId)
  if (!internalId) {
    throw Object.assign(new Error('Client não encontrado no Keycloak'), { statusCode: 404 })
  }

  const res = await keycloakFetch(realmPath(`/clients/${encodeURIComponent(internalId)}/client-secret`), {
    method: 'POST',
  })
  if (!res.ok) {
    const detail = await readKeycloakErrorBody(res)
    throw Object.assign(new Error(`Falha ao rotacionar client secret no Keycloak (${res.status}): ${detail}`), {
      statusCode: 502,
    })
  }

  const data = (await res.json()) as { value?: string }
  if (!data.value) {
    throw Object.assign(new Error('Keycloak não retornou um novo client secret'), { statusCode: 502 })
  }

  return data.value
}

export async function disableIntegrationClient(clientId: string): Promise<void> {
  await updateClientEnabledState(clientId, false)
}

export function buildOidcMetadata() {
  const issuer = env.KEYCLOAK_ISSUER.replace(/\/$/, '')
  return {
    issuer,
    realm: env.KEYCLOAK_REALM,
    authorizationEndpoint: `${issuer}/protocol/openid-connect/auth`,
    tokenEndpoint: `${issuer}/protocol/openid-connect/token`,
    jwksUri: env.KEYCLOAK_JWKS_URI || `${issuer}/protocol/openid-connect/certs`,
    endSessionEndpoint: `${issuer}/protocol/openid-connect/logout`,
    webClientId: env.KEYCLOAK_WEB_CLIENT_ID,
    mcpClientId: env.KEYCLOAK_MCP_CLIENT_ID,
    mcpEndpoint: env.MCP_PUBLIC_URL ?? 'http://localhost:3002/mcp',
  }
}
