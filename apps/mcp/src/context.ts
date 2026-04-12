export interface McpContext {
  principalType: 'user' | 'integration'
  principalId: string
  userId: string
  familyId: string
  role: 'ADMIN' | 'MEMBER'
  integrationName?: string
}
