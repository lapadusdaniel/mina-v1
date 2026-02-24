# START HERE (Mina v1)

Acest folder este noua versiune: `/Users/daniellapadus/Desktop/mina-v1`.

Proiectul original ramane neatins in: `/Users/daniellapadus/Desktop/fotolio`.

## Regula #1
Lucrezi doar aici:

```bash
cd /Users/daniellapadus/Desktop/mina-v1
```

## Ce facem acum
0. Daca vrei infrastructura complet separata de `fotolio`, urmeaza `docs/isolated-infra-setup.md`.
1. Stabilim MVP-ul exact (vezi `docs/mvp-scope.md`).
2. Stabilim arhitectura (vezi `docs/architecture.md`).
3. Stabilim modelul de date (vezi `docs/data-model.md`).
4. Stabilim regulile de securitate (vezi `docs/security.md`).
5. Rulam checklist-ul de QA simplu (vezi `docs/qa-checklist.md`).
6. Inainte de live, urmam checklist-ul final (vezi `docs/release-checklist.md`).
7. Pentru deploy Cloudflare Worker + test, urmeaza `docs/worker-deploy.md`.

## Verificare rapida
```bash
git branch --show-current
```
Trebuie sa vezi: `codex/mina-v1`

## Comenzi rapide (daily)
```bash
npm run check:env
npm run build
npm run preflight
```

Pentru smoke test (in al doilea terminal, dupa `npm run dev`):
```bash
npm run smoke -- http://127.0.0.1:5181
```
