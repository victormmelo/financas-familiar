'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Dialog, DialogBody, DialogFooter, DialogHeader } from './dialog'
import { Button } from './button'

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  isLoading?: boolean
  /** `destructive` mantém o padrão histórico (exclusão, ações irreversíveis). */
  variant?: 'neutral' | 'destructive'
  cancelLabel?: string
  confirmLabel?: string
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  isLoading,
  variant = 'destructive',
  cancelLabel = 'Cancelar',
  confirmLabel = 'Confirmar',
}: ConfirmDialogProps) {
  const primaryVariant = variant === 'destructive' ? 'destructive' : 'default'

  return (
    <Dialog open={open} onClose={onClose} className="max-w-sm" preventClose={!!isLoading}>
      <DialogHeader title={title} onClose={onClose} />
      <DialogBody>
        <DialogPrimitive.Description className="text-sm text-muted-foreground">
          {description}
        </DialogPrimitive.Description>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button variant={primaryVariant} onClick={onConfirm} isLoading={isLoading}>
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
