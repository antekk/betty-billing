# Betty Billing

## Getting Started

```bash
# Start infrastructure
docker-compose up -d                    # Postgres + Redis
cp .env.example .env                    # Fill in secrets

# Setup database
bun run db:generate && bun run db:migrate  # Create tables
bun run packages/api/src/scripts/import-fee-codes.ts  # Import SOMB data

# Run development servers
bun run dev:api                         # Start API on :3000
bun run dev:mobile                      # Start Expo dev server
```
