# Build context: monorepo root
FROM node:22-alpine AS base
WORKDIR /app

# --- deps: install all workspace dependencies ---
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN npm ci

# --- builder: build Next.js app ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY apps/web ./apps/web
COPY packages/shared-types ./packages/shared-types
COPY package.json ./
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* são baked em build time — passe via --build-arg no docker build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build --workspace=apps/web

# --- runner: serve the built app ---
FROM node:22-alpine AS runner
WORKDIR /app/apps/web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/package.json ./package.json
COPY --from=builder /app/apps/web/next.config.ts ./next.config.ts

EXPOSE 3000
CMD ["/app/node_modules/.bin/next", "start"]
