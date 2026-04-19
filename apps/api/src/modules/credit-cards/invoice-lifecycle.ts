export type InvoiceLifecycleStatus =
  | 'OPEN'
  | 'CLOSED'
  | 'PARTIAL'
  | 'OVERDUE'
  | 'RENEGOTIATED'
  | 'PAID'

export const INVOICE_PERMISSION_MATRIX: Record<
  InvoiceLifecycleStatus,
  {
    canEditFinancial: boolean
    canPay: boolean
    canNegotiate: boolean
    canManualClose: boolean
    canReopen: boolean
  }
> = {
  OPEN: {
    canEditFinancial: true,
    canPay: true,
    canNegotiate: true,
    canManualClose: true,
    canReopen: false,
  },
  CLOSED: {
    canEditFinancial: false,
    canPay: false,
    canNegotiate: false,
    canManualClose: false,
    canReopen: true,
  },
  PARTIAL: {
    canEditFinancial: true,
    canPay: true,
    canNegotiate: true,
    canManualClose: false,
    canReopen: false,
  },
  OVERDUE: {
    canEditFinancial: true,
    canPay: true,
    canNegotiate: true,
    canManualClose: false,
    canReopen: false,
  },
  RENEGOTIATED: {
    canEditFinancial: false,
    canPay: false,
    canNegotiate: false,
    canManualClose: false,
    canReopen: true,
  },
  PAID: {
    canEditFinancial: false,
    canPay: false,
    canNegotiate: false,
    canManualClose: false,
    canReopen: false,
  },
}

export function canEditFinancialForInvoice(status: InvoiceLifecycleStatus): boolean {
  return INVOICE_PERMISSION_MATRIX[status].canEditFinancial
}

export function canReopenInvoice(status: InvoiceLifecycleStatus): boolean {
  return INVOICE_PERMISSION_MATRIX[status].canReopen
}
