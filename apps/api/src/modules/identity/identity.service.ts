import { randomBytes } from 'node:crypto'
import { prisma } from '../../lib/prisma.js'
import {
  buildOidcMetadata,
  createIntegrationClientInKeycloak,
  disableIntegrationClient,
  rotateIntegrationClientSecret,
  updateClientEnabledState,
} from '../../lib/keycloak-admin.js'
import type { ClientCredentialsInput, CreateIntegrationInput, UpdateIntegrationInput } from './identity.schema.js'
import { env } from '../../env.js'

function normalizeIntegration(row: {
  id: string
  name: string
  description: string | null
  keycloakClientId: string
  role: 'ADMIN' | 'MEMBER'
  status: 'ACTIVE' | 'INACTIVE'
  lastUsedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    keycloakClientId: row.keycloakClientId,
    role: row.role,
    status: row.status,
    lastUsedAt: row.lastUsedAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function buildClientId(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'integration'

  return `ff-mcp-${slug}-${randomBytes(4).toString('hex')}`
}

export async function listIntegrations(familyId: string) {
  const rows = await prisma.integrationClient.findMany({
    where: { familyId, revokedAt: null },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  })
  return rows.map(normalizeIntegration)
}

export async function createIntegration(user: { sub: string; familyId: string }, input: CreateIntegrationInput) {
  const clientId = buildClientId(input.name)
  const { clientSecret } = await createIntegrationClientInKeycloak({
    clientId,
    name: input.name,
    description: input.description,
  })

  const integration = await prisma.integrationClient.create({
    data: {
      familyId: user.familyId,
      createdById: user.sub,
      name: input.name,
      description: input.description?.trim() || null,
      keycloakClientId: clientId,
      role: input.role,
      status: 'ACTIVE',
    },
  })

  return {
    integration: normalizeIntegration(integration),
    clientId,
    clientSecret,
  }
}

async function getIntegrationOwnedByFamily(familyId: string, integrationId: string) {
  const integration = await prisma.integrationClient.findFirst({
    where: { id: integrationId, familyId, revokedAt: null },
  })
  if (!integration) {
    throw Object.assign(new Error('Integração não encontrada'), { statusCode: 404 })
  }
  return integration
}

export async function updateIntegrationStatus(
  familyId: string,
  integrationId: string,
  input: UpdateIntegrationInput,
) {
  const integration = await getIntegrationOwnedByFamily(familyId, integrationId)
  await updateClientEnabledState(integration.keycloakClientId, input.status === 'ACTIVE')

  const updated = await prisma.integrationClient.update({
    where: { id: integration.id },
    data: { status: input.status },
  })

  return normalizeIntegration(updated)
}

export async function revokeIntegration(familyId: string, integrationId: string) {
  const integration = await getIntegrationOwnedByFamily(familyId, integrationId)
  await disableIntegrationClient(integration.keycloakClientId)
  await prisma.integrationClient.update({
    where: { id: integration.id },
    data: { status: 'INACTIVE', revokedAt: new Date() },
  })
}

export async function rotateSecret(familyId: string, integrationId: string) {
  const integration = await getIntegrationOwnedByFamily(familyId, integrationId)
  const clientSecret = await rotateIntegrationClientSecret(integration.keycloakClientId)
  return {
    integrationId: integration.id,
    clientId: integration.keycloakClientId,
    clientSecret,
  }
}

export async function touchIntegrationByClientId(clientId: string): Promise<void> {
  await prisma.integrationClient.updateMany({
    where: { keycloakClientId: clientId, revokedAt: null },
    data: { lastUsedAt: new Date() },
  })
}

export async function resolveIntegrationPrincipal(clientId: string) {
  const integration = await prisma.integrationClient.findFirst({
    where: {
      keycloakClientId: clientId,
      revokedAt: null,
      status: 'ACTIVE',
    },
  })

  if (!integration) return null

  return {
    integrationId: integration.id,
    familyId: integration.familyId,
    userId: integration.createdById,
    role: integration.role,
    name: integration.name,
  }
}

export async function listManagedClients(familyId: string) {
  const integrations = await listIntegrations(familyId)
  return {
    clients: [
      {
        clientId: env.KEYCLOAK_WEB_CLIENT_ID,
        kind: 'web' as const,
        status: 'ACTIVE' as const,
        familyId: null,
        integrationId: null,
        name: 'Web app',
      },
      {
        clientId: env.KEYCLOAK_MCP_CLIENT_ID,
        kind: 'mcp' as const,
        status: 'ACTIVE' as const,
        familyId: null,
        integrationId: null,
        name: 'MCP OAuth base',
      },
      {
        clientId: env.KEYCLOAK_IDENTITY_ADMIN_CLIENT_ID,
        kind: 'identity-admin' as const,
        status: 'ACTIVE' as const,
        familyId: null,
        integrationId: null,
        name: 'Identity admin API',
      },
      ...integrations.map((integration) => ({
        clientId: integration.keycloakClientId,
        kind: 'integration' as const,
        status: integration.status,
        familyId,
        integrationId: integration.id,
        name: integration.name,
      })),
    ],
  }
}

export function getIdentityMetadata() {
  return buildOidcMetadata()
}

type KeycloakTokenSuccess = {
  access_token: string
  expires_in?: number
  token_type?: string
}

type KeycloakTokenError = {
  error?: string
  error_description?: string
}

export async function exchangeClientCredentialsToken(familyId: string, input: ClientCredentialsInput) {
  const integration = await prisma.integrationClient.findFirst({
    where: {
      familyId,
      keycloakClientId: input.clientId.trim(),
      revokedAt: null,
      status: 'ACTIVE',
    },
  })

  if (!integration) {
    throw Object.assign(new Error('Client ID não corresponde a uma integração ativa desta família'), { statusCode: 403 })
  }

  const { tokenEndpoint } = buildOidcMetadata()
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: input.clientId.trim(),
    client_secret: input.clientSecret,
  })

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const json = (await res.json()) as KeycloakTokenSuccess & KeycloakTokenError

  if (!res.ok || !json.access_token) {
    const hint = typeof json.error_description === 'string' ? json.error_description : json.error
    const isClientError = res.status === 401 || res.status === 400
    const safeMessage = isClientError
      ? 'Credenciais inválidas ou client sem permissão para client_credentials'
      : 'Falha ao solicitar token ao provedor de identidade'
    // 401 no cliente HTTP da web desloga o usuário — usar 400 para falha de credenciais do Keycloak
    throw Object.assign(new Error(hint ? `${safeMessage}: ${hint}` : safeMessage), {
      statusCode: isClientError ? 400 : 502,
    })
  }

  return {
    accessToken: json.access_token,
    expiresIn: typeof json.expires_in === 'number' ? json.expires_in : 0,
    tokenType: typeof json.token_type === 'string' ? json.token_type : 'Bearer',
  }
}
