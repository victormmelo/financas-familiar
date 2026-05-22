---
name: frontend-design
description: Usar ao criar ou revisar UI — componentes, páginas, layouts. Garante estética coesa, operacional e consistente com o design system militar do projeto.
---

# Frontend Design — Família Finance
# Design System Operacional / Militar

## 1. Objetivo

Este design system define a linguagem visual da interface com estética **operacional, tática e militar**, priorizando:

- clareza
- robustez
- hierarquia
- leitura rápida
- sensação de controle
- consistência visual
- baixa distração

A proposta transmite: disciplina, precisão, confiabilidade, status operacional, ambiente crítico de monitoramento e execução.

---

## 2. Princípios de design

### Clareza operacional
Toda tela permite leitura rápida. O usuário entende:
- onde está
- o que está acontecendo
- o que exige ação
- o que está normal / em risco

### Função acima do ornamento
Evitar: enfeites, sombras excessivas, gradientes chamativos, ilustrações decorativas.

### Hierarquia rígida
1. item crítico
2. item importante
3. item secundário
4. item contextual

### Consistência extrema
Mesma ação → mesmo padrão de cor, posição, ícone, texto, comportamento.

### Ambiência de comando
A interface parece um ambiente de comando e monitoramento, não uma landing page.

---

## 3. Paleta de cores

### Variáveis CSS (shadcn/Tailwind 4)
Os tokens mapeiam direto para as variáveis semânticas usadas nos componentes:

```css
/* Backgrounds */
--background: 120 19% 6%;        /* #0B0F0B — base da aplicação */
--card: 120 13% 9%;              /* #121812 — superfície de cards */
--popover: 120 12% 11%;          /* #182018 — dropdowns, popovers */
--muted: 120 8% 10%;             /* #171D17 — áreas neutras */
--accent: 120 13% 14%;           /* #1E281E — hover discreto */

/* Texto */
--foreground: 120 27% 92%;       /* #E7F0E7 — texto primário */
--secondary-foreground: 120 6% 73%; /* #B8C4B8 — texto secundário */
--muted-foreground: 120 5% 52%;  /* #7D8A7D — texto auxiliar */

/* Primário tático */
--primary: 82 40% 30%;           /* #556B2F — verde oliva */
--primary-foreground: 120 27% 92%;

/* Bordas */
--border: 120 10% 25%;           /* #3A463A — borda padrão */
--input: 120 11% 18%;            /* #2A352A — borda de input */

/* Foco */
--ring: 133 96% 74%;             /* #7CFC98 — verde brilhante */
--radius: 0.25rem;               /* 4px — bordas rígidas */

/* Semânticos operacionais (use direto como hex) */
--success-bg: #112417;
--success-border: #285E38;
--success-text: #8DDBA4;

--warning-bg: #2B240D;
--warning-border: #7A6416;
--warning-text: #E3CB67;

--danger-bg: #2A1212;
--danger-border: #7A2A2A;
--danger-text: #F08D8D;

--info-bg: #10202A;
--info-border: #28546A;
--info-text: #86C3E6;

--accent-bright: #7CFC98;
--accent-bright-soft: #63D985;
```

### Regras de uso de cor
- Verde é a cor dominante do sistema
- `#7CFC98` (accent-bright) apenas para: foco, status ativo, highlight operacional
- Amarelo apenas para atenção moderada
- Vermelho apenas para risco, falha ou ação crítica
- Evitar telas com muitas áreas coloridas

### Cores financeiras específicas
```
Receita / positivo:    text-[#8DDBA4]   (success-text)
Despesa / negativo:    text-[#F08D8D]   (danger-text)
Transferência:         text-[#86C3E6]   (info-text)
Warning / orçamento:   text-[#E3CB67]   (warning-text)
```

---

## 4. Tipografia

### Fontes
- **UI principal**: IBM Plex Sans (400/500/600/700)
- **Dados, IDs, valores, logs**: JetBrains Mono (400/500)

