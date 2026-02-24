# Release Checklist (Mina v1)

Checklist final, foarte simplu, inainte sa pui live.

## 1) Lucrezi in folderul corect
```bash
cd /Users/daniellapadus/Desktop/mina-v1
git branch --show-current
```
Trebuie sa vezi `main`.

## 2) Preflight tehnic
Ruleaza o singura comanda:
```bash
npm run preflight
```
Rezultat asteptat:
1. `.env` valid (fara `MISSING` la required).
2. `vite build` finalizat fara erori.

## 3) Smoke test rapid
In terminalul 1:
```bash
npm run dev -- --host 127.0.0.1 --port 5180
```
In terminalul 2 (foloseste URL-ul real afisat de Vite):
```bash
npm run smoke -- http://127.0.0.1:5181
```
Rezultat asteptat: `Smoke check PASSED.`

## 4) QA auth automat (optional, recomandat)
Daca ai un cont de test:
```bash
QA_EMAIL="test@example.com" QA_PASSWORD="parola123" npm run qa:auth -- http://127.0.0.1:5181
```
Rezultat asteptat: `QA Auth PASSED.`

## 5) Verificare manuala minima
1. Home page se incarca.
2. Login + Register functioneaza.
3. Dashboard se deschide dupa login.
4. Creezi galerie noua si incarci poze.
5. Link public galerie se deschide.
6. Favorite/selectie functioneaza in pagina client.
7. Admin panel functioneaza doar pentru UID admin.

## 6) Firestore rules deploy
Cand totul e validat:
```bash
FIREBASE_PROJECT_ID="mina-v1-aea51" npm run deploy:rules
```

## 7) Hosting deploy
```bash
FIREBASE_PROJECT_ID="mina-v1-aea51" npm run deploy:hosting
```

## 8) Worker deploy + QA worker
```bash
npm run deploy:worker
npm run qa:worker
```

## 9) Stripe mode check (obligatoriu inainte de live)
1. In `.env`, `VITE_STRIPE_PRICE_PRO` si `VITE_STRIPE_PRICE_UNLIMITED` trebuie sa fie din acelasi mode (test sau live) cu Stripe extension-ul din Firebase.
2. In Stripe Dashboard, verifica planurile si preturile active.
3. Testeaza un checkout cap-coada in mode-ul ales.

## 10) Dupa deploy
1. Refa rapid `qa:public` pe URL-ul live.
2. Verifica manual cel putin o galerie reala cap-coada.
3. Verifica un delete de galerie: nu raman fisiere orfane in R2.
