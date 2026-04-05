import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary/20 text-[#7CFC98] border-primary/40',
        secondary: 'bg-muted text-muted-foreground border-border',
        success: 'bg-[#112417] text-[#8DDBA4] border-[#285E38]',
        destructive: 'bg-[#2A1212] text-[#F08D8D] border-[#7A2A2A]',
        warning: 'bg-[#2B240D] text-[#E3CB67] border-[#7A6416]',
        info: 'bg-[#10202A] text-[#86C3E6] border-[#28546A]',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
