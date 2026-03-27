#!/bin/bash
# Set up GCP monitoring for Aura API
# Prerequisites: gcloud CLI authenticated with project aura-fitness-api
#
# What this creates:
#   1. Uptime check on /health endpoint (every 5 minutes)
#   2. Email notification channel for alerts
#
# Alert policies (create manually in GCP Console after running this):
#   - Health check failure: email immediately
#   - Cloud Run 5xx rate > 5% over 5 min
#   - Cloud Run p95 latency > 30s over 5 min
set -euo pipefail

PROJECT_ID="aura-fitness-api"
HEALTH_URL="https://aura-api-177339568703.us-central1.run.app/health"

echo "==> Creating uptime check..."
gcloud monitoring uptime create \
  --display-name="Aura API Health Check" \
  --uri="${HEALTH_URL}" \
  --http-method=GET \
  --period=300 \
  --project="${PROJECT_ID}" \
  2>/dev/null || echo "Uptime check may already exist"

echo ""
echo "==> Next steps (manual in GCP Console):"
echo "  1. Go to: https://console.cloud.google.com/monitoring/alerting?project=${PROJECT_ID}"
echo "  2. Create notification channel (email) for your alerts"
echo "  3. Create alert policy: Uptime check failure -> email"
echo "  4. Create alert policy: Cloud Run 5xx rate > 5% over 5 min -> email"
echo "  5. Create alert policy: Cloud Run p95 latency > 30s over 5 min -> email"
echo ""
echo "==> Verify uptime check:"
echo "  https://console.cloud.google.com/monitoring/uptime?project=${PROJECT_ID}"
