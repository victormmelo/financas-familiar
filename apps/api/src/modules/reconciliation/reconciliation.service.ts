import type { Multipart, MultipartValue } from '@fastify/multipart'
import { parsePlainDate } from '@financas/shared-types'
import { prisma } from '../../lib/prisma.js'
import { calculateBalance } from '../accounts/accounts.service.js'
import { parseOFX } from './reconciliation.parser.ofx.js'
import { parseCSV } from './reconciliation.parser.csv.js'
import { runAutoMatch } from './reconciliation.matcher.js'
import type {
  CreateStatementItemInput,
  ListStatementItemsInput,
  RunMatchingInput,
  AcceptMatchInput,
  ConvertItemInput,
} from './reconciliation.schema.js'

// ─── Import Statement ─────────────────────────────────────────────────────────

export async function importStatement(
  familyId: string,
  userId: string,
  parts: AsyncIterableIterator<Multipart>,
) {
  let accountId: string | undefined
  let fileBuffer: Buffer | undefined
  let fileName: string | undefined

  // Collect multipart fields
  for await (const part of parts) {
    if (part.type === 'field' && part.fieldname === 'accountId') {
      accountId = (part as MultipartValue<string>).value
    }
    if (part.type === 'file') {
      fileName = part.filename
      const chunks: Buffer[] = []
      for await (const chunk of part.file) {
        chunks.push(chunk)
      }
      fileBuffer = Buffer.concat(chunks)
    }
  }

  if (!accountId) throw Object.assign(new Error('accountId é obrigatório'), { statusCode: 400 })
  if (!fileBuffer) throw Object.assign(new Error('Arquivo é obrigatório'), { statusCode: 400 })

  // Verify account belongs to family
  const account = await prisma.account.findFirst({ where: { id: accountId, familyId } })
  if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })

  // Detect file type and parse
  const ext = (fileName ?? '').toLowerCase().split('.').pop() ?? ''
  let rawText: string
  try {
    rawText = fileBuffer.toString('utf-8')
    // Detect latin1 by checking for replacement characters
    if (rawText.includes('\uFFFD')) {
      rawText = fileBuffer.toString('latin1')
    }
  } catch {
    rawText = fileBuffer.toString('latin1')
  }

  let parsedEntries: Array<{
    externalId: string
    type: 'INCOME' | 'EXPENSE'
    amount: number
    description: string
    date: Date
  }> = []
  let startDate: Date | undefined
  let endDate: Date | undefined

  if (ext === 'ofx' || rawText.includes('<OFX>') || rawText.includes('<STMTTRN>')) {
    const result = parseOFX(rawText)
    parsedEntries = result.entries
    startDate = result.startDate
    endDate = result.endDate
  } else {
    parsedEntries = parseCSV(rawText)
  }

  if (parsedEntries.length === 0) {
    throw Object.assign(new Error('Nenhum lançamento encontrado no arquivo'), { statusCode: 422 })
  }

  // Determine date range from entries if not from file header
  if (!startDate || !endDate) {
    const dates = parsedEntries.map((e) => e.date.getTime())
    startDate = new Date(Math.min(...dates))
    endDate = new Date(Math.max(...dates))
  }

  // Create session
  const session = await prisma.reconciliationSession.create({
    data: {
      familyId,
      accountId,
      source: ext === 'ofx' ? 'OFX' : 'CSV',
      fileName: fileName ?? null,
      startDate,
      endDate,
      createdById: userId,
    },
  })

  // Upsert items (idempotent re-imports via externalId+accountId unique constraint)
  let created = 0
  let skipped = 0

  for (const entry of parsedEntries) {
    try {
      await prisma.statementItem.upsert({
        where: { accountId_externalId: { accountId, externalId: entry.externalId } },
        create: {
          familyId,
          accountId,
          sessionId: session.id,
          type: entry.type,
          amount: entry.amount,
          description: entry.description,
          date: entry.date,
          externalId: entry.externalId,
          status: 'PENDING',
        },
        update: {},
      })
      created++
    } catch {
      skipped++
    }
  }

  // Run auto-matching for the session's date range
  const matchResult = await runAutoMatch(familyId, accountId, startDate, endDate)

  return {
    session: { id: session.id, fileName: session.fileName, source: session.source },
    total: parsedEntries.length,
    created,
    skipped,
    matched: matchResult.matched,
  }
}

