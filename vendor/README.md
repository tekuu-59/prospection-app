# Bibliothèques tierces, copiées ici telles quelles

Servies par l'app elle-même plutôt que par un CDN : un CDN compromis ne peut pas injecter de code
dans l'app (qui garde le mot de passe et les données clients). Le numéro de version est dans le
nom du dossier ; le service worker les garde en cache sans les retélécharger.

| Dossier | Source npm | Licence |
| --- | --- | --- |
| `leaflet-1.9.4/` | `leaflet@1.9.4` (`dist/leaflet.js`, `dist/leaflet.css`) | BSD-2-Clause (`LICENSE`) |
| `tesseract-5.1.1/` | `tesseract.js@5.1.1` (`dist/tesseract.min.js`, `dist/worker.min.js`) | Apache-2.0 (`LICENSE.md`) |
| `tesseract-core-5.1.1/` | `tesseract.js-core@5.1.1` (variantes `-lstm` seulement) | Apache-2.0 (`LICENSE`) |
| `tessdata-4.0.0_best_int/` | `@tesseract.js-data/fra@1.0.0` et `@tesseract.js-data/eng@1.0.0` (`4.0.0_best_int/`) | MIT (paquet npm), données Tesseract Apache-2.0 |

Pour changer de version : `npm pack <paquet>@<version>`, copier les mêmes fichiers dans un nouveau
dossier au nouveau numéro, mettre à jour les chemins dans `app.js` et `sw.js`, supprimer l'ancien dossier.
