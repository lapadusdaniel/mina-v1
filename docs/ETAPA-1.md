# ETAPA 1 - Skeleton tehnic (Mina v1)

Scop: pastram aplicatia actuala functionala, dar adaugam o fundatie curata pentru versiunea noua.

## Ce s-a adaugat
1. `src/core/config/env.js` - citire si validare variabile de mediu.
2. `src/core/bootstrap/appBootstrap.js` - bootstrap unic la pornirea app-ului.
3. `src/core/bootstrap/createAppServices.js` - registru central pentru servicii.
4. `src/modules/auth/*` - contract module auth.
5. `src/modules/galleries/*` - contract module galerii.
6. `src/modules/media/*` - contract module media.
7. `src/modules/billing/*` - contract module billing.
8. `src/shared/logger.js` - logger unificat.

## Verificare (copy-paste)
```bash
cd /Users/daniellapadus/Desktop/mina-v1
git branch --show-current
npm run dev
```

Ce trebuie sa vezi:
1. Branch: `codex/mina-v1`
2. Aplicatia porneste fara sa fie nevoie sa refaci flow-urile existente.

## De ce am facut asta
1. Ne permite sa refactorizam pe module, fara big bang rewrite.
2. Putem muta logicile vechi gradual, cu risc mic.
3. Cand adaugam functii noi, le punem direct in structura curata.
