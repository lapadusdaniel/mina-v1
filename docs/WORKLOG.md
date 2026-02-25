# WORKLOG (Mina v1)

Log retroactiv pentru lucrul făcut în `/Users/daniellapadus/Desktop/mina-v1` (fără modificări în proiectul original `fotolio`).

## Reguli de lucru
- Cod nou doar în `mina-v1`.
- `fotolio` rămâne referință, neatins.
- Schimbările importante sunt urmărite prin commit hash + rezultat QA.

## Istoric retroactiv

### 2026-02-24
- `8aca5c8` — bootstrap inițial Mina v1.
- `3a550bf` — configurare Stripe price IDs din env.
- `1ff20e0` — preflight pentru env live.
- `133ce97` — checklist de launch în aplicație.

### 2026-02-25 (Billing + UX + performanță)
- `1a54e73` — payload checkout aliniat cu Firestore rules.
- `d664a03` — afișare erori Stripe în UI.
- `52b70ec` — fail-fast când lipsesc env-uri Stripe.
- `5153d05` — timeout pentru crearea sesiunii Stripe.
- `8d0fc20` — fallback clar la timeout checkout.
- `1a9aa6c` — overview abonament + istoric plăți.
- `c273079` — includere plăți cu cupon (inclusiv 0 lei) în istoric.
- `db1c629` — anulare abonament la finalul perioadei.
- `4fe3818` — flow anulare simplificat (portal Stripe, un singur pas).
- `4be3ec9` — corectare CTA plan curent/plan activ.
- `e3ddd22` — QA auth îmbunătățit cu cont temporar auto.
- `5612fd5` — lazy-load pentru cover-urile din dashboard.

### 2026-02-25 (Securitate Worker + Storage)
- `0e5c23c` — eliminare completă logică legacy path; only:
  - `galerii/{galleryId}/originals/{file}`
  - `galerii/{galleryId}/medium/{file}`
  - `galerii/{galleryId}/thumbnails/{file}`
- `1e7112c` — limită stocare enforced în backend (Worker) pe baza planului din Firestore; upload blocat cu `403 Quota Exceeded` când se depășește limita.
- `fcc12cf` — rate limiting global la Cloudflare edge + fallback local:
  - `READ_RATE_LIMITER`: 600 req / 60s
  - `WRITE_RATE_LIMITER`: 180 req / 60s
  - răspuns `429` + header `Retry-After: 60`

## Deploy + verificări
- Worker live: `mina-v1-r2-worker.lapadusdaniel.workers.dev`
- Teste locale: `npm run test` (19/19 PASS)
- QA worker end-to-end: `npm run qa:worker` (PASS)
- Build: `npm run build` (PASS)

## Stare curentă
- Punctele A și C din lista de vulnerabilități sunt închise:
  - A) quota enforcement backend: închis.
  - C) rate limiting global real: închis.
- Punctul B (share token cu semnătură HMAC secret) rămâne opțional de implementat ca întărire extra.

