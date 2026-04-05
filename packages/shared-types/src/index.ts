// ─── Enums ────────────────────────────────────────────────────────────────────

export type Role = 'ADMIN' | 'MEMBER'
export type AccountType = 'CHECKING' | 'SAVINGS' | 'JOINT' | 'INVESTMENT' | 'CASH'
export type TransactionType = 'INCOME' | 'EXPENSE'
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
  status: TransactionStatus
  amount: number
  description: string
  notes: string | null
  date: string
  source: DraftSource
  transferId: string | null
  creditCardId: string | null
  isRecurring: boolean
  rrule: string | null
  confirmedAt: string | null
  createdAt: string
  updatedAt: string
  account?: { id: string; name: string; color: string | null }
  category?: { id: string; name: string; type: CategoryType } | null
  createdBy?: { id: string; name: string }
}

export interface CreateTransactionInput {
  accountId: string
  categoryId?: string
  type: TransactionType
  amount: number
  description: string
  notes?: string
  date: string
  source?: DraftSource
  creditCardId?: string
  isRecurring?: boolean
  rrule?: string
}

export interface UpdateTransactionInput {
  accountId?: string
  categoryId?: string
  amount?: number
  description?: string
  notes?: string
  date?: string
}

export interface TransactionFilters {
  status?: TransactionStatus
  type?: TransactionType
  accountId?: string
  categoryId?: string
  startDate?: string
  endDate?: string
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
  paidAt: string | null
  paidFromAccountId: string | null
  createdAt: string
  updatedAt: string
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

// ─── API Error ────────────────────────────────────────────────────────────────

export interface ApiErrorResponse {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
