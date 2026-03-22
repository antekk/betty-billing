# Deploying Betty to GCP

Simple Cloud Run deployment with managed Postgres. No Redis needed for demo — the
BullMQ worker is a separate process and isn't required to use the app.

## Architecture

```
Internet → Cloud Run (betty-api) → Cloud SQL (Postgres 16)
```

- **Cloud Run** — serverless container, scales to zero when idle
- **Cloud SQL** — managed Postgres (db-f1-micro, cheapest tier)
- **Secret Manager** — stores credentials

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

./deploy.sh
```

The script is idempotent — safe to re-run. First deploy takes ~10 minutes (Cloud SQL creation is slow). Subsequent deploys take ~2 minutes.

## Estimated Cost (demo/idle)

| Service | Cost |
|---------|------|
| Cloud Run (idle) | $0 |
| Cloud SQL db-f1-micro | ~$9/mo |
| Secret Manager | < $0.10/mo |
| **Total (idle)** | **~$9/mo** |

Cloud SQL can't scale to zero, so delete it when not demoing to avoid charges.

## Tear Down

```bash
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=northamerica-northeast1

gcloud run services delete betty-api --region $GCP_REGION --project $GCP_PROJECT_ID --quiet
gcloud run jobs delete betty-migrate --region $GCP_REGION --project $GCP_PROJECT_ID --quiet
gcloud sql instances delete betty-db --project $GCP_PROJECT_ID --quiet

# Delete secrets
for s in betty-database-url betty-jwt-secret betty-jwt-refresh betty-encryption-key betty-anthropic-key; do
  gcloud secrets delete $s --project $GCP_PROJECT_ID --quiet
done
```
