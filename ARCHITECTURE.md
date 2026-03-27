# ARCHITECTURE.md — Mina v1
> Ultima actualizare: 2026-03-28

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
- `sendContactNotification` — email notificare contact
- `sendWelcomeEmail` — email bun venit la înregistrare
- `onSelectionSaved` — email automat către fotograf când clientul salvează favorite
- `sendGalleryLink` — trimite link-ul galeriei către client prin email
- Stripe webhooks: checkout.session.completed, subscription.deleted, payment_failed, dispute.created

## Variabile de mediu Worker (Cloudflare)
- FIREBASE_API_KEY, FIREBASE_PROJECT_ID
- B2_ENDPOINT, B2_BUCKET_NAME, B2_KEY_ID, B2_APPLICATION_KEY (Secret)

## Variabile de mediu Functions (Firebase Secrets)
- B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- RESEND_API_KEY, SMARTBILL_*

## Planuri Stripe Live
- Free: 0 lei, 15GB
- Esențial: 29lei/lună, 100GB — price_1TAzSw1ax2jGrLZHiihltxme
- Plus: 49lei/lună, 500GB — price_1TAzSx1ax2jGrLZH9zPBW4PW
- Pro: 79lei/lună, 1TB — price_1T6a4F1ax2jGrLZH92vUsGzE
- Studio: 129lei/lună, 2TB — price_1T6a501ax2jGrLZHgLBbkzT4

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
