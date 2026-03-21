# Deploying Betty to GCP

Simple Cloud Run deployment with managed Postgres and Redis.

## Architecture

```
Internet → Cloud Run (betty-api) → Cloud SQL (Postgres 16)
                                 → Memorystore (Redis 7)
```

- **Cloud Run** — serverless container, scales to zero when idle
- **Cloud SQL** — managed Postgres (db-f1-micro for demo)
- **Memorystore** — managed Redis for BullMQ job queue
- **Secret Manager** — stores all credentials
- **VPC Connector** — connects Cloud Run to Redis on private network

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
| Memorystore 1GB Basic | ~$35/mo |
| VPC Connector | ~$7/mo |
| **Total (idle)** | **~$51/mo** |

Scale to zero isn't possible for Cloud SQL/Memorystore, so delete resources when not demoing.

## Tear Down

```bash
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=northamerica-northeast1

gcloud run services delete betty-api --region $GCP_REGION --project $GCP_PROJECT_ID --quiet
gcloud run jobs delete betty-migrate --region $GCP_REGION --project $GCP_PROJECT_ID --quiet
gcloud redis instances delete betty-redis --region $GCP_REGION --project $GCP_PROJECT_ID --quiet
gcloud sql instances delete betty-db --project $GCP_PROJECT_ID --quiet
gcloud compute networks vpc-access connectors delete betty-connector --region $GCP_REGION --project $GCP_PROJECT_ID --quiet

# Delete secrets
for s in betty-database-url betty-redis-url betty-jwt-secret betty-jwt-refresh betty-encryption-key betty-anthropic-key; do
  gcloud secrets delete $s --project $GCP_PROJECT_ID --quiet
done
```
