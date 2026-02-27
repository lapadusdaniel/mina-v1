#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   bash scripts/deploy-functions-gcloud.sh [all|downloadInvoicePdf|onStripeWebhook]
# Optional env:
#   PROJECT_ID=mina-v1-aea51
#   FUNCTIONS_SOURCE=functions
#   FUNCTIONS_RUNTIME=nodejs22

TARGET="${1:-all}"
PROJECT_ID="${PROJECT_ID:-mina-v1-aea51}"
FUNCTIONS_SOURCE="${FUNCTIONS_SOURCE:-functions}"
FUNCTIONS_RUNTIME="${FUNCTIONS_RUNTIME:-nodejs22}"

deploy_download_invoice_pdf() {
  gcloud functions deploy downloadInvoicePdf \
    --gen2 \
    --runtime="${FUNCTIONS_RUNTIME}" \
    --region=us-central1 \
    --project="${PROJECT_ID}" \
    --source="${FUNCTIONS_SOURCE}" \
    --entry-point=downloadInvoicePdf \
    --trigger-http \
    --allow-unauthenticated \
    --set-secrets=SMARTBILL_USERNAME=SMARTBILL_USERNAME:latest,SMARTBILL_TOKEN=SMARTBILL_TOKEN:latest,SMARTBILL_CIF=SMARTBILL_CIF:latest,SMARTBILL_SERIES_NAME=SMARTBILL_SERIES_NAME:latest
}

deploy_on_stripe_webhook() {
  gcloud functions deploy onStripeWebhook \
    --gen2 \
    --runtime="${FUNCTIONS_RUNTIME}" \
    --region=europe-west1 \
    --project="${PROJECT_ID}" \
    --source="${FUNCTIONS_SOURCE}" \
    --entry-point=onStripeWebhook \
    --trigger-http \
    --allow-unauthenticated \
    --set-secrets=STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest,SMARTBILL_USERNAME=SMARTBILL_USERNAME:latest,SMARTBILL_TOKEN=SMARTBILL_TOKEN:latest,SMARTBILL_CIF=SMARTBILL_CIF:latest,SMARTBILL_SERIES_NAME=SMARTBILL_SERIES_NAME:latest
}

case "${TARGET}" in
  all)
    deploy_download_invoice_pdf
    deploy_on_stripe_webhook
    ;;
  downloadInvoicePdf)
    deploy_download_invoice_pdf
    ;;
  onStripeWebhook)
    deploy_on_stripe_webhook
    ;;
  *)
    echo "Unknown target: ${TARGET}"
    echo "Allowed: all | downloadInvoicePdf | onStripeWebhook"
    exit 1
    ;;
esac

echo "Deploy finished: ${TARGET}"
