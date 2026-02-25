# FEATURE CHECKLIST (Mina v1)

Folosește acest checklist pentru orice funcție nouă.  
Scop: să nu stricăm securitatea, performanța sau stabilitatea.

## 1) Definește feature-ul (30 sec)
- [ ] Ce face feature-ul (1 propoziție).
- [ ] Cine are voie să îl folosească (owner/admin/client/public).
- [ ] Care e limita (ex: max upload, max cereri/minut, max elemente).
- [ ] Ce se întâmplă dacă cineva încearcă să ocolească UI-ul.

## 2) Securitate backend (obligatoriu)
- [ ] Regula este aplicată în Worker/API, nu doar în frontend.
- [ ] Firestore Rules permit doar ce trebuie, restul deny.
- [ ] Datele sensibile nu ajung în frontend (secrets/tokens).
- [ ] Pentru operații sensibile: ownership check explicit.

Fișiere principale:
- `worker/r2-worker.js`
- `firestore.rules`

## 3) Frontend (UX, nu security)
- [ ] Validare în UI pentru experiență (mesaj clar de eroare).
- [ ] State de loading + fallback dacă backend întârzie.
- [ ] Nu blocăm interfața cu request-uri inutile.

Fișiere principale:
- `src/components/*`
- `src/modules/*`

## 4) Performanță
- [ ] Evit N+1 requests.
- [ ] Folosesc agregate/câmpuri calculate unde are sens.
- [ ] Lazy-load pentru imagini/liste mari.
- [ ] Nu fac fetch de original dacă e suficient thumb/medium.

## 5) Date și migrare
- [ ] Feature-ul nou nu rupe datele existente.
- [ ] Dacă există legacy, am plan clar: fallback temporar + cleanup.
- [ ] Evit documente foarte mari (1MB risk în Firestore).

## 6) Testare minimă (obligatoriu înainte de push)
- [ ] 1 test pentru caz fericit.
- [ ] 1 test pentru caz blocat/abuz (403/429/validation fail).
- [ ] Rulez local:

```bash
npm run test
npm run build
npm run qa:worker
```

## 7) Deploy safe
- [ ] Deploy Worker întâi (dacă există schimbări backend).
- [ ] Deploy Hosting după.
- [ ] Test rapid în incognito + mobil.
- [ ] Verific logs/console pentru erori.

## 8) Definition of Done (DoD)
- [ ] Funcționează end-to-end.
- [ ] Nu expune date între utilizatori.
- [ ] Nu introduce regresii în flow-urile existente.
- [ ] E notat în `docs/WORKLOG.md` (1-3 bullets).

---

## Comandă standard pre-release

```bash
npm run preflight:live
npm run qa:worker
```

Dacă ambele trec, feature-ul este pregătit pentru deploy.
