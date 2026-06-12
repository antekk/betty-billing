# ---------- build ----------
FROM oven/bun:1.3-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/

RUN bun install --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/api packages/api

WORKDIR /app/packages/api

# Dummy env so route modules can be imported during page-data collection.
# Real values are injected at runtime by the deployment platform.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build \
    JWT_SECRET=build-time-dummy-secret \
    JWT_REFRESH_SECRET=build-time-dummy-secret \
    ANTHROPIC_API_KEY=sk-ant-build-dummy \
    ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
    bun run build

# ---------- worker (build with: docker build --target worker) ----------
FROM oven/bun:1.3-alpine AS worker
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app /app

WORKDIR /app/packages/api
CMD ["bun", "run", "src/jobs/worker.ts"]

# ---------- runtime (default) ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Monorepo standalone output nests the server under the workspace path
COPY --from=builder /app/packages/api/.next/standalone ./
COPY --from=builder /app/packages/api/.next/static ./packages/api/.next/static
COPY --from=builder /app/packages/api/public ./packages/api/public

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "packages/api/server.js"]
