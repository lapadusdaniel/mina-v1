# Cloudflare Worker Deploy (Mina v1)

Scop: publici worker-ul nou (`worker/r2-worker.js`) fara sa atingi proiectul original.

## 1) Verifica autentificarea Wrangler

```bash
cd /Users/daniellapadus/Desktop/mina-v1
npm run worker:whoami
```

Daca vezi `You are not authenticated`, ai 2 variante:
- `npx --yes wrangler login` (login in browser)
- sau setezi `CLOUDFLARE_API_TOKEN` in terminal.

## 2) Verifica binding-ul R2 in Cloudflare Dashboard

In Worker-ul `mina-v1-r2-worker`:
- Binding tip `R2 bucket`
- Name: `R2_BUCKET`
- Bucket: `mina-v1-media`

## 3) Deploy worker

```bash
cd /Users/daniellapadus/Desktop/mina-v1
npm run deploy:worker
```

## 4) QA end-to-end worker

```bash
cd /Users/daniellapadus/Desktop/mina-v1
npm run qa:worker
```

Rezultat asteptat: `QA Worker E2E PASSED`.

