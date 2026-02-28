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

### 2026-02-25 (Refactor P1/P2 în ordinea stabilită)
- `P1 rate limit`:
  - cheie write limit schimbată la per-IP + method (nu mai include path), deci upload-uri cu nume unice nu mai ocolesc limita.
- `P1 admin backdoor`:
  - eliminat bootstrap admin hardcodat din `auth.service.js` și `firestore.rules`;
  - admin rămâne strict role-based (`role/isAdmin` din `users/{uid}`).
- `P2 quota`:
  - Worker citește usage din `users/{uid}.storageUsedBytes` (counter pre-calculat), fără scan complet R2 la fiecare verificare.
  - frontend actualizează counter-ul la upload/delete + sync periodic din totalul galeriilor.
- `P2 admin N+1`:
  - Admin folosește snapshot agregat (`users`, `galerii`, `adminOverrides`, `collectionGroup(subscriptions)`) în loc de query-uri secvențiale per user.

## Deploy + verificări
- Worker live: `mina-v1-r2-worker.lapadusdaniel.workers.dev`
- Teste locale: `npm run test` (20/20 PASS)
- QA worker end-to-end: `npm run qa:worker` (PASS)
- Build: `npm run build` (PASS)

## Stare curentă
- Punctele A și C din lista de vulnerabilități sunt închise:
  - A) quota enforcement backend: închis.
  - C) rate limiting global real: închis.
- Punctul B (share token cu semnătură HMAC secret) rămâne opțional de implementat ca întărire extra.

## Update continuare

### 2026-02-26 (Galerii + SmartBill MVP)
- `6d3d7d0` — redesign modal creare galerie + setări pe tab-uri.
- `1fdb880` — stabilizare client preview + simplificare comportament modal setări galerie.
- `ca92d36` — owner-read bypass pentru galerii protejate + comportament setări client conectat.
- `bacc4ca` — păstrare galerie activă la refresh + deschidere preview mai rapidă.
- `43763d3` — tranziții mai fluide între view-urile dashboard/galerie.
- `a35ae34` — integrare SmartBill webhook flow + UI istoric facturi în Abonament.
- `e40f7b1` — încărcare istoric facturi fără dependență strictă de `createdAt`.
- `815c7f7` — fallback sigur pentru download PDF factură din SmartBill.
- `b9aa1d4` — lookup PDF robust la formate CIF diferite.

### 2026-02-27 (SmartBill hardening + deploy tooling)
- `a73f8fd` — detectare payload PDF SmartBill chiar dacă răspunsul vine cu `application/json`.
- `7404226` — hardening runtime pentru functions + teste unitare pe fluxul SmartBill PDF.
- `b92a221` — ghid/automatizare pentru deploy GCloud functions.

### 2026-02-28 (Theming + polish topbar, WIP live)
- Theming end-to-end pe Mina v1:
  - variabile temă în `src/styles/themes.css`;
  - hook `src/hooks/useTheme.js` cu persistență în profil;
  - selector de temă în Settings;
  - mapare extinsă în Dashboard pe `--theme-*`.
- Polish topbar dashboard:
  - aliniere avatar + nume + email;
  - buton logout stilizat, cu contrast mai bun pe toate temele.
- Build + deploy hosting executat cu succes:
  - `npm run build` — PASS
  - `FIREBASE_PROJECT_ID="mina-v1-aea51" npm run deploy:hosting` — PASS
  - live: `https://mina-v1-aea51.web.app`
- Notă: modificările de pe 2026-02-28 sunt momentan WIP (necomitate) în working tree.

### 2026-02-28 (Audit tehnic complet Mina)
- Audit cap-coadă pe codul `mina-v1` pentru:
  - stack tehnic și versiuni;
  - structură proiect și rol module;
  - funcționalități complete vs WIP;
  - flow-uri critice (auth, billing Stripe/SmartBill, galerii/R2).
- Rezultat audit:
  - fluxurile principale există și sunt legate end-to-end (Auth, galerii, Stripe webhook, SmartBill invoice, istoric facturi);
  - identificate câteva inconsistențe de produs/tehnic (ex: setări compresie nealiniate între componente, secțiuni placeholder în dashboard, puncte de theming încă parțial hardcodate).
- Livrabil pregătit în conversație: raport detaliat în 7 secțiuni, bazat strict pe cod, cu marcaj `[INCERT]` unde e deducție.
- Notă: această etapă este audit/documentare; nu s-au făcut modificări de cod în aplicație.
