'use client'

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const Sheet = SheetPrimitive.Root
const SheetTrigger = SheetPrimitive.Trigger
const SheetClose = SheetPrimitive.Close

function SheetPortal(props: SheetPrimitive.DialogPortalProps) {
  return <SheetPrimitive.Portal {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      className={cn('fixed inset-0 z-[91] bg-black/75', className)}
      {...props}
    />
  )
}

const sheetVariants = cva(
  'fixed z-[92] flex flex-col gap-0 border-border bg-[hsl(var(--card))] p-0 shadow-xl outline-none transition-transform duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=closed]:duration-200',
  {
    variants: {
      side: {
        left:
          'inset-y-0 left-0 h-full w-full max-w-[min(100vw,16rem)] border-r data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0',
        right:
          'inset-y-0 right-0 h-full w-full max-w-[min(100vw,16rem)] border-l data-[state=closed]:translate-x-full data-[state=open]:translate-x-0',
      },
    },
    defaultVariants: {
      side: 'left',
    },
  },
)

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  showCloseButton?: boolean
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side, className, children, showCloseButton = true, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {showCloseButton ? (
        <SheetPrimitive.Close
          type="button"
          className="absolute right-2 top-2 z-10 rounded-sm p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Fechar menu"
        >
          <X className="h-5 w-5 shrink-0" aria-hidden />
        </SheetPrimitive.Close>
      ) : null}
      {children}
    </SheetPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = 'SheetContent'

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 border-b border-border', className)} {...props} />
}

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none text-foreground', className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle }
