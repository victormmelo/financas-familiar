// ─── Enums ────────────────────────────────────────────────────────────────────

export type Role = 'ADMIN' | 'MEMBER'
export type AccountType = 'CHECKING' | 'SAVINGS' | 'JOINT' | 'INVESTMENT' | 'CASH'
export type TransactionType = 'INCOME' | 'EXPENSE'
export type TransactionNature = 'NORMAL' | 'REIMBURSEMENT' | 'TRANSFER' | 'ADJUSTMENT' | 'REVERSAL'

export type TransactionRecognition = 'OPERATIONAL' | 'TRANSFER_LEG' | 'INVOICE_PAYMENT'
export type TransactionStatus = 'DRAFT' | 'CONFIRMED' | 'DELETED'
export type DraftSource =
  | 'MANUAL'
  | 'AI_TEXT'
  | 'AI_VOICE'
  | 'AI_RECEIPT'
  | 'PDF'
  | 'OFX'
  | 'CSV'
  | 'OPEN_FINANCE'
export type CategoryType = 'INCOME' | 'EXPENSE' | 'BOTH'
export type InvoiceStatus = 'OPEN' | 'CLOSED' | 'PAID'
export type ReportType = 'DRE' | 'CASH_FLOW' | 'PATRIMONY'
export type ReportStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'
export type AIIntent = 'expense' | 'income' | 'internal_transfer' | 'unknown'
export type ReconciliationItemStatus = 'MATCHED' | 'DIVERGENT' | 'MISSING' | 'UNMATCHED'

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationMeta {
  nextCursor: string | null
  hasMore: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  name: string
  email: string
  role: Role
  familyId: string
}

/** Preferência de UI para despesa: conta à vista vs fatura do cartão. */
export type EntryExpenseSettlementPref = 'ACCOUNT' | 'CARD'

/** Contexto de lançamento persistido por usuário (sincronizado entre dispositivos). */
export interface UserEntryPreferences {
  accountId: string | null
  accountName: string | null
  creditCardId: string | null
  creditCardName: string | null
  expenseSettlement: EntryExpenseSettlementPref | null
}

export function emptyUserEntryPreferences(): UserEntryPreferences {
  return {
    accountId: null,
    accountName: null,
    creditCardId: null,
    creditCardName: null,
    expenseSettlement: null,
  }
}

/** Body de PATCH /auth/me/entry-preferences — omitir campo = não alterar; null = limpar. */
export interface PatchUserEntryPreferencesInput {
  accountId?: string | null
  creditCardId?: string | null
  expenseSettlement?: EntryExpenseSettlementPref | null
}

export interface AuthTokens {
  accessToken: string
}

export interface AuthResponse {
  user: AuthUser
  accessToken: string
}

export interface RegisterInput {
  name: string
  email: string
  password: string
  familyName: string
}

export interface LoginInput {
  email: string
  password: string
}

// ─── Family ───────────────────────────────────────────────────────────────────

