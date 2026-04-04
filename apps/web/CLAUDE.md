# Frontend — apps/web

Next.js 15 (App Router) + TypeScript 5 + Tailwind 4 + shadcn/ui + TanStack Query 5

## Comandos
```bash
npm run dev        # inicia em :3000 com hot reload
npm run build      # build de produção
npm run typecheck  # verifica tipos
npm run lint       # ESLint
```

## Estrutura de pastas
```
src/
├── app/              — rotas Next.js (App Router)
│   ├── auth/         — login, cadastro (públicas)
│   └── app/          — área autenticada (protected layout)
├── components/
│   ├── ui/           — componentes shadcn/ui (NÃO editar diretamente)
│   ├── forms/        — formulários com React Hook Form
│   ├── charts/       — gráficos Recharts
│   └── layout/       — header, sidebar, shell
├── hooks/            — hooks customizados (useTransactions, useAccounts...)
├── lib/
│   ├── api.ts        — cliente HTTP (fetch wrapper com auth)
│   └── utils.ts      — utilitários gerais
└── stores/           — Zustand stores (estado global de UI)
```

## Regras obrigatórias Next.js

**Server vs Client**
- Por padrão toda página/componente é Server Component
- Usar `'use client'` APENAS quando necessário: interatividade, hooks, eventos
- Nunca buscar dados da API dentro de Client Components diretamente — usar Server Components ou TanStack Query
- Dados sensíveis (tokens, env secrets) NUNCA chegam ao bundle do client

**Roteamento e layouts**
- Usar `layout.tsx` para shells compartilhados (sidebar, header)
- Usar `loading.tsx` para Suspense boundaries automáticos
- Usar `error.tsx` para error boundaries por rota
- Parâmetros de rota sempre tipados com `PageProps`

**Formulários**
- SEMPRE React Hook Form + Zod — nunca estado manual para formulários
- Schema Zod importado de `packages/shared-types` quando possível
- Submit desabilitado enquanto `isSubmitting`

**Estado**
- Server state (dados da API): TanStack Query — nunca Zustand para isso
- UI state (modais, sidebar aberta, filtros): Zustand
- Estado de formulário: React Hook Form
- Nunca misturar responsabilidades

## Antes de criar qualquer componente
1. Verifique se já existe em `components/ui/` (shadcn)
2. Verifique se já existe em `components/forms/`, `components/charts/` ou `components/layout/`
3. Verifique se existe em `packages/ui/`
4. Só então crie um novo — e coloque na pasta correta

## Consulte as skills para:
- Criar novo componente ou adaptar shadcn/ui: @.claude/skills/frontend-patterns/SKILL.md
- Design visual e estética: @.claude/skills/frontend-design/SKILL.md
- Integração com a API (queries, mutations, auth): @.claude/skills/api-contract/SKILL.md
