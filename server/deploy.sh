#!/bin/bash
# Deploy Aura API to Google Cloud Run
# Prerequisites:
#   1. gcloud CLI authenticated: gcloud auth login
#   2. Secrets created in Secret Manager: gemini-api-key, jobs-api-key
#   3. Cloud Run service account has roles/secretmanager.secretAccessor
set -euo pipefail

PROJECT_ID="aura-fitness-api"
REGION="us-central1"
SERVICE="aura-api"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE}"

echo "==> Building and pushing image..."
gcloud builds submit --tag "${IMAGE}" --project "${PROJECT_ID}"

echo "==> Deploying to Cloud Run..."
gcloud run deploy "${SERVICE}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 2 \
  --min-instances 1 \
  --max-instances 10 \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest,JOBS_API_KEY=jobs-api-key:latest" \
  --set-env-vars "NODE_ENV=production,PORT=8080"

echo "==> Deployment complete!"
gcloud run services describe "${SERVICE}" \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format="value(status.url)"
