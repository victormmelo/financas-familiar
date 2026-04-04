---
name: frontend-design
description: Usar ao criar ou revisar UI — componentes, páginas, layouts. Garante estética coesa, não-genérica, consistente com o design system do projeto.
---

# Frontend Design — Família Finance

## Princípios

O app é um **produto financeiro pessoal** — deve transmitir confiança, clareza e leveza.
Evitar: visual "AI slop" genérico, branco puro sem hierarquia, excesso de cores, animações desnecessárias.

## Tokens de design (Tailwind 4 + shadcn)

Sempre usar variáveis semânticas do shadcn — nunca cores hardcoded:
```
background, foreground
card, card-foreground
primary, primary-foreground
secondary, secondary-foreground
muted, muted-foreground
accent, accent-foreground
destructive
border, input, ring
```

**Cores financeiras específicas:**
```css
/* Positivo / receita / lucro */
text-emerald-600 dark:text-emerald-400

/* Negativo / despesa / perda */
text-rose-600 dark:text-rose-400

/* Neutro / transferência */
text-sky-600 dark:text-sky-400

/* Warning / alerta de orçamento */
text-amber-600 dark:text-amber-400
```

## Tipografia

```
Títulos de página:    text-2xl font-semibold tracking-tight
Subtítulos de seção:  text-lg font-medium
Labels de form:       text-sm font-medium
Valores monetários:   font-mono text-lg (tabular-nums)
Texto auxiliar:       text-sm text-muted-foreground
```

Valores monetários SEMPRE em `font-mono` com `tabular-nums` para alinhamento visual.

## Hierarquia de espaçamento

```
Gap entre seções de página:  gap-8 ou space-y-8
Gap entre cards:              gap-4 ou gap-6
Padding interno de card:      p-6
Gap entre elementos de form:  space-y-4
Gap entre botões:             gap-2
```

## Componentes financeiros

### Card de valor
```tsx
<div className="flex flex-col gap-1">
  <span className="text-sm text-muted-foreground">Saldo total</span>
  <span className="font-mono text-2xl font-semibold tabular-nums">
    {formatCurrency(balance)}
  </span>
</div>
```

### Badge de status de transação
```tsx
const statusConfig = {
  DRAFT:     { label: 'Rascunho',   className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30' },
  CONFIRMED: { label: 'Confirmado', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30' },
  DELETED:   { label: 'Excluído',   className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30' },
}
```

### Valor com sinal
```tsx
function AmountDisplay({ amount, type }: { amount: number; type: 'income' | 'expense' | 'transfer' }) {
  const config = {
    income:   { prefix: '+', className: 'text-emerald-600 dark:text-emerald-400' },
    expense:  { prefix: '-', className: 'text-rose-600 dark:text-rose-400' },
    transfer: { prefix: '↔', className: 'text-sky-600 dark:text-sky-400' },
  }[type]

  return (
    <span className={cn('font-mono tabular-nums', config.className)}>
      {config.prefix} {formatCurrency(Math.abs(amount))}
    </span>
  )
}
```

## Layout de página padrão

```tsx
export default function Page() {
  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Cabeçalho da página */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Transações</h1>
          <p className="text-sm text-muted-foreground">Gerencie seus lançamentos</p>
        </div>
        <Button>Nova transação</Button>
      </div>

      {/* Conteúdo */}
      <div className="grid gap-4">
        {/* ... */}
      </div>
    </div>
  )
}
```

## Loading states

Sempre usar skeletons — nunca spinner solto no meio da página:
```tsx
import { Skeleton } from '@/components/ui/skeleton'

function TransacaoCardSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-5 w-20" />
    </div>
  )
}
```

## Estados vazios

Nunca deixar área em branco — sempre um empty state claro:
```tsx
<div className="flex flex-col items-center gap-3 py-12 text-center">
  <div className="rounded-full bg-muted p-4">
    <Receipt className="h-6 w-6 text-muted-foreground" />
  </div>
  <div>
    <p className="font-medium">Nenhuma transação ainda</p>
    <p className="text-sm text-muted-foreground">Adicione seu primeiro lançamento</p>
  </div>
  <Button variant="outline" size="sm">Adicionar transação</Button>
</div>
```

## Dark mode

Tailwind com `dark:` — sempre especificar variante dark para cores customizadas.
Cores semânticas do shadcn (`text-foreground`, `bg-card` etc.) já funcionam automaticamente.
