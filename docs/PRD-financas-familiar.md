# PRD — Família Finance v1.1

## Visão Geral

Família Finance é um aplicativo de finanças pessoais projetado para famílias que compartilham finanças. Ele oferece controle centralizado de contas, transações, cartões de crédito, metas e orçamentos, com suporte a inteligência artificial para entrada de dados e Open Finance para sincronização automática.

## Problema

- Famílias não têm uma ferramenta única que permita visibilidade compartilhada das finanças sem perder privacidade individual
- Lançamentos manuais são trabalhosos e propensos a erro; importações via OFX/CSV são fragmentadas e sem contexto

## Solução

Um monorepo fullstack com API Fastify + Next.js que permite múltiplos membros de uma família gerenciarem finanças conjuntas com papéis distintos (ADMIN / MEMBER), entrada via IA (texto, voz, foto de recibo) e reconciliação automática via Open Finance.

## Papéis e Permissões

| Papel  | Descrição |
|--------|-----------|
| ADMIN  | Cria a família, convida membros, gerencia categorias globais, vê tudo |
| MEMBER | Acessa contas e transações conforme permissões concedidas pelo ADMIN |

## Regras de Negócio

### RN-01 — Família como tenant
Todos os dados (contas, transações, categorias, metas) pertencem a uma família. Nenhum dado cruza entre famílias.

### RN-02 — Convite por e-mail
Novos membros só entram via convite do ADMIN. O link expira em 48 horas. Um usuário pode pertencer a apenas uma família.

### RN-03 — Fluxo de rascunho (Draft)
Toda transação entra primeiro como DRAFT. O usuário revisa e confirma (status CONFIRMED). Transações deletadas ficam com status DELETED (soft delete).

### RN-04 — Fonte do rascunho (DraftSource)
Cada draft registra sua origem: MANUAL, AI_TEXT, AI_VOICE, AI_RECEIPT, PDF, OFX, CSV, OPEN_FINANCE.

### RN-05 — Transferências internas
Transferências entre contas da mesma família geram dois lançamentos espelhados (débito + crédito) vinculados por transfer_id. Nunca afetam o saldo total da família.

### RN-06 — Cartão de crédito
Gastos no cartão não afetam saldo da conta até o pagamento da fatura. A fatura fecha no dia configurado; o pagamento gera transferência da conta corrente para o cartão.

### RN-07 — Recorrência
Transações recorrentes usam rrule (RFC 5545). Cada ocorrência é um draft independente gerado pelo worker de recorrência.

### RN-08 — Categorias
Categorias são globais para a família (criadas pelo ADMIN) e têm tipo: INCOME, EXPENSE ou BOTH. Subcategorias são suportadas via parent_id.

### RN-09 — Metas
Metas têm valor alvo, data limite e conta vinculada (opcional). O progresso é calculado em tempo real via saldo ou contribuições manuais.

### RN-10 — Orçamentos
Orçamentos são mensais por categoria. Alertas são disparados ao atingir 80% e 100% do limite.

### RN-11 — Relatórios
Relatórios são gerados assincronamente (BullMQ) e disponibilizados via link de download (MinIO/R2). Tipos: DRE mensal, fluxo de caixa, evolução patrimonial.

### RN-12 — Open Finance
Integração via provedor (ex: Pluggy). Transações importadas entram como DRAFT com source=OPEN_FINANCE. O usuário confirma ou descarta.

### RN-13 — IA para entrada de dados
A IA (Claude) interpreta texto livre, áudio transcrito (Whisper) ou foto de recibo (OCR) e retorna um draft estruturado com campos preenchidos e intent classificado.

### RN-14 — Segurança
JWT com access token (15min) + refresh token (7d) armazenado em httpOnly cookie. Refresh rotation com detecção de reuso.

## Módulos v1

1. **Auth & Família** — Registro, login, convite, perfis
2. **Contas** — CRUD de contas bancárias, saldo calculado
3. **Transações** — CRUD com fluxo draft → confirmed
4. **Transferências** — Entre contas da família
5. **Cartões de Crédito** — Gestão de faturas e pagamentos
6. **Categorias** — Hierárquicas, por família
7. **Metas** — Financeiras com progresso
8. **Orçamentos** — Mensais por categoria com alertas

## Módulos v2 (roadmap)

- Investimentos
- Metas infantis (por filho)
- Push notifications
- Widget mobile
- Múltiplos espaços familiares
- Papel Observer (somente leitura)
- Integração com corretoras
