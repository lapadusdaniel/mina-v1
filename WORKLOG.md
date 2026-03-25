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

### 2026-03-24 — Merge în `main` pentru deleteGalleryAssets pe B2

- Mersat în `main` branch-ul `codex/fix/delete-gallery-assets-b2`
- Verificat în `functions/index.js` că `deleteGalleryAssets` referă `B2_ENDPOINT`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`
- Rulat `npx firebase-tools deploy --only functions --project mina-v1-aea51 --force` din `main`; Firebase a raportat `deleteGalleryAssets(us-central1) Skipped (No changes detected)`
- Rulat `npx firebase-tools functions:log --only deleteGalleryAssets --project mina-v1-aea51`; output-ul disponibil rămâne un audit log vechi din `2026-03-23` care arată încă secretele `R2_*`

### 2026-03-24 — deleteGalleryAssets pe HTTP direct + SigV4

- Rescris `deleteB2Prefix` din `functions/index.js` ca listare + delete direct pe B2 prin `fetch` + AWS SigV4, fără AWS SDK în fișier
- Copiați helper-ele `signRequest`, `hmacSha256`, `hmacSha256Hex`, `sha256Hex` din Worker în Functions
- Eliminat importul `@aws-sdk/client-s3` din `functions/index.js`, deoarece nu mai era necesar pentru `deleteGalleryAssets`
- Rulate `node --check functions/index.js`, `npm run build` și `npx firebase-tools deploy --only functions --project mina-v1-aea51 --force`
- Deploy reușit pe revizia `deletegalleryassets-00012-buj`
- Test controlat: upload prin Worker `200 OK`, apel `deleteGalleryAssets` `500`, documentul galeriei a rămas în Firestore (`200` la GET după apel)
- Runtime logs pentru noua revizie confirmă că eroarea s-a mutat în `deleteB2Prefix` la listare: `B2 list failed: 403 SignatureDoesNotMatch / Signature validation failed`

### 2026-03-24 — Încercare path-style URLs pentru B2 în deleteGalleryAssets

- Modificate URL-urile SigV4 din `functions/index.js` de la virtual-hosted style la path-style:
  `https://${endpoint}/${bucket}/...` și `host: ${endpoint}`
- Rulate din nou `node --check functions/index.js`, `npm run build` și `npx firebase-tools deploy --only functions --project mina-v1-aea51 --force`
- Deploy reușit pe revizia `deletegalleryassets-00013-zin`
- Test controlat refăcut: upload prin Worker `200 OK`, apel `deleteGalleryAssets` încă `500`, documentul galeriei rămâne în Firestore
- Logurile pentru revizia `00013` arată aceeași eroare în `deleteB2Prefix` la listare:
  `B2 list failed: 403 SignatureDoesNotMatch / Signature validation failed`

### 2026-03-24 — Trecere pe B2 Native API pentru deleteGalleryAssets

- Înlocuit complet `deleteB2Prefix` din `functions/index.js` cu flow-ul B2 Native API:
  `b2_authorize_account` → `b2_list_buckets` → `b2_list_file_names` → `b2_delete_file_version`
- Eliminat din `functions/index.js` tot codul SigV4 (`signRequest`, `hmacSha256`, `hmacSha256Hex`, `sha256Hex`) și secretul nefolosit `B2_ENDPOINT` din `deleteGalleryAssets`
- Rulate `node --check functions/index.js`, `npm run build` și `npx firebase-tools deploy --only functions --project mina-v1-aea51 --force`
- Deploy reușit pe revizia `deletegalleryassets-00014-ped`
- Test controlat: upload prin Worker `200 OK`, apel `deleteGalleryAssets` încă `500`, documentul galeriei rămâne în Firestore
- Runtime logs pentru revizia `00014` arată că noua variantă pică la autorizarea B2 Native API:
  `B2 auth failed: 401 {"code":"bad_auth_token","message":"","status":401}`

### 2026-03-24 — Corectare secrete B2 pentru deleteGalleryAssets

- Actualizate Firebase Functions Secrets:
  `B2_APPLICATION_KEY` = versiunea `2`,
  `B2_KEY_ID` = versiunea `3`
- Redeploy complet de Functions cu `npx firebase-tools deploy --only functions --project mina-v1-aea51 --force`
- `deleteGalleryAssets(us-central1)` a fost actualizată cu succes și funcția live folosește noile versiuni de secrete
- Test controlat refăcut pe galerie temporară:
  upload prin Worker `200 OK`,
  apel `deleteGalleryAssets` `200 {"ok":true,"galleryId":"...","deleted":1}`,
  verificare B2 după apel: `0` fișiere rămase sub prefix
- Rezultat: ștergerea galeriei din B2 funcționează acum corect; eroarea `bad_auth_token` a fost eliminată

### 2026-03-25 — Documentație arhitectură

- Creat `ARCHITECTURE.md` în rădăcina proiectului ca referință de arhitectură pentru începutul sesiunilor viitoare
- Documentate rutele principale, storage-ul B2, Worker-ul, Functions, secretele și planurile Stripe live

### 2026-03-25 — Email notificări selecții + trimitere link galerie

- Adăugat trigger Firestore `onSelectionSaved` pentru `gallerySelections/{galleryId}/clients/{clientId}` care trimite email către fotograf prin Resend când clientul salvează favorite
- Adăugată funcția callable `sendGalleryLink` care validează ownership-ul galeriei și trimite clientului link-ul galeriei pe email
- Extins `functions/src/services/email.service.js` cu template-uri HTML în română pentru notificarea selecțiilor și trimiterea link-ului galeriei
- Adăugat în `GalleryDetailView.jsx` butonul `Trimite galeria` și modalul cu nume, email și parolă pentru galeriile protejate
- Actualizat `ARCHITECTURE.md` pentru noile funcții și pentru statusul emailurilor tranzacționale

