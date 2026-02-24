# Setup Infrastructura Separata (Mina v1)

Scop: Mina v1 sa NU atinga deloc `fotolio` existent.

Lucrezi doar aici:

```bash
cd /Users/daniellapadus/Desktop/mina-v1
```

## 1) Creeaza proiect Firebase nou (separat)

In browser:
1. Deschide Firebase Console.
2. Create project.
3. Nume recomandat: `mina-v1-dev`.
4. La final, copiaza `Project ID` (ex: `mina-v1-dev-abc12`).

## 2) Conecteaza local folderul la proiectul nou

In terminal, ruleaza:

```bash
npx --yes firebase-tools login
npx --yes firebase-tools use --add
```

Cand intreaba:
1. alegi proiectul nou `mina-v1-dev-...`
2. alias: `default`

Verifica:

```bash
cat .firebaserc
```

Trebuie sa vezi `default` cu noul Project ID, nu `fotolio-7eb14`.

## 3) Configureaza Firebase Web App pentru Mina v1

In Firebase Console (proiect nou):
1. Add app -> Web app.
2. Copiaza valorile config.
3. Pune-le in `.env` din `mina-v1`.

Campuri necesare:
1. `VITE_FIREBASE_API_KEY`
2. `VITE_FIREBASE_AUTH_DOMAIN`
3. `VITE_FIREBASE_PROJECT_ID`
4. `VITE_FIREBASE_STORAGE_BUCKET`
5. `VITE_FIREBASE_MESSAGING_SENDER_ID`
6. `VITE_FIREBASE_APP_ID`
7. `VITE_R2_WORKER_URL`

Verificare:

```bash
npm run check:env
```

## 4) Activeaza servicii Firebase minime

In proiectul nou:
1. Authentication -> Sign-in method -> Email/Password -> Enable.
2. Firestore Database -> Create database (production mode).
3. Hosting -> Get started.

## 5) Cloudflare separat (worker + bucket)

In Cloudflare Dashboard:
1. Creezi Worker nou (ex: `mina-r2-worker-dev`).
2. Creezi bucket R2 nou (ex: `mina-v1-media-dev`).
3. Bindezi bucketul la Worker cu numele `R2_BUCKET`.
4. Setezi secrets la Worker:
   - `FIREBASE_API_KEY` (din proiectul Firebase nou)
   - `FIREBASE_PROJECT_ID` (Project ID din Firebase nou)

Apoi pui:
1. URL Worker in `VITE_R2_WORKER_URL`
2. valorile Firebase in `.env` local.

## 6) Deploy doar pe proiectul nou

IMPORTANT: folosim scripturi cu `FIREBASE_PROJECT_ID` explicit.

```bash
FIREBASE_PROJECT_ID="mina-v1-dev-abc12" npm run deploy:rules
FIREBASE_PROJECT_ID="mina-v1-dev-abc12" npm run deploy:hosting
```

## 7) QA final pe proiectul nou

1. Creezi un cont de test in app.
2. Rulezi:

```bash
npm run preflight
npm run smoke -- https://<noul-proiect>.web.app
QA_EMAIL="test@example.com" QA_PASSWORD="parola123" npm run qa:auth -- https://<noul-proiect>.web.app
```

## Regula de siguranta

Nu rula comenzi de deploy fara `--project` sau fara `FIREBASE_PROJECT_ID`.
Asa nu atingi proiectul vechi.
