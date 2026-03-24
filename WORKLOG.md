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

### 2026-03-23 — Debug delete foto din dashboard

- Ajustat `assertWritablePathAccess` în `worker/r2-worker.js` ca să returneze `403` cu mesajul `Gallery not found or access denied` când galeria lipsește din Firestore
- Eliminată tolerarea silențioasă a `404` în `src/r2.js` pentru `deletePoza` — toate variantele (`original`, `medium`, `thumb`) trebuie să șteargă cu succes sau să arunce eroare
- Păstrat flow-ul din dashboard: storage delete mai întâi, update Firestore după succesul delete-ului

### 2026-03-23 — Delete galerie prin Worker prefix DELETE

- Verificat read-only flow-ul actual: `Dashboard.jsx` și `src/r2.js` erau deja pe Worker pentru bulk delete, dar `functions/deleteGalleryAssets` încă ștergea direct prin helper-ul intern
- Mutat `deleteGalleryAssets` din `functions/index.js` să șteargă fișierele din B2 prin endpoint-ul Worker `DELETE ?prefix=galerii/{galleryId}/`, apoi să șteargă documentul galeriei și să decrementeze storage-ul în Firestore
- Păstrat comportamentul de ownership check în Function, astfel încât Worker-ul primește același Bearer token validat deja în request

### 2026-03-23 — deleteGalleryAssets direct pe Backblaze B2

- `functions/index.js` nu mai folosește endpoint-ul Worker pentru bulk delete de galerie
- Adăugate secrete Firebase Functions dedicate pentru B2: `B2_ENDPOINT`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`
- `deleteGalleryAssets` șterge acum direct din bucket-ul `mina-photos` prin AWS S3 SDK configurat pe endpoint-ul `s3.us-east-005.backblazeb2.com`
- Deploy-ul pentru această modificare se face doar cu `firebase deploy --only functions`, conform cerinței taskului

### 2026-03-24 — Force redeploy deleteGalleryAssets cu secrete B2

- Verificat că fixul de cod pentru `deleteGalleryAssets` este în commitul `fafa248`, unde `functions/index.js` folosește `B2_ENDPOINT`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`
- Rulate din nou `npx firebase-tools deploy --only functions --project mina-v1-aea51 --force` și `npx firebase-tools functions:log --only deleteGalleryAssets --project mina-v1-aea51`
- Rezultat: deploy-ul Functions a trecut, dar `deleteGalleryAssets` a fost marcat `Skipped (No changes detected)`; output-ul `functions:log` afișează în continuare doar un audit log vechi din `2026-03-23` cu referințe `R2_*`, nu un log nou de runtime
