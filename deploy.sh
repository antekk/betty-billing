#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
REGION="${GCP_REGION:-northamerica-northeast1}"   # Montreal (good for Canadian health data)
SERVICE_NAME="betty-api"
DB_INSTANCE="betty-db"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/betty/$SERVICE_NAME"
# Full-source image (bun + drizzle-kit) for migrations and batch jobs
IMAGE_JOBS="$REGION-docker.pkg.dev/$PROJECT_ID/betty/betty-jobs"
# SMS: "twilio" for real delivery (requires TWILIO_* env), "mock" for demos.
SMS_PROVIDER="${SMS_PROVIDER:-mock}"

echo "==> Deploying Betty to project: $PROJECT_ID  region: $REGION"

# ── 1. Enable required APIs ──────────────────────────────────────────
echo "==> Enabling GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com \
  --project "$PROJECT_ID"

# ── 2. Artifact Registry repo (container images) ────────────────────
echo "==> Creating Artifact Registry repo..."
gcloud artifacts repositories describe betty \
  --location="$REGION" --project="$PROJECT_ID" 2>/dev/null \
|| gcloud artifacts repositories create betty \
  --repository-format=docker \
  --location="$REGION" \
  --project="$PROJECT_ID"

# ── 3. Cloud SQL (PostgreSQL) ────────────────────────────────────────
echo "==> Creating Cloud SQL instance (this takes a few minutes on first run)..."
gcloud sql instances describe "$DB_INSTANCE" --project="$PROJECT_ID" 2>/dev/null \
|| gcloud sql instances create "$DB_INSTANCE" \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region="$REGION" \
  --project="$PROJECT_ID"

# Create database & user (idempotent)
gcloud sql databases describe betty --instance="$DB_INSTANCE" --project="$PROJECT_ID" 2>/dev/null \
|| gcloud sql databases create betty --instance="$DB_INSTANCE" --project="$PROJECT_ID"

DB_CONNECTION=$(gcloud sql instances describe "$DB_INSTANCE" \
  --format='value(connectionName)' --project="$PROJECT_ID")

# ── 4. Secrets ───────────────────────────────────────────────────────
echo "==> Storing secrets..."
store_secret() {
  local name="$1" value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project="$PROJECT_ID"
  else
    printf '%s' "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic --project="$PROJECT_ID"
  fi
}

# The DB user/password is created ONCE; re-runs must not rotate it (rotation
# briefly stranded the live revision on stale credentials). Hex password only:
# base64's / and + break DATABASE_URL parsing.
if gcloud sql users list --instance="$DB_INSTANCE" --project="$PROJECT_ID" \
    --format='value(name)' | grep -qx betty; then
  echo "    DB user exists; keeping current password/secret"
else
  DB_PASSWORD="$(openssl rand -hex 24)"
  gcloud sql users create betty \
    --instance="$DB_INSTANCE" \
    --password="$DB_PASSWORD" \
    --project="$PROJECT_ID"
  store_secret betty-database-url \
    "postgresql://betty:${DB_PASSWORD}@/betty?host=/cloudsql/${DB_CONNECTION}"
fi

JWT_SECRET="${JWT_SECRET:-$(openssl rand -hex 32)}"
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-$(openssl rand -hex 32)}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:?Set ANTHROPIC_API_KEY}"

store_secret betty-jwt-secret     "$JWT_SECRET"
store_secret betty-jwt-refresh    "$JWT_REFRESH_SECRET"
store_secret betty-encryption-key "$ENCRYPTION_KEY"
store_secret betty-anthropic-key  "$ANTHROPIC_API_KEY"

SECRETS=(betty-database-url betty-jwt-secret betty-jwt-refresh betty-encryption-key betty-anthropic-key)

# SMS provider wiring
ENV_VARS="NODE_ENV=production,SMS_PROVIDER=$SMS_PROVIDER"
EXTRA_SECRET_FLAGS=""
if [[ "$SMS_PROVIDER" == "twilio" ]]; then
  : "${TWILIO_ACCOUNT_SID:?Set TWILIO_ACCOUNT_SID for SMS_PROVIDER=twilio}"
  : "${TWILIO_AUTH_TOKEN:?Set TWILIO_AUTH_TOKEN for SMS_PROVIDER=twilio}"
  : "${TWILIO_PHONE_NUMBER:?Set TWILIO_PHONE_NUMBER for SMS_PROVIDER=twilio}"
  store_secret betty-twilio-sid   "$TWILIO_ACCOUNT_SID"
  store_secret betty-twilio-token "$TWILIO_AUTH_TOKEN"
  SECRETS+=(betty-twilio-sid betty-twilio-token)
  EXTRA_SECRET_FLAGS=",TWILIO_ACCOUNT_SID=betty-twilio-sid:latest,TWILIO_AUTH_TOKEN=betty-twilio-token:latest"
  ENV_VARS+=",TWILIO_PHONE_NUMBER=$TWILIO_PHONE_NUMBER"
else
  echo ""
  echo "!!! SMS_PROVIDER=mock: login codes are printed to Cloud Logging."
  echo "!!! Anyone with log read access can log in as any phone number."
  echo "!!! This is for demos ONLY — set SMS_PROVIDER=twilio before real use."
  echo ""
  ENV_VARS+=",ALLOW_MOCK_SMS=true"