### Escala
```
Título de página:     text-2xl font-semibold tracking-tight
Subtítulo de seção:   text-lg font-medium
Label operacional:    text-sm font-medium uppercase tracking-wide
Valores monetários:   font-mono text-lg tabular-nums
Texto auxiliar:       text-sm text-muted-foreground
Tags / badges:        text-[10px] font-semibold uppercase tracking-wide
```

### Regras
- Valores monetários SEMPRE em `font-mono tabular-nums`
- IDs, protocolos, timestamps → `font-mono`
- Caixa alta com moderação: tags, status, títulos de bloco, botões críticos
- Dados numéricos alinhados à direita em tabelas

### Tom de linguagem (microcopy)
```
❌ "Clique aqui para verificar sua solicitação"
✅ "VERIFICAR SOLICITAÇÃO"

❌ "Tivemos um pequeno problema ao processar sua operação"
✅ "FALHA NO PROCESSAMENTO"

❌ "Nenhuma transação foi encontrada ainda"
✅ "Nenhum lançamento registrado"
```

---

## 5. Border radius & bordas

```
rounded-[2px]  → elementos muito compactos
rounded-sm     → padrão do sistema (4px)
rounded-md     → apenas modais/drawers (6px)
```

**Regra**: usar `rounded-sm` como padrão. Evitar `rounded-xl`, `rounded-2xl`, `rounded-full` em cards e botões.
Priorizar bordas sobre sombras para separar elementos.

Sombras: apenas para dropdowns, modais e command panels flutuantes.

---

## 6. Espaçamento

Interfaces operacionais → densidade controlada. Cards respiram, mas permanecem compactos.

```
Gap entre seções de página:  gap-8 ou space-y-8
Gap entre cards:              gap-4 ou gap-6
Padding interno de card:      p-4 ou p-6
Gap entre elementos de form:  space-y-4
Gap entre botões:             gap-2
```

---

## 7. Componentes

### Card de valor operacional
```tsx
<div className="flex flex-col gap-1">
  <span className="text-xs text-muted-foreground uppercase tracking-wide">Saldo total</span>
  <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
    {formatCurrency(balance)}
  </span>
</div>
```

### Badge de status (operacional)
```tsx
const statusConfig = {
  DRAFT:     { label: 'RASCUNHO',   className: 'bg-[#2B240D] text-[#E3CB67] border border-[#7A6416]' },
  CONFIRMED: { label: 'CONFIRMADO', className: 'bg-[#112417] text-[#8DDBA4] border border-[#285E38]' },
  DELETED:   { label: 'EXCLUÍDO',   className: 'bg-[#2A1212] text-[#F08D8D] border border-[#7A2A2A]' },
}
// Aplicar com: rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide
```

### Valor com sinal
```tsx
function AmountDisplay({ amount, type }: { amount: number; type: 'income' | 'expense' | 'transfer' }) {
  const config = {
    income:   { prefix: '+', className: 'text-[#8DDBA4]' },
    expense:  { prefix: '-', className: 'text-[#F08D8D]' },
    transfer: { prefix: '↔', className: 'text-[#86C3E6]' },
  }[type]

  return (
    <span className={cn('font-mono tabular-nums', config.className)}>
      {config.prefix} {formatCurrency(Math.abs(amount))}
    </span>
  )
}
```

### Layout de página padrão
```tsx
export default function Page() {
  return (
    <div className="flex flex-col gap-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Transações</h1>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mt-0.5">
            Monitoramento de lançamentos
          </p>
        </div>
        <Button>Nova transação</Button>
      </div>
      <div className="grid gap-4">
        {/* ... */}
      </div>
    </div>
  )
}
```

### Loading states
Sempre usar skeletons — nunca spinner solto:
```tsx
import { Skeleton } from '@/components/ui/skeleton'

function TransacaoCardSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 border border-border rounded-sm">
      <Skeleton className="h-8 w-8 rounded-sm" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-4 w-20" />
    </div>
  )
}
```