// ─── Manual Entry ─────────────────────────────────────────────────────────────

export async function createStatementItem(familyId: string, input: CreateStatementItemInput) {
  const account = await prisma.account.findFirst({ where: { id: input.accountId, familyId } })
  if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })

  return prisma.statementItem.create({
    data: {
      familyId,
      accountId: input.accountId,
      sessionId: input.sessionId ?? null,
      type: input.type,
      amount: input.amount,
      description: input.description,
      date: parsePlainDate(input.date),
      status: 'PENDING',
    },
    include: {
      account: { select: { id: true, name: true, color: true } },
      matchedTransaction: {
        select: { id: true, description: true, amount: true, date: true, status: true },
      },
    },
  })
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listStatementItems(familyId: string, query: ListStatementItemsInput) {
  const where = {
    familyId,
    ...(query.accountId && { accountId: query.accountId }),
    ...(query.sessionId && { sessionId: query.sessionId }),
    ...(query.status && { status: query.status }),
    ...(query.startDate || query.endDate
      ? {
          date: {
            ...(query.startDate && { gte: parsePlainDate(query.startDate) }),
            ...(query.endDate && { lte: parsePlainDate(query.endDate) }),
          },
        }
      : {}),
  }

  const [total, items] = await Promise.all([
    prisma.statementItem.count({ where }),
    prisma.statementItem.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { date: 'desc' },
      include: {
        account: { select: { id: true, name: true, color: true } },
        matchedTransaction: {
          select: { id: true, description: true, amount: true, date: true, status: true },
        },
      },
    }),
  ])

  return {
    data: items,
    meta: {
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
    },
  }
}

// ─── Soft Delete ──────────────────────────────────────────────────────────────

export async function deleteStatementItem(familyId: string, id: string) {
  const item = await prisma.statementItem.findFirst({ where: { id, familyId } })
  if (!item) throw Object.assign(new Error('Item não encontrado'), { statusCode: 404 })

  return prisma.statementItem.update({
    where: { id },
    data: { status: 'IGNORED', ignoredAt: new Date() },
  })
}

// ─── Run Matching ─────────────────────────────────────────────────────────────

export async function runMatching(familyId: string, input: RunMatchingInput) {
  const account = await prisma.account.findFirst({ where: { id: input.accountId, familyId } })
  if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })

  return runAutoMatch(
    familyId,
    input.accountId,
    parsePlainDate(input.startDate),
    parsePlainDate(input.endDate),
  )
}

// ─── Accept Match ─────────────────────────────────────────────────────────────

export async function acceptMatch(familyId: string, itemId: string, input: AcceptMatchInput) {
  const [item, transaction] = await Promise.all([
    prisma.statementItem.findFirst({ where: { id: itemId, familyId } }),
    prisma.transaction.findFirst({ where: { id: input.transactionId, familyId } }),
  ])

  if (!item) throw Object.assign(new Error('Item não encontrado'), { statusCode: 404 })
  if (!transaction) throw Object.assign(new Error('Transação não encontrada'), { statusCode: 404 })
  if (!['PENDING', 'REJECTED'].includes(item.status)) {
    throw Object.assign(
      new Error('Somente itens PENDING ou REJECTED podem ter match aceito'),
      { statusCode: 422 },
    )
  }

  return prisma.statementItem.update({
    where: { id: itemId },
    data: { status: 'MATCHED', matchedTransactionId: input.transactionId },
    include: {
      matchedTransaction: {
        select: { id: true, description: true, amount: true, date: true, status: true },
      },
    },
  })
}

// ─── Reject Match ─────────────────────────────────────────────────────────────

