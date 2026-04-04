'use client'

import { Dialog, DialogBody, DialogFooter, DialogHeader } from './dialog'
import { Button } from './button'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  isLoading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  isLoading,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} className="max-w-sm">
      <DialogHeader title={title} onClose={onClose} />
      <DialogBody>
        <p className="text-sm text-gray-600">{description}</p>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isLoading}>
          Cancelar
        </Button>
        <Button variant="destructive" onClick={onConfirm} isLoading={isLoading}>
          Confirmar
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