### 2026-03-25 — Merge și redeploy hosting din repo-ul principal

- Verificat rularea din `/Users/daniellapadus/Desktop/mina-v1`, existența fișierului `.env` și prezența `VITE_FIREBASE_API_KEY`
- Eliberat branch-ul `main` din worktree-ul auxiliar și făcut stash pentru modificările locale nelegate din repo-ul principal
- Mersat `codex/feature/email-notifications-b2` în `main` prin fast-forward
- Rulat `npm run build` cu succes în repo-ul principal
- Rulat `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting` cu succes
- Hosting live după redeploy: `https://mina-v1-aea51.web.app`

### 2026-03-25 — Share options în modalul „Trimite galeria”

- Extins `src/components/GalleryDetailView.jsx` cu 3 acțiuni rapide în modal: `Copy link`, `WhatsApp`, `Messenger`
- `Copy link` copiază URL-ul public al galeriei în clipboard și afișează confirmarea `Copiat!` timp de 2 secunde
- `WhatsApp` deschide mesaj precompletat în română cu linkul galeriei; pentru galeriile protejate include și parola introdusă în formular
- `Messenger` folosește fallback-ul `facebook.com/sharer/sharer.php` pentru distribuirea rapidă a linkului
- Păstrat formularul existent de email sub un separator `sau trimite prin email`
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-25 — Restilizare butoane share în modalul galeriei

- Refăcut layout-ul pentru cele 3 butoane de share din `src/components/GalleryDetailView.jsx` într-un row egal, cu icon sus și label jos
- Aplicat stil flat: fundal `#f4f5f8`, fără border, radius `12px`, padding `16px`, hover `#e8e8ed`
- Mărit icon-urile la `24px` și ajustat label-urile pe stilul dashboard (`DM Sans`, `12px`, `#6e6e73`)
- Înlocuit separatorul simplu cu un divider centrat, discret, pentru textul `sau trimite prin email`
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-25 — Redesign modal „Trimite galeria” pe tabs

- Reorganizat `src/components/GalleryDetailView.jsx` pe 2 tab-uri: `Link & Social` și `Email`
- În tab-ul `Link & Social`: URL readonly al galeriei cu buton `Copiază`, plus butoanele `WhatsApp` și `Messenger`
- În tab-ul `Email`: câmpurile `Nume client`, `Email client` și buton full-width `Trimite email`
- Păstrată logica existentă pentru copy link, WhatsApp, Messenger și trimitere email; la galeriile protejate, parola se completează în tab-ul `Email` și este reutilizată pentru email / WhatsApp
- Eliminat stilul inline anterior pentru share buttons și înlocuit cu clase dedicate în modal
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-25 — Compactare modal share galerie

- Îngustat modalul `Trimite galeria` la `max-width: 480px` printr-o clasă locală în `src/components/GalleryDetailView.jsx`
- Reduse padding-urile și spacing-ul din modal: tabs, URL row, butoane social, input-uri și butonul `Trimite email`
- Păstrat layout-ul pe tabs și logica existentă, dar cu o prezentare mai compactă și mai apropiată de dashboard
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-25 — Fix rename folder fără duplicare

- Investigat flow-ul de rename din `src/components/Dashboard.jsx` și confirmat că duplicarea nu venea din `updateFolder`, ci din branch-ul special pentru `DEFAULT_FOLDER_ID`, care crea un folder nou prin `createFolder(...)`
- Înlocuit rename-ul pentru folderul implicit cu update in-place pe documentul galeriei, prin câmpul `defaultFolderName`, fără crearea unui document nou în subcolecția `folders`
- Actualizat `src/components/GalleryDetailView.jsx` să afișeze și să redenumească folderul implicit folosind `galerie.defaultFolderName`, cu fallback la `Galeria mea`
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-25 — Drag & drop reorder pentru foldere

- Investigat read-only render-ul folderelor din `src/components/GalleryDetailView.jsx` și confirmat că ordinea era deja modelată în Firestore prin câmpul `order`, iar `getFolders()` citea cu `orderBy('order', 'asc')`
- Adăugat `reorderFolders()` în `src/modules/galleries/folders.service.js`, cu persistare batch a noii ordini pe documentele din `galerii/{galleryId}/folders`
- Adăugat `handleReorderFolders()` în `src/components/Dashboard.jsx`, cu update optimist local și fallback prin reîncărcarea galeriei dacă persistarea eșuează
- Implementat HTML5 drag & drop în `src/components/GalleryDetailView.jsx` pentru folderele explicite, cu feedback vizual: folderul drag-uit devine semi-transparent, iar ținta de drop este evidențiată
- Confirmat că `src/components/ClientGallery.jsx` respecta deja ordinea din Firestore, deci nu a fost necesară modificarea fișierului protejat
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-25 — Fix insert before/after la drag & drop pentru foldere

- Investigat bug-ul din `src/components/GalleryDetailView.jsx` și confirmat că drop-ul repoziționa folderul doar la indexul țintei, fără diferențiere între insert înainte sau după
- Actualizat `handleFolderDragOver()` să calculeze poziția cursorului față de jumătatea elementului și să derive `before` / `after` folosind `getBoundingClientRect()` și `event.clientY`
- Înlocuit highlight-ul de fundal cu un indicator vizual de inserare: linie de `2px` în `#1a1a1f`, afișată deasupra sau dedesubtul folderului țintă și curățată la `dragleave`, `drop` și `dragend`
- Extins `handleReorderFolders()` din `src/components/Dashboard.jsx` cu parametrul `insertPosition`, astfel încât ordinea să fie persistată corect în Firestore când folderul este mutat înainte sau după țintă
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`
