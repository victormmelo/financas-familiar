import { prisma } from '../../lib/prisma.js'
import { reportsQueue } from '../../jobs/reports.queue.js'
import type { CreateReportInput, ListReportsInput } from './reports.schema.js'

export async function listReports(familyId: string, query: ListReportsInput) {
  const { page, limit, type, status } = query
  const skip = (page - 1) * limit

  const where = {
    familyId,
    ...(type && { type }),
    ...(status && { status }),
  }

  const [reports, total] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.report.count({ where }),
  ])

  return {
    data: reports,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  }
}

export async function getReport(familyId: string, reportId: string) {
  const report = await prisma.report.findFirst({ where: { id: reportId, familyId } })
  if (!report) throw Object.assign(new Error('Relatório não encontrado'), { statusCode: 404 })
  return report
}

export async function createReport(familyId: string, input: CreateReportInput) {
  const report = await prisma.report.create({
    data: {
      familyId,
      type: input.type,
      status: 'PENDING',
      params: input.params,
    },
  })

  // Dispatch to BullMQ worker for async generation
  await reportsQueue.add(
    'generate-report',
    { reportId: report.id, familyId, type: input.type, params: input.params },
    { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
  )

  return report
}
