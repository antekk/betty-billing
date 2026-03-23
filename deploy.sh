#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ────────────────────────────────────────────────────
PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
REGION="${GCP_REGION:-northamerica-northeast1}"   # Montreal (good for Canadian health data)
SERVICE_NAME="betty-api"
DB_INSTANCE="betty-db"
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/betty/$SERVICE_NAME"

echo "==> Deploying Betty to project: $PROJECT_ID  region: $REGION"

# ── 1. Enable required APIs ──────────────────────────────────────────
echo "==> Enabling GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
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

DB_PASSWORD="$(openssl rand -base64 24)"
gcloud sql users set-password betty \
  --instance="$DB_INSTANCE" \
  --password="$DB_PASSWORD" \
  --project="$PROJECT_ID" 2>/dev/null \
|| gcloud sql users create betty \
  --instance="$DB_INSTANCE" \
  --password="$DB_PASSWORD" \
  --project="$PROJECT_ID"

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

DATABASE_URL="postgresql://betty:${DB_PASSWORD}@/betty?host=/cloudsql/${DB_CONNECTION}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 32)}"
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-$(openssl rand -base64 32)}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-$(openssl rand -hex 32)}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:?Set ANTHROPIC_API_KEY}"

store_secret betty-database-url   "$DATABASE_URL"
store_secret betty-jwt-secret     "$JWT_SECRET"
store_secret betty-jwt-refresh    "$JWT_REFRESH_SECRET"
store_secret betty-encryption-key "$ENCRYPTION_KEY"
store_secret betty-anthropic-key  "$ANTHROPIC_API_KEY"

# Grant Cloud Run access to secrets
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
for secret in betty-database-url betty-jwt-secret betty-jwt-refresh betty-encryption-key betty-anthropic-key; do
  gcloud secrets add-iam-policy-binding "$secret" \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID" --quiet
done

# ── 5. Build & push container ───────────────────────────────────────
echo "==> Building and pushing container image..."
gcloud builds submit . \
  --tag "$IMAGE" \
  --project "$PROJECT_ID"

# ── 6. Deploy to Cloud Run ──────────────────────────────────────────
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
ANTHROPIC_API_KEY=betty-anthropic-key:latest" \
  --set-env-vars="SMS_PROVIDER=mock,NODE_ENV=production" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --project "$PROJECT_ID"

# ── 7. Run migrations ───────────────────────────────────────────────
echo "==> Running database migrations..."
gcloud run jobs create betty-migrate \
  --image "$IMAGE" \
  --region "$REGION" \
  --add-cloudsql-instances="$DB_CONNECTION" \
  --set-secrets="DATABASE_URL=betty-database-url:latest" \
  --command="node" \
  --args="node_modules/.bin/drizzle-kit,migrate" \
  --project "$PROJECT_ID" 2>/dev/null \
|| gcloud run jobs update betty-migrate \
  --image "$IMAGE" \
  --region "$REGION" \
  --set-secrets="DATABASE_URL=betty-database-url:latest" \
  --project "$PROJECT_ID"

gcloud run jobs execute betty-migrate --region "$REGION" --project "$PROJECT_ID" --wait

# ── Done ─────────────────────────────────────────────────────────────
URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" --format='value(status.url)' --project "$PROJECT_ID")

echo ""
echo "Betty deployed successfully!"
echo "   URL: $URL"
echo ""
echo "Next steps:"
echo "  1. Seed fee codes:  Run the seed job or import via the Cloud SQL console"
echo "  2. Set a real SMS provider when ready to go beyond mock auth"