export async function rejectMatch(familyId: string, itemId: string) {
  const item = await prisma.statementItem.findFirst({ where: { id: itemId, familyId } })
  if (!item) throw Object.assign(new Error('Item não encontrado'), { statusCode: 404 })
  if (!item.matchedTransactionId) {
    throw Object.assign(new Error('Item não tem sugestão de match'), { statusCode: 422 })
  }

  return prisma.statementItem.update({
    where: { id: itemId },
    data: { status: 'REJECTED', matchedTransactionId: null, matchScore: null },
  })
}

// ─── Ignore Item ──────────────────────────────────────────────────────────────

export async function ignoreItem(familyId: string, itemId: string) {
  const item = await prisma.statementItem.findFirst({ where: { id: itemId, familyId } })
  if (!item) throw Object.assign(new Error('Item não encontrado'), { statusCode: 404 })

  return prisma.statementItem.update({
    where: { id: itemId },
    data: { status: 'IGNORED', ignoredAt: new Date() },
  })
}

// ─── Convert to Transaction ───────────────────────────────────────────────────

export async function convertItem(
  familyId: string,
  userId: string,
  itemId: string,
  input: ConvertItemInput,
) {
  const item = await prisma.statementItem.findFirst({ where: { id: itemId, familyId } })
  if (!item) throw Object.assign(new Error('Item não encontrado'), { statusCode: 404 })
  if (!['PENDING', 'REJECTED'].includes(item.status)) {
    throw Object.assign(
      new Error('Somente itens PENDING ou REJECTED podem ser convertidos'),
      { statusCode: 422 },
    )
  }

  // Determine DraftSource from session
  let source: 'MANUAL' | 'OFX' | 'CSV' = 'MANUAL'
  if (item.sessionId) {
    const session = await prisma.reconciliationSession.findUnique({
      where: { id: item.sessionId },
    })
    if (session?.source === 'OFX') source = 'OFX'
    else if (session?.source === 'CSV') source = 'CSV'
  }

  if (input.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, familyId },
      include: { _count: { select: { subcategories: true } } },
    })
    if (!category) throw Object.assign(new Error('Categoria não encontrada'), { statusCode: 404 })
    if (category._count.subcategories > 0) {
      throw Object.assign(
        new Error('Categorias agrupadoras não recebem lançamento. Use uma subcategoria.'),
        { statusCode: 422 },
      )
    }
  }

  const transaction = await prisma.transaction.create({
    data: {
      familyId,
      accountId: item.accountId,
      createdById: userId,
      categoryId: input.categoryId ?? null,
      type: item.type,
      nature: 'NORMAL',
      linkedTransactionId: null,
      status: 'DRAFT',
      amount: item.amount,
      description: input.description ?? item.description,
      notes: input.notes ?? null,
      date: item.date,
      source,
    },
  })

  await prisma.statementItem.update({
    where: { id: itemId },
    data: {
      status: 'CONVERTED',
      convertedAt: new Date(),
      matchedTransactionId: transaction.id,
    },
  })

  return transaction
}

// ─── Balance Summary ──────────────────────────────────────────────────────────

export async function getBalanceSummary(
  familyId: string,
  accountId: string,
  reportedBalance: number,
) {
  const account = await prisma.account.findFirst({ where: { id: accountId, familyId } })
  if (!account) throw Object.assign(new Error('Conta não encontrada'), { statusCode: 404 })

  const [calculatedBalance, pendingStats] = await Promise.all([
    calculateBalance(accountId),
    prisma.statementItem.aggregate({
      where: { familyId, accountId, status: 'PENDING' },
      _count: { id: true },
      _sum: { amount: true },
    }),
  ])

  const difference = reportedBalance - calculatedBalance
  const pendingItemsAmount = pendingStats._sum.amount?.toNumber() ?? 0

  return {
    accountId,
    accountName: account.name,
    reportedBalance,
    calculatedBalance,
    difference: parseFloat(difference.toFixed(2)),
    isBalanced: Math.abs(difference) < 0.01,
    pendingItemsCount: pendingStats._count.id,
    pendingItemsAmount,
  }
}
