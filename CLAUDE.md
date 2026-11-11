# Prospection : contexte pour Claude

PWA de prospection porte-à-porte pour une franchise. JavaScript pur, **sans build**, déployée en **Cloudflare Worker + assets** depuis GitHub (adresse `*.workers.dev`). Docs utilisateur : `README.md` (installation, usage), `DEPLOIEMENT.md` (détails, Google Sheet). Réponds en français.

## Architecture
- `index.html`, `style.css`, `app.js` : l'app (onglets Portes, Carte, Stats, Cartes). Données dans localStorage via `store.js`.
- `sync.js` : sauvegarde en ligne. Fiches `d:date|zone` (jours), `c:uuid` (contacts), `j:date` (durées). Empreinte par fiche, tombstones pour les suppressions, dernière écriture gagnante, `since` avec 5 s de recouvrement.
- `_worker.js` : routes `POST /api/sync` (D1) et `POST /api/sheet` (relais vers Apps Script) ; `GET /api/sync` = diagnostic `{worker, db, password, sheet}`. Le reste passe à `env.ASSETS`. Auth : `Authorization: Bearer <APP_PASSWORD>`.
- `schema.sql` : table D1 `records`. `wrangler.jsonc` : nom du Worker, binding `DB` (D1) et `ASSETS`.
- `apps-script/Code.gs` : à coller dans le Google Sheet (onglet du mois + « Projets »).
- `parse-card.js` : lecture des cartes de visite (OCR Tesseract.js chargé depuis jsdelivr). `xlsx.js` : écriture xlsx maison. `stats.js`, `duree.js`.
- `sw.js` : service worker, réseau d'abord. **Change `VERSION` à chaque modification du code**, et le numéro affiché dans `index.html`.

## Règles du produit
- R1 = rendez-vous pris (avec date), R2 = à repasser (date facultative). Statuts **par client**, pas par zone.
- Export Google : Type toujours « Prospection », une ligne par jour, Contacts = clients notés.

## Pièges rencontrés
- Variables et secrets : bloc **Runtime** du Worker (pas Build). Un secret n'est pris en compte qu'après un déploiement.
- `.assetsignore` obligatoire (sinon `_worker.js` est publié, et le build échoue). `.wrangler` aussi.
- `wrangler.jsonc` : `database_id` propre à chaque fork ; ne pas écraser lors d'une synchro de fork.
- Un changement d'adresse du site efface les données locales des téléphones (stockage par origine).
- OCR : le `@` est lu `æ`, `©`… ; corrigé dans `parse-card.js`.

## Tests
`node --test test/*.mjs` (analyse des cartes, xlsx, stats, worker avec fausse D1, Apps Script sur fausse feuille). Local : `python3 -m http.server 8000`. Non testé contre les vrais services : Cloudflare, Google Sheet, OCR réel, rendu Leaflet.
