# Security (Mina v1)

Acest proiect ramane pe stack-ul actual: Firebase + Cloudflare + Stripe.
Scopul este securitate buna fara over-engineering.

## Ce am securizat
1. Reguli Firestore explicite pentru owner/admin/public in functie de colectie.
2. Admin validat si in rules, nu doar in UI.
3. Checkout Stripe permis doar pentru userul logat pe propriul `uid`.
4. Contact form public limitat la campuri permise.
5. Update public in `galerii` limitat strict la campuri de selectie (fara ownership/config).
6. Selecțiile client sunt mutate in `gallerySelections/{galleryId}/clients/{clientId}` pentru a evita cresterea necontrolata a documentului `galerii`.

## Firestore rules (pe scurt)
1. `users/{uid}`: owner + admin read; owner create; owner nu poate modifica `plan/status`.
2. `users/{uid}/settings/*`: owner/admin.
3. `profiles/{uid}` si `photographerSites/{uid}`: read public, write owner/admin.
4. `galerii/{id}`: read public doar pentru galerii active; write complet owner/admin; public update doar pe campuri whitelist de selectie.
5. `gallerySelections/{galleryId}/clients/{clientId}`: read owner/admin; write owner/admin/public doar daca galeria e publica si payloadul e valid.
6. `customers/{uid}/checkout_sessions/*`: create doar owner, cu schema stricta.
7. `customers/{uid}/subscriptions/*`: read owner/admin.
8. `adminOverrides/*` si `adminSettings/*`: control admin.
9. `contactMessages/*`: create public validat, read/update doar admin.

## Comenzi simple de verificare
1. Preflight complet:
```bash
npm run preflight
```
2. Verifica variabilele `.env` separat:
```bash
npm run check:env
```
3. Verifica smoke test dupa ce ai serverul pornit:
```bash
npm run smoke -- http://127.0.0.1:5181
```

## Deploy rules
Din folderul `mina-v1`, cand esti pregatit:
```bash
firebase deploy --only firestore:rules
```

## Atentie importanta
Inainte de deploy, ruleaza intotdeauna:
1. `npm run preflight`
2. `npm run smoke -- <url_local>`
