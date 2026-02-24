# Architecture (Mina v1)

## Stack
1. Frontend: React + Vite (rapid pentru MVP).
2. Auth + DB: Firebase Auth + Firestore.
3. Media storage: Cloudflare R2.
4. Media gateway: Cloudflare Worker (upload/get/delete).
5. Billing: Stripe + webhook.

## Module principale
1. `auth` - login/register/session.
2. `galleries` - CRUD galerii + status.
3. `media` - upload/list/get/delete poze.
4. `public-gallery` - pagina client + favorite.
5. `billing` - checkout + entitlement plan.
6. `admin` - strict separat de user flow.

## Regula de design
Frontend nu decide securitatea. Frontend doar cere actiuni.
Securitatea reala este in: Firestore rules + Worker checks + Stripe webhook verification.
