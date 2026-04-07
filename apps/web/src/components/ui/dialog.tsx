'use client'

import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type DialogSize = 'sm' | 'md' | 'lg'

const sizeMaxWidth: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

interface DialogContextValue {
  preventClose: boolean
  onRequestClose: () => void
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

function useDialogContext(component: string): DialogContextValue {
  const ctx = React.useContext(DialogContext)
  if (!ctx) {
    throw new Error(`${component} must be used within Dialog`)
  }
  return ctx
}

export interface DialogProps {
  open: boolean
  /** Fecha o modal (overlay, Escape, botão X). */
  onClose: () => void
  children: React.ReactNode
  className?: string
  /**
   * Quando `true`, bloqueia fechamento por overlay, Escape e pelo X.
   * Use durante `isSubmitting`, mutations ou outras operações críticas para evitar perda de dados.
   */
  preventClose?: boolean
  /** Largura máxima padrão do painel; `className` pode sobrescrever `max-w-*` (tailwind-merge). */
  size?: DialogSize
}

export function Dialog({
  open,
  onClose,
  children,
  className,
  preventClose = false,
  size,
}: DialogProps) {
  const onOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) return
      if (preventClose) return
      onClose()
    },
    [preventClose, onClose],
  )

  const onRequestClose = React.useCallback(() => {
    if (!preventClose) onClose()
  }, [preventClose, onClose])

  const ctx = React.useMemo(
    () => ({ preventClose, onRequestClose }),
    [preventClose, onRequestClose],
  )

  const maxW = size ? sizeMaxWidth[size] : 'max-w-lg'

  return (
    <DialogContext.Provider value={ctx}>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/75" />
          <DialogPrimitive.Content
            onInteractOutside={(e) => {
              if (preventClose) e.preventDefault()
            }}
            onEscapeKeyDown={(e) => {
              if (preventClose) e.preventDefault()
            }}
            className={cn(
              'fixed left-1/2 top-1/2 z-[91] flex w-full max-h-[90vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border p-0 text-card-foreground shadow-2xl outline-none',
              /* hsl(var(--card)) garante fundo opaco mesmo se o token Tailwind `bg-card` não resolver no v4 */
              'bg-[hsl(var(--card))]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              maxW,
              'mx-4',
              className,
            )}
          >
            {children}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </DialogContext.Provider>
  )
}

interface DialogHeaderProps {
  title: string
  /** Mantido na API por compatibilidade; o fechamento respeita `preventClose` do `Dialog` via contexto. */
  onClose: () => void
}

export function DialogHeader({ title, onClose: _onClose }: DialogHeaderProps) {
  const { preventClose, onRequestClose } = useDialogContext('DialogHeader')

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-[hsl(var(--card))] p-6">
      <DialogPrimitive.Title className="text-lg font-semibold text-card-foreground">
        {title}
      </DialogPrimitive.Title>
      <button
        type="button"
        disabled={preventClose}
        aria-disabled={preventClose}
        onClick={() => onRequestClose()}
        className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      >
        <X className="h-5 w-5" aria-hidden />
        <span className="sr-only">Fechar</span>
      </button>
    </div>
  )
}

export function DialogBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto bg-[hsl(var(--card))] p-6', className)}>
      {children}
    </div>
  )
}

export function DialogFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border bg-[hsl(var(--card))] px-6 py-4">
      {children}
    </div>
  )
}
