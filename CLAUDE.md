# CLAUDE.md — Mina v1

> Ultima actualizare: 28 Februarie 2026
> Proiect activ: `/Users/daniellapadus/Desktop/mina-v1`
> Referință (neatinsă): `fotolio`

---

## ⛔ REGULI CRITICE — NU ÎNCĂLCA NICIODATĂ

### Fișiere protejate — nu modifica fără aprobare explicită:
- `src/components/ClientGallery.jsx` — FUNCȚIONAL, TESTAT
- `src/hooks/useUserSubscription.js` — FUNCȚIONAL, TESTAT
- `src/firebase.js` — FUNCȚIONAL, TESTAT
- `src/r2.js` — FUNCȚIONAL, TESTAT
- `src/components/LandingPage.jsx` + `.css` — FUNCȚIONAL, TESTAT
- `src/components/PhotographerSite.jsx` + `.css` — FUNCȚIONAL, TESTAT
- `src/components/Register.jsx` — FUNCȚIONAL, TESTAT
- `src/components/SiteEditor.jsx` — FUNCȚIONAL, TESTAT
- `src/App.jsx` — NU atinge routing-ul sau rutele existente
- `src/main.jsx` — NU atinge

### Reguli de workflow:
1. **Creează branch nou** înainte de orice modificare: `git checkout -b feature/nume-feature`
2. **Creează fișiere NOI** ori de câte ori e posibil, în loc să editezi existente
3. **Nu șterge și nu redenumi** funcții, componente, props sau variabile de state existente
4. **Nu schimba** import path-uri în fișiere pe care nu le-ai creat tu
5. **Rulează `npm run build`** după fiecare modificare pentru a verifica că nimic nu e stricat
6. **Dacă build-ul pică**, repară eroarea înainte de orice altă modificare
7. **Întreabă userul** înainte să modifici orice fișier care nu e specificat explicit în task

---

## 🧠 CE ESTE MINA

Mina este o platformă SaaS dedicată fotografilor de eveniment din România. Combină un sistem de management al galeriilor cu livrare digitală profesională către clienți.

**Problema rezolvată:** Fotografii livrau poze prin WeTransfer sau Google Drive — fără branding, fără control, fără estetică. Mina oferă galerii personalizate, control complet și monetizare prin abonamente.

**Target:** Fotografi de eveniment din România, 500–2000 lei/eveniment, activi intensiv aprilie–octombrie. Expansiune europeană planificată post-lansare RO.

**Domeniu:** `cloudbymina.com` — cumpărat, neconectat încă.

**Live:** `https://mina-v1-aea51.web.app`

---

## 🛠 STACK TEHNIC

### Frontend
- React `^19.2.0` + Vite `^7.3.1`
- React Router DOM `^7.13.0`
- Firebase Web SDK `^12.9.0`
- `lucide-react ^0.574.0`
- `react-masonry-css ^1.0.16`
- `yet-another-react-lightbox ^3.29.1`
- `browser-image-compression ^2.0.2`

### Backend / Serverless
- Firebase Functions v2 (Node 22)
- `firebase-admin ^12.7.0`
- `firebase-functions ^6.6.0`
- `stripe ^18.5.0`

### Storage / Media
- Cloudflare Worker + R2 (`r2-worker.js`, `wrangler.toml`)
- Firestore pentru date business

### Billing
- Stripe + Firebase Extension `invertase/firestore-stripe-payments@0.3.12`
- SmartBill API — emitere factură + download PDF

### QA / Tooling
- ESLint 9, Playwright, teste node native (`node --test`)
- Scripturi: `qa:public`, `qa:auth`, `qa:worker`, `smoke`, `preflight`

### Deploy
- Firebase Hosting (auto-deploy din GitHub)
- Worker live: `mina-v1-r2-worker.lapadusdaniel.workers.dev`

---

## 📁 STRUCTURA PROIECTULUI

```
mina-v1/
├── src/                         # Aplicația React principală
│   ├── core/bootstrap/          # Inițializare runtime + service container
│   ├── modules/                 # Logică pe domenii
│   │   ├── auth/
│   │   ├── galleries/
│   │   ├── media/
│   │   ├── billing/
│   │   ├── sites/
│   │   └── admin/
│   ├── components/              # UI principal
│   │   ├── Dashboard.jsx        # Dashboard fotograf (componenta principală)
│   │   ├── ClientGallery.jsx    # ⛔ View client — NU ATINGE
│   │   ├── PhotographerSite.jsx # Site public fotograf
│   │   ├── Subscription.jsx     # UI abonament + facturi
│   │   ├── Admin.jsx            # Panel admin
│   │   └── Settings.jsx         # Setări branding + temă
│   ├── hooks/
│   │   └── useTheme.js          # Persistare + aplicare temă
│   ├── styles/
│   │   └── themes.css           # Sistem variabile CSS pe teme
│   └── r2.js                    # Client frontend → Worker
├── functions/                   # Webhook Stripe + SmartBill service
├── worker/                      # Gateway media securizat pentru R2
├── apps/                        # [INCERT] scaffold pentru extindere
├── packages/                    # [INCERT] scaffold pentru extindere
├── infra/                       # [INCERT] scaffold pentru extindere
├── firestore.rules
└── firebase.json
```

