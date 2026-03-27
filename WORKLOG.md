### 2026-03-28 — Meniu contextual galerie păstrat în viewport pe mobil

- Adăugat override mobil în `src/components/Dashboard.css` pentru dropdown-ul `⋯` din rândurile de galerie, cu `right: 0` și `left: auto`
- Meniul contextual se deschide acum spre stânga butonului pe ecrane `max-width: 768px`, evitând overflow-ul în afara marginii din dreapta
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-27 — Layout mobil reparat pentru facturare în Settings

- Ajustat containerul din `src/pages/Settings.css` pentru mobil la `max-width: 100%`, `overflow-x: hidden` și `padding: 16px`, plus lățimi explicite de `100%` pentru stack-ul de facturare și cardurile aferente
- Consolidat formularul din `src/components/BillingSettings.css` astfel încât grid-ul, switch-ul de tip client, inputurile și butonul de salvare să respecte `width: 100%` și `box-sizing: border-box` pe mobil
- Forțat cardul de istoric facturare să rămână în viewport prin constrângeri `width/max-width/min-width` în `src/components/BillingHistory.css`, păstrând scroll-ul intern doar pentru tabel
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-27 — Conținut secțiune abonamente centrat

- Centrat containerul principal din `src/components/SubscriptionSection.css` prin `margin: 0 auto`, `display: flex`, `align-items: center` și `text-align: center`, astfel încât header-ul și toggle-ul Lunar/Anual să rămână pe axa centrală
- Centrat cardurile de plan și conținutul lor: titluri, pricing, listă de beneficii și add-on-ul Studio folosesc acum aliniere centrală în loc de layout orientat spre stânga
- Păstrat pe mobil layout-ul cu carduri pe toată lățimea disponibilă, dar cu conținutul fiecărui card centrat vizual
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-27 — Buton „Adaugă galerie” mai mic și aliniat stânga pe mobil

- Ajustat override-ul mobil din `src/components/Dashboard.css` pentru `.dashboard-add-galerie-btn`, fără a modifica stilul desktop
- Pe `max-width: 768px`, butonul nu mai ocupă toată lățimea: `width: auto`, `align-self: flex-start`, `padding: 8px 16px`, `font-size: 13px`
- Păstrat layout-ul mobil existent din `dashboard-section-header`, dar CTA-ul rămâne acum compact și aliniat la stânga
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-27 — Bară progres storage inline și subtilă în Dashboard

- Mutată bara de progres pentru storage din `src/components/Dashboard.jsx` în același rând cu textul de sumar, după segmentul `GB / total`
- Redusă bara în `src/components/Dashboard.css` la `height: 2px`, `max-width: 120px`, `border-radius: 2px`, fundal `#e8e8ed` și fill `#1a1a1f`
- Ajustat `.dashboard-stats-line` pentru layout inline, cu scroll orizontal dacă spațiul este insuficient, astfel încât tot sumarul rămâne pe un singur rând
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-27 — Linie statistici cu progres storage în Dashboard

- Actualizată linia de sumar din `src/components/Dashboard.jsx` să afișeze doar numărul de galerii active și storage-ul folosit din total
- Eliminat complet din sumar afișajul pentru vizualizări și descărcări
- Adăugată sub text o bară de progres subțire în `src/components/Dashboard.css` (`3px`, `#e8e8ed`, fill `#1a1a1f`) cu lățime proporțională la `used / total`
- Ajustat containerul `.dashboard-stats-line` la `padding: 8px 24px 12px`
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-27 — Statistici ca linie text compactă în Dashboard

- Reintrodus în `src/components/Dashboard.jsx` calculul agregatelor folosite anterior de cardurile de overview și randat ca o singură linie text de sumar deasupra filtrelor din galerii
- Linia afișează numărul de galerii active, storage-ul folosit vs limită, vizualizările lunii și descărcările lunii, păstrând aceeași logică de derivare din `galerii`
- Adăugat stilul `.dashboard-stats-line` în `src/components/Dashboard.css` cu `DM Sans`, `12px`, `#a0a0a7`, `padding: 8px 24px`
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-27 — Eliminare carduri statistici din Dashboard

- Eliminată complet secțiunea celor 4 carduri de overview din `src/components/Dashboard.jsx`: `Galerii active`, `Storage folosit`, `Vizualizări luna aceasta`, `Descărcări luna aceasta`
- Scoase calculele derivate folosite exclusiv pentru acea secțiune (`galeriiActive`, `usedGB`, `storagePercent`, `vizualizariLuna`, `descarcariLuna`, `totalPhotos`)
- Eliminat tot CSS-ul asociat claselor `dash-overview*` din `src/components/Dashboard.css`, inclusiv override-urile responsive dedicate
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-27 — Compactare carduri statistici în Dashboard

- Ajustat cardurile de overview din `src/components/Dashboard.css` pentru un format mai compact atât pe desktop, cât și pe mobil
- Reduse dimensiunile principale: `padding: 12px 16px`, `border-radius: 10px`, label `10px` cu `letter-spacing: 0.08em`, valoare `24px`, subtitlu `11px`
- Pe mobil (`max-width: 768px`) cardurile folosesc `padding: 10px 12px`, iar valorile numerice coboară la `20px`
- Eliminat override-ul care cobora cardurile la o singură coloană sub `480px`, astfel încât layout-ul mobil rămâne 2x2
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-27 — Compactare meniu hamburger mobil în Dashboard

