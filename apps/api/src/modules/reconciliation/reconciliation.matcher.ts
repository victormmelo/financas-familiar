import { prisma } from '../../lib/prisma.js'
import { Decimal } from '@prisma/client/runtime/library'

interface MatchCandidate {
  id: string
  amount: Decimal
  date: Date
  description: string
  type: string
}

interface StatementItemForMatch {
  id: string
  amount: Decimal
  date: Date
  description: string
  type: string
}

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function descriptionScore(itemDesc: string, txDesc: string): number {
  const a = normalizeText(itemDesc)
  const b = normalizeText(txDesc)

  if (a.includes(b) || b.includes(a)) return 5

  const wordsA = a.split(' ').filter((w) => w.length >= 4)
  const wordsB = new Set(b.split(' ').filter((w) => w.length >= 4))
  const common = wordsA.filter((w) => wordsB.has(w)).length

  return common >= 2 ? 3 : 0
}

function dateDiffDays(a: Date, b: Date): number {
  return Math.abs(Math.round((a.getTime() - b.getTime()) / 86_400_000))
}

export function scoreMatch(item: StatementItemForMatch, tx: MatchCandidate): number {
  let score = 0

  // Amount score (max 50)
  const diff = Math.abs(item.amount.toNumber() - tx.amount.toNumber())
  if (diff === 0) score += 50
  else if (diff <= 0.01) score += 45
  else if (diff / item.amount.toNumber() <= 0.01) score += 30

  // Date score (max 30)
  const daysDiff = dateDiffDays(item.date, tx.date)
  if (daysDiff === 0) score += 30
  else if (daysDiff === 1) score += 25
  else if (daysDiff === 2) score += 18
  else if (daysDiff === 3) score += 10
  // > 3 days: 0

  // Type match (max 15)
  if (item.type === tx.type) score += 15

  // Description similarity (max 5)
  score += descriptionScore(item.description, tx.description)

  return Math.min(score, 100)
}

export async function runAutoMatch(
  familyId: string,
  accountId: string,
  startDate: Date,
  endDate: Date,
): Promise<{ matched: number; unmatched: number; total: number }> {
  // Buffer the date window by 3 days for candidate transactions
  const txStartDate = new Date(startDate)
  txStartDate.setDate(txStartDate.getDate() - 3)
  const txEndDate = new Date(endDate)
  txEndDate.setDate(txEndDate.getDate() + 3)

  const [items, transactions] = await Promise.all([
    prisma.statementItem.findMany({
      where: {
        familyId,
        accountId,
        status: { in: ['PENDING', 'REJECTED'] },
        date: { gte: startDate, lte: endDate },
      },
    }),
    prisma.transaction.findMany({
      where: {
        familyId,
        accountId,
        status: { in: ['CONFIRMED', 'DRAFT'] },
        date: { gte: txStartDate, lte: txEndDate },
      },
    }),
  ])

  if (items.length === 0) return { matched: 0, unmatched: 0, total: 0 }

  // Score all pairs
  type ScoredPair = { itemId: string; txId: string; score: number }
  const scoredPairs: ScoredPair[] = []

  for (const item of items) {
    const candidates = transactions.filter((tx) => dateDiffDays(item.date, tx.date) <= 3)
    for (const tx of candidates) {
      const s = scoreMatch(item, tx)
      if (s >= 70) {
        scoredPairs.push({ itemId: item.id, txId: tx.id, score: s })
      }
    }
  }

  // Sort by score descending to resolve conflicts greedily
  scoredPairs.sort((a, b) => b.score - a.score)

  const usedItemIds = new Set<string>()
  const usedTxIds = new Set<string>()
  const winners: ScoredPair[] = []

  for (const pair of scoredPairs) {
    if (!usedItemIds.has(pair.itemId) && !usedTxIds.has(pair.txId)) {
      winners.push(pair)
      usedItemIds.add(pair.itemId)
      usedTxIds.add(pair.txId)
    }
  }

  // Clear previous suggestions for items being re-matched
  const itemIdsToReset = items
    .filter((i) => !usedItemIds.has(i.id))
    .map((i) => i.id)

  // Apply updates in a transaction
  await prisma.$transaction([
    // Set suggestions for winners
    ...winners.map((w) =>
      prisma.statementItem.update({
        where: { id: w.itemId },
        data: { matchedTransactionId: w.txId, matchScore: w.score },
      }),
    ),
    // Clear stale suggestions
    ...(itemIdsToReset.length > 0
      ? [
          prisma.statementItem.updateMany({
            where: { id: { in: itemIdsToReset }, status: { in: ['PENDING', 'REJECTED'] } },
            data: { matchedTransactionId: null, matchScore: null },
          }),
        ]
      : []),
  ])

  return {
    matched: winners.length,
    unmatched: items.length - winners.length,
    total: items.length,
  }
}
