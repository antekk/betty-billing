# Betty Billing

Betty is a mobile-first AI billing assistant for fee-for-service physicians in Alberta. The chat timeline **is** the app: fee-code questions, natural-language claim creation, confirmation widgets, and proactive follow-ups all live in one conversation. See [docs/betty-PRD-v1.md](docs/betty-PRD-v1.md) for the product spec.

## Stack

- **Next.js 15** (App Router) — mobile-friendly web UI + API routes in `packages/api`
- **PostgreSQL** via Drizzle ORM; **Redis + BullMQ** for the batch submission worker
- **Claude** (Anthropic API) with tool calling for Betty's conversational layer
- **Bun** as runtime, package manager, and test runner
- `packages/shared` — types, constants, and validation shared across packages

## Getting Started

```bash
# Prereqs: bun >= 1.3, docker
bun install

# Start infrastructure (Postgres + Redis)
docker-compose up -d
cp .env.example .env                    # fill in ANTHROPIC_API_KEY etc.

# Set up the database
bun run db:migrate                      # apply committed migrations
bun run db:seed                         # import SOMB fee/diagnostic codes

# Run development servers
bun run dev:api                         # Next.js app on :3000
bun run dev:worker                      # BullMQ batch worker (schedules itself)
```

Auth uses SMS OTP. With `SMS_PROVIDER=mock` (the default) the code is printed to the API server console — watch the logs after requesting a code.

## Development

```bash
bun run check        # lint + format check + typecheck
bun run test         # all test suites
bun run db:generate  # regenerate migrations after schema changes (commit them)
```

## How claims flow

1. Physician types e.g. `03.01AA for Uli 1111111119 on Monday` — Betty validates (PHN check digit, fee code, date) and presents a confirmation widget.
2. Confirm stages the claim; the hourly worker batches staged claims to the AHCIP adapter (mocked in v1).
3. Rejected claims produce a proactive action card; Betty proposes a fix via an update widget the physician applies with one tap.

## Deployment

See [DEPLOY.md](DEPLOY.md) for the GCP Cloud Run setup.
