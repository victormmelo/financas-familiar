import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001',
  },
}

export default withSentryConfig(nextConfig, {
  // Suprime logs do Sentry durante o build
  silent: !process.env.CI,
  // Upload de source maps apenas em produção (requer SENTRY_AUTH_TOKEN)
  widenClientFileUpload: true,
  sourcemaps: { disable: true },
  disableLogger: true,
})
