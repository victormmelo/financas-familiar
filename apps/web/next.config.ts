import type { NextConfig } from 'next'
import { config as loadRootEnv } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { withSentryConfig } from '@sentry/nextjs'

/** Um único `.env` na raiz do monorepo (Next 15.1.x não suporta `envDir` no config). */
const monorepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
loadRootEnv({ path: path.join(monorepoRoot, '.env') })

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
