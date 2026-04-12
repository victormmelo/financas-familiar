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
# Garante `public/` para o COPY no runner (projeto pode não ter a pasta no repo)
RUN mkdir -p apps/web/public
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* e Auth.js — bake em build time (docker build --build-arg …)
# Sem default, ARG vazio embute URL vazia no cliente e o fetch vira /accounts no :3000 (404).
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG AUTH_SECRET
ENV AUTH_SECRET=$AUTH_SECRET
ARG AUTH_URL
ENV AUTH_URL=$AUTH_URL
ARG NEXTAUTH_URL
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ARG NEXTAUTH_URL_INTERNAL
ENV NEXTAUTH_URL_INTERNAL=$NEXTAUTH_URL_INTERNAL
ARG AUTH_TRUST_HOST
ENV AUTH_TRUST_HOST=$AUTH_TRUST_HOST
ARG AUTH_KEYCLOAK_ID
ENV AUTH_KEYCLOAK_ID=$AUTH_KEYCLOAK_ID
ARG AUTH_KEYCLOAK_SECRET
ENV AUTH_KEYCLOAK_SECRET=$AUTH_KEYCLOAK_SECRET
ARG AUTH_KEYCLOAK_ISSUER
ENV AUTH_KEYCLOAK_ISSUER=$AUTH_KEYCLOAK_ISSUER
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
