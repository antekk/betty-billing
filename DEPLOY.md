# Deploying Betty to GCP

Cloud Run deployment with managed Postgres. Batch submission runs as an hourly
Cloud Run Job (triggered by Cloud Scheduler) — no Redis required. Redis is
optional and only adds cross-instance rate limiting.

## Architecture

```
Internet → Cloud Run (betty-api) → Cloud SQL (Postgres 16)
Cloud Scheduler (hourly) → Cloud Run Job (betty-batch) → Cloud SQL + AHCIP
```

- **Cloud Run** — serverless container, scales to zero when idle
- **Cloud SQL** — managed Postgres (db-f1-micro, cheapest tier)
- **Cloud Run Jobs** — `betty-migrate` (schema; runs before each deploy takes
  traffic) and `betty-batch` (hourly claim submission + stuck-claim recovery)
- **Secret Manager** — stores credentials

The build produces two images (see `cloudbuild.yaml`):

- `betty-api` — the Next.js standalone runtime served by Cloud Run
- `betty-jobs` — full source with bun; used by `betty-migrate` and
  `betty-batch`. It is also the image for the long-lived BullMQ worker
  (`bun run src/jobs/worker.ts`) if you prefer Redis-driven scheduling on a
  platform that supports background processes.

## Prerequisites

1. [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed
2. A GCP project with billing enabled
3. Authenticated: `gcloud auth login`

## Deploy

```bash
export GCP_PROJECT_ID=your-project-id
export ANTHROPIC_API_KEY=sk-ant-...

# Optional overrides
export GCP_REGION=northamerica-northeast1   # default: Montreal

# Real SMS delivery (REQUIRED before real users — mock prints login codes
# to Cloud Logging and the deploy script warns loudly about it)
export SMS_PROVIDER=twilio
export TWILIO_ACCOUNT_SID=AC...
export TWILIO_AUTH_TOKEN=...
export TWILIO_PHONE_NUMBER=+1...

# Optional: cross-instance rate limiting (e.g. Memorystore). Cloud Run needs
# a Serverless VPC Access connector to reach Memorystore — create both first,
# then pass the URL. Without it, rate limits are per-instance (max 3).
# export REDIS_URL=redis://10.x.x.x:6379

./deploy.sh
```

The script is idempotent — safe to re-run. It intentionally does NOT rotate
the database password on re-runs (only on first creation), and it runs
migrations _before_ the new revision takes traffic. First deploy takes ~10
minutes (Cloud SQL creation is slow). Subsequent deploys take ~2 minutes.

## Estimated Cost (demo/idle)

| Service               | Cost             |
| --------------------- | ---------------- |
| Cloud Run (idle)      | $0               |
| Cloud SQL db-f1-micro | ~$9/mo           |
| Cloud Scheduler       | $0 (3 free jobs) |
| Secret Manager        | < $0.10/mo       |
| **Total (idle)**      | **~$9/mo**       |

Cloud SQL can't scale to zero, so delete it when not demoing to avoid charges.

## Tear Down

```bash
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=northamerica-northeast1

gcloud run services delete betty-api --region $GCP_REGION --project $GCP_PROJECT_ID --quiet
gcloud run jobs delete betty-migrate --region $GCP_REGION --project $GCP_PROJECT_ID --quiet
gcloud run jobs delete betty-batch --region $GCP_REGION --project $GCP_PROJECT_ID --quiet
gcloud scheduler jobs delete betty-batch-hourly --location $GCP_REGION --project $GCP_PROJECT_ID --quiet
gcloud sql instances delete betty-db --project $GCP_PROJECT_ID --quiet

# Delete secrets
for s in betty-database-url betty-jwt-secret betty-jwt-refresh betty-encryption-key betty-anthropic-key betty-redis-url betty-twilio-sid betty-twilio-token; do
  gcloud secrets delete $s --project $GCP_PROJECT_ID --quiet 2>/dev/null
done
```
