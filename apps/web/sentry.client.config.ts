import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Rastreia 10% das sessões em produção para Session Replay
  replaysSessionSampleRate: 0.1,
  // Rastreia 100% das sessões com erro
  replaysOnErrorSampleRate: 1.0,

  integrations: [Sentry.replayIntegration()],

  // Desabilita em desenvolvimento para não poluir o dashboard
  enabled: process.env.NODE_ENV === 'production',
})
