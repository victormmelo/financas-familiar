import { Worker } from 'bullmq'
import nodemailer from 'nodemailer'
import { redisBullmq } from '../lib/redis.js'
import type { InviteEmailJobData } from './email.queue.js'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'localhost',
  port: Number(process.env.SMTP_PORT) || 1025,
  secure: process.env.SMTP_SECURE === 'true',
  auth:
    process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
})

async function sendInviteEmail(data: InviteEmailJobData) {
  const inviteUrl = `${data.appUrl}/auth/aceitar-convite?token=${data.inviteToken}`

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? 'Finanças Familiar <no-reply@financas-familiar.app>',
    to: data.to,
    subject: `${data.invitedByName} te convidou para a família no Finanças Familiar`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Você foi convidado!</h2>
        <p>
          <strong>${data.invitedByName}</strong> te convidou para fazer parte da família
          <strong>${data.familyName}</strong> no Finanças Familiar.
        </p>
        <p>Clique no botão abaixo para aceitar o convite. O link expira em <strong>48 horas</strong>.</p>
        <a
          href="${inviteUrl}"
          style="
            display: inline-block;
            padding: 12px 24px;
            background: #4f46e5;
            color: #fff;
            text-decoration: none;
            border-radius: 6px;
            font-weight: bold;
          "
        >
          Aceitar convite
        </a>
        <p style="margin-top: 16px; font-size: 12px; color: #666;">
          Ou copie e cole o link: ${inviteUrl}
        </p>
      </div>
    `,
  })
}

export const emailWorker = new Worker<InviteEmailJobData>(
  'email',
  async (job) => {
    await sendInviteEmail(job.data)
  },
  { connection: redisBullmq, concurrency: 5 },
)

emailWorker.on('completed', (job) => {
  console.log(`[EmailWorker] Job ${job.id} concluído — email enviado para ${job.data.to}`)
})

emailWorker.on('failed', (job, err) => {
  console.error(`[EmailWorker] Job ${job?.id} falhou:`, err.message)
})