fi

# Optional distributed rate limiting (e.g. Memorystore; requires a VPC
# connector to reach it from Cloud Run — see DEPLOY.md)
if [[ -n "${REDIS_URL:-}" ]]; then
  store_secret betty-redis-url "$REDIS_URL"
  SECRETS+=(betty-redis-url)
  EXTRA_SECRET_FLAGS+=",REDIS_URL=betty-redis-url:latest"
fi

# Grant Cloud Run access to secrets
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for secret in "${SECRETS[@]}"; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID" --quiet
done

# ── 5. Build & push containers ───────────────────────────────────────
echo "==> Building and pushing container images..."
gcloud builds submit . \
  --config cloudbuild.yaml \
  --substitutions="_IMAGE=$IMAGE,_IMAGE_JOBS=$IMAGE_JOBS" \
  --project "$PROJECT_ID"

# ── 6. Run migrations BEFORE the new revision takes traffic ─────────
# Uses the jobs image: full source with drizzle-kit, committed migrations,
# and drizzle.config.ts (the runtime image only has the pruned standalone build)
echo "==> Running database migrations..."
gcloud run jobs describe betty-migrate --region "$REGION" --project "$PROJECT_ID" &>/dev/null \
&& gcloud run jobs update betty-migrate \
  --image "$IMAGE_JOBS" \
  --region "$REGION" \
  --set-secrets="DATABASE_URL=betty-database-url:latest" \
  --command="bun" \
  --args="run,db:migrate" \
  --project "$PROJECT_ID" \
|| gcloud run jobs create betty-migrate \
  --image "$IMAGE_JOBS" \
  --region "$REGION" \
  --add-cloudsql-instances="$DB_CONNECTION" \
  --set-secrets="DATABASE_URL=betty-database-url:latest" \
  --command="bun" \
  --args="run,db:migrate" \
  --project "$PROJECT_ID"

gcloud run jobs execute betty-migrate --region "$REGION" --project "$PROJECT_ID" --wait

# ── 7. Deploy to Cloud Run (schema is already migrated) ─────────────
echo "==> Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
  --platform managed \
  --region "$REGION" \
  --allow-unauthenticated \
  --add-cloudsql-instances="$DB_CONNECTION" \
  --set-secrets="\
DATABASE_URL=betty-database-url:latest,\
JWT_SECRET=betty-jwt-secret:latest,\
JWT_REFRESH_SECRET=betty-jwt-refresh:latest,\
ENCRYPTION_KEY=betty-encryption-key:latest,\
ANTHROPIC_API_KEY=betty-anthropic-key:latest${EXTRA_SECRET_FLAGS}" \
  --set-env-vars="$ENV_VARS" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --project "$PROJECT_ID"

# ── 8. Hourly batch submission (Cloud Run Job + Cloud Scheduler) ────
# Cloud Run services must listen on a port, which the BullMQ worker doesn't,
# so batches run as a run-to-completion job on an hourly schedule instead.
echo "==> Setting up hourly batch submission..."
gcloud run jobs describe betty-batch --region "$REGION" --project "$PROJECT_ID" &>/dev/null \
&& gcloud run jobs update betty-batch \
  --image "$IMAGE_JOBS" \
  --region "$REGION" \
  --set-secrets="DATABASE_URL=betty-database-url:latest,ENCRYPTION_KEY=betty-encryption-key:latest" \
  --command="bun" \
  --args="run,src/jobs/run-batch.ts" \
  --project "$PROJECT_ID" \
|| gcloud run jobs create betty-batch \
  --image "$IMAGE_JOBS" \
  --region "$REGION" \
  --add-cloudsql-instances="$DB_CONNECTION" \
  --set-secrets="DATABASE_URL=betty-database-url:latest,ENCRYPTION_KEY=betty-encryption-key:latest" \
  --command="bun" \
  --args="run,src/jobs/run-batch.ts" \
  --project "$PROJECT_ID"

gcloud run jobs add-iam-policy-binding betty-batch \
  --member="serviceAccount:$SA" \
  --role="roles/run.invoker" \
  --region="$REGION" \
  --project="$PROJECT_ID" --quiet

gcloud scheduler jobs describe betty-batch-hourly --location "$REGION" --project "$PROJECT_ID" &>/dev/null \
|| gcloud scheduler jobs create http betty-batch-hourly \
  --schedule="0 * * * *" \
  --uri="https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/jobs/betty-batch:run" \
  --http-method=POST \
  --oauth-service-account-email="$SA" \
  --location="$REGION" \
  --project="$PROJECT_ID"

# ── Done ─────────────────────────────────────────────────────────────
URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" --format='value(status.url)' --project "$PROJECT_ID")

echo ""
echo "Betty deployed successfully!"
echo "   URL: $URL"
echo ""
echo "Next steps:"
echo "  1. Seed fee codes:  gcloud run jobs (or bun run db:seed against the instance)"
if [[ "$SMS_PROVIDER" == "mock" ]]; then
  echo "  2. IMPORTANT: mock SMS is active — set SMS_PROVIDER=twilio before real users"
fi
if [[ -z "${REDIS_URL:-}" ]]; then
  echo "  3. Rate limits are per-instance without REDIS_URL (fine for a demo)"
fi
