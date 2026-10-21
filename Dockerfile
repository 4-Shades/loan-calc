# syntax=docker/dockerfile:1
# Multi-stage build (SRS §3.5.2): deps → builder → runner, plus a one-shot migrator.

ARG NODE_IMAGE=node:24.22.0-alpine

# Stage 1 (deps): install node_modules from the lockfile only, for layer caching.
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Stage 2 (builder): generate the Prisma client and build the standalone Next.js server.
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# Migrator: applies prisma/migrations, then exits. docker-compose runs it before the app.
FROM builder AS migrator
CMD ["npx", "prisma", "migrate", "deploy"]

# Stage 3 (runner): minimal image with only the traced server files, run as a non-root user.
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
