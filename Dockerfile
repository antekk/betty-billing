# ---------- build ----------
FROM oven/bun:1.1-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/

RUN bun install --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/api packages/api

WORKDIR /app/packages/api
RUN bun run build

# ---------- runtime ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/packages/api/.next/standalone ./
COPY --from=builder /app/packages/api/.next/static ./.next/static
COPY --from=builder /app/packages/api/public ./public 2>/dev/null || true

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