- Ajustat meniul hamburger mobil din `src/components/Dashboard.jsx` + `src/components/Dashboard.css` ca panel compact, aliniat la dreapta, în loc de dropdown full-width
- Adăugat overlay semi-transparent sub header (`rgba(0,0,0,0.3)`) care acoperă ecranul sub bara sticky și închide meniul la tap
- Dropdown-ul mobil are acum fundal alb, `max-width: 220px`, item-uri cu `padding: 12px 20px`, `font-size: 14px` și separatoare `border-bottom: 1px solid rgba(0,0,0,0.05)`
- Păstrat flow-ul existent de închidere la selectarea unui item și la interacțiune în afara meniului
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-27 — Dashboard mobile nav mutat sus cu meniu hamburger

- Înlocuit navigația mobilă fixă din partea de jos din `src/components/Dashboard.jsx` + `src/components/Dashboard.css` cu un header sticky de `52px`, fundal alb și border-bottom `rgba(0, 0, 0, 0.06)`
- Adăugat logo-ul `MINA` în stânga, cu `Cormorant Garamond` weight `300`, și buton hamburger `☰` în dreapta
- Implementat meniu slide-down pe mobil pentru tab-urile `Galerii`, `Card`, `Coș de gunoi`, `Site-ul meu`, `Abonament`, `Setări`, cu închidere la selecția unui item sau la tap în afara meniului
- Păstrată navigația desktop existentă în sidebar, folosind aceeași logică de schimbare tab/rută pentru ambele variante
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

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

### 2026-03-25 — Fix drag & drop foldere cu drop zones explicite

- Investigat UX-ul din `src/components/GalleryDetailView.jsx` și confirmat că indicatorul de drop apărea doar pe folderul hover-uit, nu în spațiile reale dintre foldere
- Eliminată logica anterioară bazată pe jumătatea de sus / jos a folderului și introdusă o listă flat cu drop zones explicite între item-uri și după ultimul folder
- Fiecare drop zone se extinde vizual pe dragover și afișează o linie verticală `#1a1a1f`, astfel încât repoziționarea să poată fi făcută clar înainte de primul folder, între două foldere sau după ultimul
- La drop, componenta derivă poziția finală din indexul zonei și o mapează pe `onReorderFolders(...)`, păstrând compatibilitatea cu persistarea existentă din dashboard
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-25 — Polish vizual pentru Client Gallery

- Ajustat `src/components/ClientGallery.jsx` pentru un look mai cald și mai editorial: fundalul paginii a devenit `#f9f8f6`, inclusiv toolbar-ul sticky al folderelor
- Redus gap-ul din masonry grid la `6px` pe desktop, tabletă și mobile prin actualizarea `cg-masonry`, `cg-masonry-col` și a spacing-ului vertical dintre item-uri
- Rafinat tab-urile de foldere: `13px`, `font-weight: 400`, `letter-spacing: 0.04em`, inactive `#9a9a9a`, active cu underline de `1.5px`
- Ajustat butoanele `Favorites`, `Share` și `Descarcă` din header la `13px`, gap de `6px`, text implicit `#6e6e73` și hover `#1a1a1f`
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-25 — Revert fix iOS save / calitate imagini în Client Gallery

