### 2026-03-22 — Migrare storage R2 → Backblaze B2

- Rescris `worker/r2-worker.js` — înlocuite toate operațiile native R2 (`env.R2_BUCKET.get/put/delete/list`) cu AWS S3 SDK pointing la Backblaze B2
- Adăugate funcții: `createB2S3Client`, `b2Get`, `b2Put`, `b2Delete`, `b2List`, `b2ListAllKeys`
- Scos binding R2 din `worker/wrangler.toml`
- Adăugate variabile în Cloudflare Worker Dashboard: `B2_ENDPOINT`, `B2_BUCKET_NAME`, `B2_KEY_ID`, `B2_APPLICATION_KEY`
- Creat bucket B2: `mina-photos` pe `s3.us-east-005.backblazeb2.com`
- Fix: eliminat conținut non-JavaScript de la finalul fișierului `r2-worker.js`
- Fix: îmbunătățit error handling în `b2List` — eroare prinsă în try/catch, nu mai aruncă 500
- `b28ce7d` — fix: remove non-JS trailing content from r2-worker.js
- `c226532` — fix: remove R2 binding from wrangler.toml — migrated to B2
- Status: deploy reușit ✅ — LIST operație în investigație (returnează array gol cu eroare în loc de 500)