export interface Family {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface FamilyMember {
  id: string
  name: string
  email: string
  role: Role
  createdAt: string
}

export interface FamilyInvite {
  id: string
  email: string
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
  invitedBy: { id: string; name: string }
}

// ─── Account ──────────────────────────────────────────────────────────────────

export interface Account {
  id: string
  familyId: string
  name: string
  type: AccountType
  initialBalance: number
  balance: number
  /** Saldo em caixa: só lançamentos `liquidated` na conta (exclui cartão). */
  liquidatedBalance: number
  color: string | null
  icon: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateAccountInput {
  name: string
  type: AccountType
  initialBalance?: number
  color?: string
  icon?: string
}

export interface UpdateAccountInput {
  name?: string
  type?: AccountType
  initialBalance?: number
  color?: string
  icon?: string
  isActive?: boolean
}

// ─── Category ─────────────────────────────────────────────────────────────────

export interface Category {
  id: string
  familyId: string
  parentId: string | null
  name: string
  type: CategoryType
  icon: string | null
  color: string | null
  createdAt: string
  updatedAt: string
  subcategories?: Category[]
}

export interface CreateCategoryInput {
  name: string
  type: CategoryType
  parentId?: string
  icon?: string
  color?: string
}

// ─── Transaction ──────────────────────────────────────────────────────────────

export interface Transaction {
  id: string
  familyId: string
  accountId: string
  categoryId: string | null
  createdById: string
  type: TransactionType
  nature: TransactionNature
  linkedTransactionId: string | null
  status: TransactionStatus
  amount: number
  description: string
  notes: string | null
  date: string
  source: DraftSource
  transferId: string | null
  creditCardId: string | null
  recognition: TransactionRecognition
  creditCardInvoiceId: string | null
  isRecurring: boolean
  rrule: string | null
  recurringTemplateId: string | null
  installmentGroupId: string | null
  installmentIndex: number | null
  installmentCount: number | null
  confirmedAt: string | null
  liquidated: boolean
  createdAt: string
  updatedAt: string
  account?: { id: string; name: string; color: string | null }
  category?: { id: string; name: string; type: CategoryType } | null
  createdBy?: { id: string; name: string }
  creditCard?: { id: string; name: string } | null
  transfer?: {
    id: string
    fromAccountId: string
    toAccountId: string
    fromAccount?: { id: string; name: string }
    toAccount?: { id: string; name: string }
  } | null
  linkedTransaction?: {
    id: string
    type: TransactionType
    nature: TransactionNature
    status: TransactionStatus
    amount: number
    categoryId: string | null
    description: string
    category?: { id: string; name: string; type: CategoryType } | null
  } | null
  reimbursedAmount?: number
  remainingReimbursableAmount?: number
  netAmount?: number
  creditCardInvoice?: {
    id: string
    referenceMonth: number
    referenceYear: number
    creditCard?: { id: string; name: string }
  } | null
  /** Próximas ocorrências (apenas em templates recorrentes) */
  nextOccurrences?: string[]
}

export interface CreateTransactionInput {
  /** Obrigatório exceto quando há `creditCardId` e o cartão tem conta padrão. */
  accountId?: string
  categoryId?: string
  type: TransactionType
  nature?: TransactionNature
  linkedTransactionId?: string
  reimbursementOverflowReason?: string
  amount: number
  description: string
  notes?: string
  date: string
  source?: DraftSource
  creditCardId?: string
  isRecurring?: boolean
  rrule?: string
  /** Número de parcelas (2-360). Mutuamente exclusivo com isRecurring. */
  installmentCount?: number
  liquidated?: boolean
  /** Cria como confirmada (saldo previsto / fluxo “confirmado”). */
  confirmed?: boolean
}

export interface InstallmentCreationResult {
  installmentGroupId: string
  installmentCount: number
  transactions: Transaction[]
}

export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'

export interface UpdateTransactionInput {
  accountId?: string
  categoryId?: string
  nature?: TransactionNature
  linkedTransactionId?: string | null
  reimbursementOverflowReason?: string
  amount?: number
  description?: string
  notes?: string
  date?: string
  liquidated?: boolean
}

export interface TransactionFilters {
  status?: TransactionStatus
  type?: TransactionType
  nature?: TransactionNature
  linkedTransactionId?: string
  accountId?: string
  categoryId?: string
  startDate?: string
  endDate?: string
  liquidated?: boolean
  cursor?: string
  limit?: number
}

// ─── Transfer ─────────────────────────────────────────────────────────────────

export interface Transfer {
  id: string
  familyId: string
  fromAccountId: string
  toAccountId: string
  amount: number
  description: string | null
  date: string
  createdAt: string
  updatedAt: string
  fromAccount?: { id: string; name: string; color: string | null }
  toAccount?: { id: string; name: string; color: string | null }
}

export interface CreateTransferInput {
  fromAccountId: string
  toAccountId: string
  amount: number
  description?: string
  date: string
}

// ─── Credit Card ──────────────────────────────────────────────────────────────

export interface CreditCard {
  id: string
  familyId: string
  name: string
  limit: number
  closingDay: number
  dueDay: number
  defaultAccountId: string | null
  defaultAccount?: { id: string; name: string } | null
  color: string | null
  icon: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateCreditCardInput {
  name: string
  limit: number
  closingDay: number
  dueDay: number
  defaultAccountId: string
  color?: string
  icon?: string
}

export interface CreditCardInvoice {
  id: string
  creditCardId: string
  referenceMonth: number
  referenceYear: number
  totalAmount: number
  status: InvoiceStatus
  dueDate: string
  paidAt: string | null
  paidFromAccountId: string | null
  paidFromAccount?: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
  transactions?: Transaction[]
}

// ─── Goal ─────────────────────────────────────────────────────────────────────

export interface Goal {
  id: string
  familyId: string
  accountId: string | null
  name: string
  targetAmount: number
  currentAmount: number
  deadline: string | null
  icon: string | null
  color: string | null
  isCompleted: boolean
  progressPercent: number
  createdAt: string
  updatedAt: string
}

export interface CreateGoalInput {
  name: string
  targetAmount: number
  currentAmount?: number
  deadline?: string
  accountId?: string
  icon?: string
  color?: string
}

export interface UpdateGoalInput {
  name?: string
  targetAmount?: number
  currentAmount?: number
  deadline?: string
  icon?: string
  color?: string
  isCompleted?: boolean
}

// ─── Budget ───────────────────────────────────────────────────────────────────

export interface Budget {
  id: string
  familyId: string
  categoryId: string
  referenceMonth: number
  referenceYear: number
  limitAmount: number
  spentAmount: number
  usagePercent: number
  isOverBudget: boolean
  createdAt: string
  updatedAt: string
  category?: { id: string; name: string; type: CategoryType; color: string | null }
}

export interface CreateBudgetInput {
  categoryId: string
  referenceMonth: number
  referenceYear: number
  limitAmount: number
}

export interface UpdateBudgetInput {
  limitAmount: number
}

export interface BudgetFilters {
  referenceMonth?: number
  referenceYear?: number
}

// ─── Report ───────────────────────────────────────────────────────────────────

export interface Report {
  id: string
  familyId: string
  type: ReportType
  status: ReportStatus
  params: Record<string, unknown>
  fileUrl: string | null
  errorMsg: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateReportInput {
  type: ReportType
  params: {
    startDate?: string
    endDate?: string
    referenceYear?: number
  }
}

// ─── Reconciliation ───────────────────────────────────────────────────────────

export type StatementSource = 'OFX' | 'CSV' | 'MANUAL'
export type StatementItemStatus = 'PENDING' | 'MATCHED' | 'REJECTED' | 'IGNORED' | 'CONVERTED'

export interface ReconciliationSession {
  id: string
  familyId: string
  accountId: string
  source: StatementSource
  fileName: string | null
  startDate: string | null
  endDate: string | null
  createdById: string
  createdAt: string
  updatedAt: string
  account?: { id: string; name: string; color: string | null }
  itemCount?: number
  pendingCount?: number
}

export interface StatementItem {
  id: string
  familyId: string
  accountId: string
  sessionId: string | null
  type: TransactionType
  amount: number
  description: string
  date: string
  externalId: string | null
  status: StatementItemStatus
  matchedTransactionId: string | null
  matchScore: number | null
  ignoredAt: string | null
  convertedAt: string | null
  createdAt: string
  updatedAt: string
  matchedTransaction?: Pick<Transaction, 'id' | 'description' | 'amount' | 'date' | 'status'> | null
  reconciliationResult?: ReconciliationItemStatus
}

export interface CreateStatementItemInput {
  accountId: string
  sessionId?: string
  type: TransactionType
  amount: number
  description: string
  date: string
}

export interface RunMatchingInput {
  accountId: string
  startDate: string
  endDate: string
}

export interface AcceptMatchInput {
  transactionId: string
}

export interface ConvertItemInput {
  categoryId?: string
  description?: string
  notes?: string
}

export interface BalanceReconciliation {
  accountId: string
  accountName: string
  reportedBalance: number
  calculatedBalance: number
  difference: number
  isBalanced: boolean
  pendingItemsCount: number
  pendingItemsAmount: number
}

export interface StatementItemFilters {
  accountId?: string
  sessionId?: string
  status?: StatementItemStatus
  startDate?: string
  endDate?: string
  page?: number
  limit?: number
}

// ─── MCP / Identity integrations ─────────────────────────────────────────────

export interface IdentityIntegrationListItem {
  id: string
  name: string
  description: string | null
  keycloakClientId: string
  role: Role
  status: 'ACTIVE' | 'INACTIVE'
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface IdentityIntegrationCreated {
  integration: IdentityIntegrationListItem
  clientId: string
  clientSecret: string
}

export interface IdentityIntegrationRotatedSecret {
  integrationId: string
  clientId: string
  clientSecret: string
}

/** Resposta de POST /identity/integrations/:id/repair-oauth */
export interface IdentityIntegrationOauthRepaired {
  keycloakClientId: string
}

export interface CreateIdentityIntegrationInput {
  name: string
  description?: string
  role: Role
}

export interface UpdateIdentityIntegrationInput {
  status: 'ACTIVE' | 'INACTIVE'
}

export interface IdentityMetadata {
  issuer: string
  realm: string
  authorizationEndpoint: string
  tokenEndpoint: string
  jwksUri: string
  endSessionEndpoint: string
  webClientId: string
  mcpClientId: string
  mcpEndpoint: string
  /** Identificador canónico do recurso MCP (RFC 8707); deve coincidir com o claim `aud` nos tokens ChatGPT. */
  mcpResourceIdentifier: string
  /** URL do documento `/.well-known/oauth-protected-resource` servido pelo MCP. */
  oauthProtectedResourceMetadataUrl: string
}

export interface ManagedIdentityClient {
  clientId: string
  kind: 'web' | 'mcp' | 'identity-admin' | 'integration'
  status: 'ACTIVE' | 'INACTIVE'
  familyId: string | null
  integrationId: string | null
  name: string
}

export interface IdentityClientsResponse {
  clients: ManagedIdentityClient[]
}

/** Resposta de POST /identity/client-credentials (OAuth2 client_credentials via Keycloak). */
export interface IdentityClientCredentialsToken {
  accessToken: string
  expiresIn: number
  tokenType: string
}

export interface IdentityClientCredentialsInput {
  clientId: string
  clientSecret: string
}

// ─── BRL money (input mascarado vs número canônico) ───────────────────────────

export {
  centsToReaisNumber,
  formatBrlMoneyInputFromReais,
  normalizeReaisForApi,
  parseBrlMoneyStringToCents,
  reaisNumberToCents,
} from './money-brl'

// ─── API Error ────────────────────────────────────────────────────────────────

export interface ApiErrorResponse {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