---

## 🎨 DESIGN LANGUAGE

- **Stil:** Apple-inspired, clean, minimal
- **Font body:** `DM Sans`
- **Font heading:** `DM Serif Display`
- **Culori:**
  - Dark: `#1d1d1f`
  - Muted: `#86868b`
  - Accent gold: `#bf9b30`
- **Border radius:** 10–16px pentru carduri
- **Teme disponibile:** Luxos, Minimal, Îndrăzneț, Cald
- **Sistem teme:** `data-theme` pe `<html>` cu CSS custom properties, persistat în `profiles/{uid}`

---

## ✅ CE E FUNCȚIONAL COMPLET

**Autentificare:**
- Register / login / logout email-parolă
- Bootstrap automat `users/{uid}` + `setariFotografi/{uid}` la înregistrare
- Route guard pe dashboard/settings

**Galerii:**
- CRUD complet — creare, editare, soft-delete, recovery
- Expirare galerie
- Galerii cu parolă
- Selecții client + agregate selecții
- Recenzii

**Media:**
- Upload cu progress bar
- Derivative paths: `originals/`, `medium/`, `thumbnails/`
- Delete individual și bulk
- Share token per galerie
- Thumbnails pentru grid, medium pentru lightbox, original pentru descărcare

**Worker securizat:**
- Verificare token Firebase la write
- Ownership check pe gallery/branding
- Cotă storage enforced backend (`403 Quota Exceeded`)
- Rate limiting (`READ: 600 req/60s`, `WRITE: 180 req/60s`) cu răspuns `429 + Retry-After: 60`
- Cache headers diferențiate public vs token route

**Billing:**
- Stripe Checkout via Firestore extension
- Watch plan din `subscriptions` + admin override
- Billing details B2C/B2B cu validare
- Istoric plăți + istoric facturi în UI
- Anulare abonament la finalul perioadei
- Fallback download PDF factură prin callable function

**Stripe + SmartBill:**
- Webhook `checkout.session.completed` cu verificare semnătură
- Rezolvare UID robustă (client_reference_id / metadata / customer / subscription)
- Idempotency lock via `stripeWebhookEvents/{eventId}`
- Emitere factură SmartBill + salvare în `users/{uid}/invoices/{invoiceId}`

**Sistem teme:**
- 4 teme end-to-end
- Selector în Settings
- Persistență în Firestore

**Dashboard:**
- Lazy-load cover-uri
- Sidebar navigație
- Overview abonament
- Galerii cu stats, toggle status, gestionare

**ClientGallery (view public):**
- Accesare prin slug
- Lightbox cu navigare keyboard
- Favorite + filtrare
- Download individual
- Share link
- Verificare expirare + status activ

---

## ❌ CE E INCOMPLET SAU ÎN PROGRES

| Item | Status | Note |
|------|--------|------|
| `billing.getCurrentPlan()` | ❌ Neimplementat | Aruncă eroare explicită |
| Formular contact Landing Page | ❌ Nefuncțional | Doar `preventDefault()` |
| Prețuri în UI | ⚠️ Greșite | Afișează 100/150 lei, corect: 49/99/149 lei |
| Domeniu `cloudbymina.com` | ⚠️ Neconectat | Cumpărat, nepublicat |
| Email tranzacțional | ❌ Lipsă | Niciun fotograf nu primește confirmare sau link galerie |
| GDPR / T&C | ❌ Lipsă | Obligatoriu pentru lansare |
| Onboarding fotograf nou | ❌ Lipsă | |
| Domeniu custom per fotograf | ❌ Lipsă | Feature PRO planificat |
| Tab-uri dashboard (Previews, Reviews, Analytics, Settings) | ⚠️ Placeholder | Doar Drive e funcțional |
| Download ZIP | ⚠️ Parțial | Descarcă fișiere individual, nu ZIP |
| Settings.jsx theming | ⚠️ Parțial | Încă mult inline style, theming neuniform |
| Legacy `fotolio-*` / `setariFotografi` | ⚠️ Activ | Fallback-uri active, risc complexitate |

---

## 🔴 PROBLEME ȘI RISCURI TEHNICE

### Critice:
1. **Inconsistență compresie imagini** — `AdminGalleryForm` are setări diferite față de `Dashboard/GallerySettingsModal`. Impact direct pe calitate și performanță.
2. **`billing.getCurrentPlan()` neimplementat** — blochează funcționalități de billing.
3. **Prețuri greșite în UI** — risc de confuzie la lansare.

