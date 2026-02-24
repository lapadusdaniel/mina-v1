# QA Checklist (Mina v1)

Checklist simplu, pas cu pas, inainte de push/deploy.

## 1) Setup local
1. Deschide terminalul in:
```bash
cd /Users/daniellapadus/Desktop/mina-v1
```
2. Verifica branch-ul:
```bash
git branch --show-current
```
Trebuie sa vezi `codex/mina-v1`.

## 2) Config minim
1. Verifica `.env`:
```bash
npm run check:env
```
2. Daca vezi `MISSING`, completeaza variabila in `.env` si reruleaza.

## 3) Build
1. Ruleaza:
```bash
npm run build
```
2. Rezultat asteptat: `built in ...` fara erori.

## 4) Smoke test (anti-white-screen)
1. Porneste serverul local:
```bash
npm run dev -- --host 127.0.0.1 --port 5180
```
2. Daca 5180 e ocupat, Vite da alt port (ex: 5181). Copiaza URL-ul afisat.
3. In al doilea terminal:
```bash
npm run smoke -- http://127.0.0.1:5181
```
4. Rezultat asteptat: `Smoke check PASSED.`

## 5) QA auth automat (optional, recomandat)
Daca ai un cont de test:
```bash
QA_EMAIL="test@example.com" QA_PASSWORD="parola123" npm run qa:auth -- http://127.0.0.1:5181
```
Rezultat asteptat: `QA Auth PASSED.`

## 6) Verificare manuala minima
1. Home page se incarca.
2. Login/Register se incarca.
3. Dashboard se deschide dupa autentificare.
4. Creezi o galerie test si incarci poze.
5. Link-ul galeriei se deschide public.
6. Favorite/selectie functioneaza din pagina client.
7. Admin panel se deschide doar pentru admin UID.

## 7) Reguli Firestore
Cand totul e OK local:
```bash
firebase deploy --only firestore:rules
```
