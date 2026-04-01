# ARCHITECTURE.md — Mina v1
> Ultima actualizare: 2026-04-01

## Pagini și Rute
- `/` — LandingPage.jsx
- `/dashboard` — Dashboard.jsx (protected)
- `/settings` — Settings.jsx (protected)
- `/admin` — Admin.jsx (protected, role check)
- `/termeni` — Termeni.jsx ✅ implementat
- `/confidentialitate` — Confidentialitate.jsx ✅ implementat
- `/refund` — Refund.jsx ✅ implementat
- `/:slug` — SlugRouter → PhotographerSite sau ClientGallery

## Storage
- **Provider:** Backblaze B2 (migrat de la Cloudflare R2 pe 2026-03-22)
- **Bucket:** mina-photos
- **Endpoint:** s3.us-east-005.backblazeb2.com
- **Worker:** mina-v1-r2-worker.lapadusdaniel.workers.dev
- **Upload:** presigned URLs direct la B2 din browser
- **Serving:** GET prin Worker (SigV4 signing, cache Cloudflare)
- **Delete poză:** Worker DELETE
- **Delete galerie:** Firebase Function deleteGalleryAssets → B2 Native API

## Firebase Functions
- `deleteGalleryAssets` — șterge toate fișierele unei galerii din B2 + Firestore
- `updateStorageUsed` — actualizează `users/{uid}.storageUsedBytes` prin Admin SDK doar pentru apeluri Worker semnate cu `X-Worker-Secret`
- `sendContactNotification` — email notificare contact
- `sendWelcomeEmail` — email bun venit la înregistrare
- `onSelectionSaved` — email automat către fotograf când clientul salvează favorite
- `sendGalleryLink` — trimite link-ul galeriei către client prin email
- `verifyGalleryPassword` — verificare parolă galerie server-side, returnează token HMAC semnat 24h
- `checkGalleryUnlockToken` — verifică token de deblocare galerie (stateless, fără Firestore)
- `saveGalleryPassword` — salvează sau șterge parola galeriei în `gallerySecrets/{galleryId}`
- Stripe webhooks: checkout.session.completed, subscription.deleted, payment_failed, dispute.created

## Variabile de mediu Worker (Cloudflare)
- FIREBASE_API_KEY, FIREBASE_PROJECT_ID
- B2_ENDPOINT, B2_BUCKET_NAME, B2_KEY_ID, B2_APPLICATION_KEY (Secret)

## Variabile de mediu Functions (Firebase Secrets)
- B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- RESEND_API_KEY, SMARTBILL_*
- GALLERY_VERIFY_SECRET — secret HMAC pentru tokenuri de deblocare galerie protejată cu parolă

## Planuri Stripe Live
- Free: 0 lei, 15GB
- Esențial: 29lei/lună, 100GB — price_1TAzSw1ax2jGrLZHiihltxme
- Plus: 49lei/lună, 500GB — price_1TAzSx1ax2jGrLZH9zPBW4PW
- Pro: 79lei/lună, 1TB — price_1T6a4F1ax2jGrLZH92vUsGzE
- Studio: 129lei/lună, 2TB — price_1T6a501ax2jGrLZHgLBbkzT4

## Securitate

### Parolă galerie (server-side, 2026-03-31)
- `gallerySecrets/{galleryId}` — colecție privată Firestore (read/write: owner only în rules; Firebase Admin SDK scrie server-side)
  - Stochează `passwordHash` (SHA-256 hex al parolei)
- Callable `verifyGalleryPassword(galleryId, password)`: verificare server-side + returnare token HMAC-SHA256 (24h)
- Callable `checkGalleryUnlockToken(galleryId, token)`: verificare stateless semnătură + expirare
- Callable `saveGalleryPassword(galleryId, password)`: verifică owner-ul și scrie hash-ul exclusiv în `gallerySecrets/{galleryId}`; șterge și orice `settings.privacy.passwordHash` legacy din documentul public `galerii/{id}`
- `ClientGallery.jsx`: apelează callable, stochează token semnat în sessionStorage (nu hash-ul)
- Migration: `scripts/migrate-gallery-passwords.js` — migrare one-time hash din documentul public în `gallerySecrets/`

