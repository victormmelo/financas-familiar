# Build context: monorepo root
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/mcp/package.json ./apps/mcp/
COPY apps/api/package.json ./apps/api/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY apps/mcp ./apps/mcp
COPY apps/api/prisma ./apps/api/prisma
COPY packages/shared-types ./packages/shared-types
COPY package.json ./
RUN npm run db:generate --workspace=apps/mcp
RUN npm run build --workspace=@financas/shared-types
RUN npm run build --workspace=apps/mcp

FROM node:22-alpine AS runner
WORKDIR /app/apps/mcp
ENV NODE_ENV=production

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared-types/package.json /app/packages/shared-types/package.json
COPY --from=builder /app/packages/shared-types/dist /app/packages/shared-types/dist
COPY --from=builder /app/apps/mcp/dist ./dist

EXPOSE 3002
CMD ["node", "dist/index.js"]