### Medii:
4. **Legacy activ** — `setariFotografi`, `selectii` legacy, `localStorage fotolio-*` rulează paralel cu logica nouă. Risc de comportament neuniform.
5. **`syncSelectionAggregates`** — scan complet pe toți clienții la fiecare salvare. Poate deveni costisitor la galerii mari. `[INCERT]`
6. **Stripe API version fixată** la `2024-06-20` în Functions — posibil drift față de contul Stripe în viitor. `[INCERT]`
7. **apps/packages/infra** — directoare în paralel cu app-ul live. Risc confuzie de mentenanță dacă nu există plan clar de convergență. `[INCERT]`

### Minore:
8. **Settings.jsx** — inline styles hardcodate, theming incomplet uniform.
9. **Formular contact** — nefuncțional (`preventDefault` fără logică).

---

## 🔄 FLOW-URI PRINCIPALE

### Auth:
```
App pornește watchSession
→ dacă user există → normalizează + asigură profil
→ route guard pe /dashboard, /settings
→ redirect la login dacă neautentificat
```

### Galerie (fotograf → client):
```
Fotograf creează galerie
→ uploadează poze → Worker → R2 (originals + medium + thumbnails)
→ copiază link
→ clientul deschide /galerie/{slug}
→ navighează, marchează favorite, trimite review
→ fotograful vede selecțiile în dashboard
```

### Billing:
```
User pornește checkout
→ document în customers/{uid}/checkout_sessions
→ Stripe completează checkout
→ webhook Firebase Function
→ validare semnătură + rezolvare UID + idempotency lock
→ citire billingDetails + email client
→ emitere SmartBill + salvare invoice în Firestore
→ UI Abonament citește overview + invoices
→ download PDF direct din URL sau fallback callable
```

### Routing:
- `/` → landing / redirect
- `/dashboard` → protected
- `/settings` → protected
- `/admin` → protected, role check
- `/gallery/:id` → public
- `/:slug` → SlugRouter → site sau galerie

---

## 🗺 FIRESTORE SCHEMA

```
users/{uid}
  - storageUsedBytes: number
  - role: string
  - billingDetails: object

users/{uid}/invoices/{invoiceId}
  - SmartBill invoice data

customers/{uid}/checkout_sessions/{id}
  - Stripe checkout session

subscriptions/{uid}
  - plan curent

galerii/{galerieId}
  - nume, slug, userId, userName
  - dataEveniment, dataExpirare
  - statusActiv: boolean
  - coverUrl, poze: number
  - createdAt: timestamp
  - passwordHash: string (opțional)

  gallerySelections/{galleryId}/clients/{clientId}
    - selecții client (structură nouă, scalabilă)

stripeWebhookEvents/{eventId}
  - idempotency lock

profiles/{uid}
  - tema curentă
```

### Storage R2:
```
galerii/{galleryId}/originals/{file}
galerii/{galleryId}/medium/{file}
galerii/{galleryId}/thumbnails/{file}
```

---

## 📋 PAȘI URMĂTORI (în ordinea priorității)

### Blocker pentru lansare:
1. Implementează `billing.getCurrentPlan()`
2. Actualizează prețurile în UI: 49 / 99 / 149 lei
3. Adaugă email tranzacțional (confirmare înregistrare + link galerie)
4. GDPR — Termeni și Condiții
5. Conectează domeniul `cloudbymina.com`

### High priority:
6. Repară inconsistența de compresie imagini între `AdminGalleryForm` și `Dashboard`
7. Implementează formularul de contact din Landing Page
8. Download ZIP favorite (folosește JSZip)
9. Elimină legacy `fotolio-*` și `setariFotografi` treptat

### Medium priority:
10. Refactor Settings.jsx — elimină inline styles, unifică theming
11. Implementează tab-urile placeholder din dashboard (Analytics minim)
12. Onboarding fotograf nou

---

## ⚙️ VARIABILE DE ENVIRONMENT

Proiectul folosește validare strictă env la startup — dacă lipsesc variabile, apare ecran de eroare. Verifică `.env` înainte de orice deploy.

Variabile necesare (verifică `appBootstrap.js` pentru lista completă):
- Firebase config (apiKey, projectId, etc.)
- `VITE_R2_WORKER_URL`
- Stripe price IDs
- SmartBill credentials
- `FIREBASE_PROJECT_ID` pentru deploy

---

## 📝 NOTE IMPORTANTE

- **Proiect de referință `fotolio`** — există ca backup, nu se atinge
- **Worklog** — modificările sunt urmărite în `WORKLOG.md` cu commit hash + rezultat QA
- **Teste:** `npm run test` → 20/20 PASS, `npm run qa:worker` → PASS
- **Stripe API version:** `2024-06-20` — monitorizează drift-ul față de cont
- Orice referință la "Fotolio" în cod sau UI trebuie înlocuită cu "Mina"