### Presigned URL upload + storage sync server-side (2026-04-01)
- Presigned PUT URL-urile sunt legate de un Content-Type specific prin `X-Amz-SignedHeaders: content-type;host`
- Endpoint `POST /confirm-upload` pe Worker: HEAD pe B2 după upload, șterge dacă depășește `MAX_UPLOAD_BYTES` sau Content-Type incorect
- `POST /confirm-upload` verifică și cota storage înainte de confirmarea finală
- `Dashboard.jsx` apelează `/confirm-upload` după fiecare presigned PUT
- Worker-ul sincronizează `storageUsedBytes` prin Function-ul `updateStorageUsed` după upload confirmat, upload direct `PUT` și după delete pe fișier sau prefix galerie, folosind bytes reali din B2
- `updateStorageUsed` acceptă doar apeluri Worker semnate prin header `X-Worker-Secret`
- Scrierile client-side către `users/{uid}.storageUsedBytes` au fost eliminate

### Firestore rules (2026-04-01)
- `users/{userId}` update: `affectedKeys()` blochează și `storageUsedBytes` și `addonActive` de la modificare client-side
- Doar Firebase Admin SDK (funcții server-side) poate scrie câmpurile operaționale
- `galerii/{galleryId}`, `folders` și `photos` sunt public-readable doar dacă galeria este explicit publică (`publicShareRequired == false`), activă și neexpirată
- `gallerySecrets/{galleryId}` este accesibil doar owner-ului în Firestore rules
- Galeriile publice trebuie acum să fie active și neexpirate: `dataExpirareTs == null || dataExpirareTs > request.time`
- `dataExpirare` rămâne string pentru compatibilitate UI, iar `dataExpirareTs` este timestamp-ul folosit în rules

### Worker fail-closed (2026-03-31)
- Orice eroare la citirea metadatelor galeriei din Firestore → 403 (nu servește fișiere)
- Env vars lipsă → aruncă eroare → 403
- Gallery doc lipsă (404) → 403
- `statusActiv === false` → 403
- `dataExpirare` < now → 403

## Site fotograf public (`/:slug`)

**PhotographerSite.jsx** — navigare cu 5 tabs sticky (Acasă, Portofoliu, Prețuri, Despre, Contact):
- Acasă: hero full-screen cu `coverPhotoPath` (fallback `heroImagePath`)
- Portofoliu: filter categorii din `portfolio[]` + masonry + lightbox
- Prețuri: secțiuni per `pricing[].eventType` cu carduri pachete
- Despre: `profilePhotoPath` + bio + stats + `socialLinks`
- Contact: formular → `contactMessages/{photographerUid}` în Firestore

**SiteEditor.jsx** — editor two-panel (340px stânga sticky + preview live dreapta):
- Panel stânga: tabs editor (Acasă, Portofoliu, Prețuri, Despre), sticky la `top: 104px`
- Panel dreapta: `<PhotographerSite previewData={...} />` actualizat în timp real
- Upload cover: `branding/{uid}/cover.{ext}`
- Upload profil: `branding/{uid}/profile-photo.{ext}`
- Upload portofoliu: `branding/{uid}/portfolio/{catId}/{ts}-{file}`
- Pachet `featured: boolean` → badge "Recomandat" + border accentuat în preview
- Salvare în `photographerSites/{uid}` cu sync câmpuri legacy
- Mobile: toggle `showFullPreview` pentru preview full-screen

**Câmpuri noi în `photographerSites/{uid}`:**
```
tagline, bio, coverPhotoPath, profilePhotoPath,
socialLinks: { instagram, facebook, website },
portfolio: [{ id, name, photos: [{ key }] }],
pricing: [{ id, eventType, packages: [{ id, name, price, description, inclusions[] }] }]
```

## Ce e implementat ✅
- Auth complet (register/login/logout)
- Dashboard fotograf cu upload, galerii, folder management, sumar compact inline pentru galerii active + storage, CTA mobil compact pentru adăugare galerie și meniu contextual galerii ancorat corect pe mobil
- Galerie client publică (masonry, lightbox, favorite, download)
- Abonamente Stripe live cu facturi SmartBill și secțiune de subscription centrată pentru header, toggle și cardurile de plan
- Email bun venit (Resend)
- Email notificări favorite + trimitere link galerie prin Resend
- Pagini legale (Termeni, Confidențialitate, Refund)
- Admin panel

## Ce lipsește ❌
- Responsive mobil parțial: dashboard și pagina Settings/Facturare au primit ajustări mobile dedicate, restul suprafețelor încă necesită lucru
- Landing page actualizat
- Logică retenție galerii (grace period, cold storage, ștergere ziua 91)
