# Build context: monorepo root
FROM node:22-alpine AS base
WORKDIR /app

# --- deps: install all workspace dependencies ---
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN npm ci

# --- builder: compile TypeScript ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api ./apps/api
COPY packages/shared-types ./packages/shared-types
COPY package.json ./
RUN npm run db:generate
RUN npm run build --workspace=apps/api

# --- runner: minimal production image ---
FROM node:22-alpine AS runner
WORKDIR /app/apps/api
ENV NODE_ENV=production

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma

EXPOSE 3001
CMD ["node", "dist/app.js"]
