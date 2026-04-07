import { config as loadEnv } from 'dotenv'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

/** Carrega `.env` da raiz do monorepo (cwd costuma ser `apps/mcp` no `npm run dev`). */
function loadDotenvFromAncestors(): void {
  const found: string[] = []
  let dir = process.cwd()
  for (let i = 0; i < 8; i++) {
    const p = resolve(dir, '.env')
    if (existsSync(p)) found.push(p)
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  for (let i = found.length - 1; i >= 0; i--) {
    loadEnv({ path: found[i]!, override: true })
  }
}

loadDotenvFromAncestors()
