import { randomBytes } from 'node:crypto'
import { prisma } from '../../lib/prisma.js'
import {
  buildOidcMetadata,
  createIntegrationClientInKeycloak,
  disableIntegrationClient,
  rotateIntegrationClientSecret,
  updateClientEnabledState,
} from '../../lib/keycloak-admin.js'
import type { CreateIntegrationInput, UpdateIntegrationInput } from './identity.schema.js'
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
