# Functions Deploy (gcloud)

Folosim acest flow cand `firebase-tools` este blocat pe Extensions 403.

## Cerinte
- Rulezi in Cloud Shell sau local unde exista `gcloud`.
- Proiect activ: `mina-v1-aea51`.

## 1) Deploy ambele functii
```bash
cd /path/to/mina-v1
bash scripts/deploy-functions-gcloud.sh all
```

## 2) Deploy doar PDF fallback
```bash
cd /path/to/mina-v1
bash scripts/deploy-functions-gcloud.sh downloadInvoicePdf
```

## 3) Deploy doar Stripe webhook
```bash
cd /path/to/mina-v1
bash scripts/deploy-functions-gcloud.sh onStripeWebhook
```

## 4) NPM shortcuts
```bash
npm run deploy:functions:gcloud
npm run deploy:function:gcloud:pdf
npm run deploy:function:gcloud:webhook
```

## Verificare rapida
1. Dashboard -> Abonament -> `Genereaza PDF` (trebuie sa descarce).
2. Stripe -> Webhooks -> resend `checkout.session.completed` (trebuie `200`).