### Estados vazios
```tsx
<div className="flex flex-col items-center gap-3 py-12 text-center">
  <div className="rounded-sm bg-muted p-4 border border-border">
    <Receipt className="h-5 w-5 text-muted-foreground" />
  </div>
  <div>
    <p className="text-sm font-medium text-foreground">Nenhum lançamento registrado</p>
    <p className="text-xs text-muted-foreground mt-1">Adicione o primeiro lançamento para começar</p>
  </div>
  <Button variant="outline" size="sm">Registrar lançamento</Button>
</div>
```

---

## 8. Navegação — Sidebar

### Item ativo (indicador lateral)
```tsx
'bg-[#1E281E] text-[#7CFC98] border-l-2 border-[#7CFC98] rounded-r-sm'
```

### Item inativo
```tsx
'text-muted-foreground hover:bg-accent hover:text-foreground rounded-sm transition-colors'
```

---

## 9. Botões

### Variantes
```
default     → bg-primary text-primary-foreground hover:bg-primary/90 (verde oliva)
secondary   → bg-secondary text-secondary-foreground border border-border hover:bg-accent
outline     → border border-border bg-background hover:bg-accent hover:text-accent-foreground
ghost       → hover:bg-accent hover:text-accent-foreground
destructive → bg-[#2A1212] border border-[#7A2A2A] text-[#F08D8D] hover:bg-[#3A1A1A]
```

### Regras
- Base sempre `rounded-sm` (nunca `rounded-md` ou maior em botões)
- Verbos diretos nos rótulos: SALVAR / PROCESSAR / VALIDAR / CANCELAR

---

## 10. Badges / Tags de status

Padrão: `rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border`

```
ATIVO        → success variant  (bg-[#112417] text-[#8DDBA4] border-[#285E38])
EM FILA      → warning variant  (bg-[#2B240D] text-[#E3CB67] border-[#7A6416])
PROCESSANDO  → info variant     (bg-[#10202A] text-[#86C3E6] border-[#28546A])
FALHA        → destructive      (bg-[#2A1212] text-[#F08D8D] border-[#7A2A2A])
PENDENTE     → default          (bg-primary/20 text-[#7CFC98] border-primary/40)
```

---

## 11. Tabelas

- Cabeçalho: `text-xs text-muted-foreground uppercase tracking-wide`
- Linhas: separação por `border-b border-border`
- Hover: `hover:bg-accent/50`
- Valores numéricos: `font-mono tabular-nums text-right`
- Timestamps: `font-mono text-xs text-muted-foreground`

---

## 12. Alertas / Toasts

```
Sucesso → bg-[#112417] border border-[#285E38] text-[#8DDBA4]
Erro    → bg-[#2A1212] border border-[#7A2A2A] text-[#F08D8D]
Alerta  → bg-[#2B240D] border border-[#7A6416] text-[#E3CB67]
Info    → bg-[#10202A] border border-[#28546A] text-[#86C3E6]
```

---

## 13. Gráficos (Recharts)

```
Receita / normal:      #8DDBA4
Despesa:               #F08D8D
Transferência / info:  #86C3E6
Atenção moderada:      #E3CB67
Baseline / contexto:   #3A463A
```

- Grid: `stroke="#2A352A"` discreto
- Tooltip: `bg-[#182018] border border-[#3A463A]`
- Sem animações longas

---

## 14. O que evitar

- glassmorphism
- bordas muito arredondadas (`rounded-xl`, `rounded-2xl`, `rounded-full` em cards/botões)
- paleta vibrante demais
- fundo claro ou branco
- gradientes coloridos
- fontes decorativas
- muitas sombras
- animações longas
- texto excessivamente conversacional
- visual "gamificado" ou "startup"

---

## 15. Fórmula central

> **fundo escuro + grid rígido + verde tático + tipografia firme + estados claros + linguagem objetiva**