- Revertat commitul `e9d770c` (`fix: use img tags for iOS save and improve photo quality`) după regresia confirmată pe mobile, unde interacțiunea cu pozele din client gallery devenise instabilă
- Rulat `git revert e9d770c --no-edit` fără conflicte
- Validat revertul cu `npm run build`
- Redeploy pe hosting cu `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-25 — Debounce pentru emailul de favorite

- Actualizat `functions/index.js` în `onSelectionSaved` ca să consulte `selectionEmailLog/{galleryId}_{clientId}` înainte de trimiterea emailului către fotograf
- Adăugat guard tranzacțional în Firestore: dacă `lastSentAt` este mai nou de 2 ore, emailul este sărit; altfel `lastSentAt` este actualizat și notificarea se trimite
- Adăugat constantă dedicată pentru fereastra de debounce de 2 ore și log de tip `debounced` pentru cazurile în care triggerul este ignorat intenționat
- Validate local cu `node --check functions/index.js` și `npm run build`
- Deploy reușit cu `firebase deploy --only functions --project mina-v1-aea51 --force`

### 2026-03-25 — Indicator nume client în header-ul galeriei

- Actualizat `src/components/ClientGallery.jsx` să afișeze în toolbar un indicator discret cu textul `Bună, {clientName}` atunci când numele clientului există în state-ul galeriei
- Numele este derivat din aceeași sursă folosită pentru selecții (`numeSelectie` / localStorage), fără să modifice flow-ul de favorite sau formularul modal existent
- Adăugat buton mic `✕` lângă indicator pentru resetarea numelui din localStorage și din state-ul curent, astfel încât clientul să poată reintroduce alt nume la următoarea acțiune
- Extins stilurile responsive ale toolbar-ului pentru noul indicator, păstrând tabs-urile și butoanele existente neatinse
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-25 — Liste multiple de favorite pentru clienți

- Extins `src/modules/galleries/galleries.service.js` pentru a salva selecțiile clientului și în format nou `lists: [{ id, name, keys }]`, păstrând totodată câmpul `keys` ca uniune pentru compatibilitate cu flow-urile existente
- Actualizat `src/components/ClientGallery.jsx` să încarce, salveze și randaze multiple liste de favorite folosind aceeași identitate locală a clientului (`numeSelectie`)
- La click pe inimă se deschide acum un picker mic cu listele existente și acțiunea `+ Listă nouă`, inclusiv input inline pentru numele listei
- În modul `Favorites`, fiecare listă apare ca tab separat, cu meniuri mici pentru redenumire și ștergere
- Păstrată compatibilitatea pentru clienții existenți fără `lists`, care sunt migrați local într-o listă implicită `Favorite`
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-26 — Fix indicator nume client și creare imediată listă nouă

- Mutat indicatorul `Bună, {clientName}` din toolbarul de sus în partea de jos a paginii, deasupra footerului, păstrând butonul `✕` pentru resetarea numelui
- Ajustat stilul indicatorului pentru poziționare centrată și prezentare discretă (`13px`, `#9a9a9a`)
- Eliminat butoanele separate `Anulează` / `Salvează` din inputul de creare listă nouă din `src/components/ClientGallery.jsx`
- Lista nouă se creează acum automat la `Enter` sau la `blur`, iar `Escape` anulează inputul fără salvare
- Actualizat și handlerul global de click-outside ca să nu închidă pickerul înainte ca `blur` să confirme lista nouă
- Rulate cu succes `npm run build` și `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-26 — Corecție poziție nume client și salvare listă nouă

- Mutat indicatorul `Bună, {clientName}` înapoi în header, în dreapta, înainte de butoanele `Favorites`, `Share` și `Descarcă`, pentru a rămâne mereu vizibil indiferent de numărul de poze
- Ajustat stilul indicatorului la `12px`, `#9a9a9a`, păstrând butonul `✕` pentru resetarea numelui
- Reparat flow-ul de creare listă nouă din `src/components/ClientGallery.jsx`: confirmarea folosește acum valoarea curentă din input, nu o valoare stale din state
- La `Enter`, handlerul face `preventDefault()` și apelează direct crearea listei; la `blur`, lista se creează cu textul curent din input; `Escape` continuă să anuleze fără salvare
- Validat cu `npm run build` și redeploy pe hosting prin `FIREBASE_PROJECT_ID=\"mina-v1-aea51\" npm run deploy:hosting`

### 2026-03-26 — Fix creare listă nouă cu ref și guard Enter/blur

- Refăcut flow-ul de `+ Listă nouă` din `src/components/ClientGallery.jsx` pentru a evita stale closure pe valoarea inputului
- Adăugat `newFavoriteListInputRef` pentru a citi valoarea curentă direct din input în momentul confirmării
- Adăugat `newFavoriteListHandledRef` ca să diferențieze confirmarea pornită de `Enter` față de `blur` și să prevină dublul trigger
- La `Enter`, handlerul face `preventDefault()`, citește valoarea din ref și creează lista imediat, adăugând poza curentă în ea
- La `blur`, lista se creează doar dacă nu a fost deja procesată de Enter; la `Escape`, anularea consumă blur-ul ulterior fără să salveze lista

### 2026-03-26 — Fix liste favorite + debounce email selecții

- Commit `63234cd` — `fix: favorites lists working - fix firestore rules and picker ref`
- Mersat fixul pentru pickerul inline din `src/components/ClientGallery.jsx`, astfel încât `inputRef` și `onNewListBlur` să ajungă până la inputul real din grid
- Actualizate `firestore.rules` pentru a permite câmpul `lists` în `gallerySelections/{galleryId}/clients/{clientId}`, deblocând salvarea listelor multiple de favorite
- În `functions/index.js`, `onSelectionSaved` folosește acum lungimea reală a `keys` pentru a decide trimiterea emailului și ignoră selecțiile goale rezultate doar din crearea unei liste fără poze
- Adăugat log explicit pentru verificarea debounce-ului: cheia `selectionEmailLog/{galleryId}_{clientId}`, existența documentului și `lastSentAt`, ca să fie vizibil imediat dacă triggerul citește logul corect
- Rulate cu succes `node --check functions/index.js`, `npm run build` și `npx firebase-tools deploy --only functions --project mina-v1-aea51 --force`

### 2026-03-26 — Debounce email favorite extins la 8 ore

- Modificată constanta `SELECTION_EMAIL_DEBOUNCE_MS` din `functions/index.js` de la `2 * 60 * 60 * 1000` la `8 * 60 * 60 * 1000`
- Păstrată aceeași cheie de debounce `selectionEmailLog/{galleryId}_{clientId}` și același flow tranzacțional; s-a schimbat doar fereastra de timp
