# Prospection (app téléphone)

Une seule app installable, deux écrans :

- **Prospection** : gros bouton qui compte les portes poussées, compteurs R1 / R2, zone de prospection, historique par jour, export Excel (`Date / Zone / Portes / R1 / R2`).
- **Cartes** : photo d'une carte de visite, lecture du texte sur le téléphone, champs pré-remplis à vérifier, export Excel (`Société / Prénom / Nom / E-mail / Téléphone / Site web / Adresse / Date`).

Pas de compte, pas de serveur : les données restent dans le navigateur du téléphone. Les photos ne sont jamais enregistrées.

## Mettre en ligne (Cloudflare Pages, gratuit)

L'app doit être en HTTPS (caméra et installation). Même méthode que le site vitrine, mais **dans un dépôt privé séparé** :

1. Crée un dépôt GitHub privé `prospection-app` et envoie ce dossier dedans (`git init`, `git add .`, `git commit`, `git push`).
2. Cloudflare → Workers & Pages → Create → Pages → Connect to Git → choisis le dépôt.
3. Framework preset : *None*. Build command : vide. Build output directory : `/`.
4. Ouvre l'adresse `.pages.dev` obtenue.

Pour tester sur ton PC : `python3 -m http.server 8000` dans le dossier, puis http://localhost:8000.

Après une modification du code, change `VERSION` dans `sw.js` (`v1` → `v2`) pour que les téléphones prennent la nouvelle version.

## Installer sur le téléphone

- **iPhone (Safari)** : Partager → *Sur l'écran d'accueil*.
- **Android (Chrome)** : menu ⋮ → *Installer l'application*.

Ouvre l'app depuis l'icône : sur iPhone, un site non installé peut voir ses données effacées par le système.

## Utilisation

- Choisis la zone, appuie sur le bouton à chaque porte. « − annuler » retire la dernière porte. Les compteurs sont par jour et par zone.
- **Scanner une carte** : cadre bien la carte, bien éclairée. Corrige les champs, puis *Enregistrer*. Un e-mail déjà présent déclenche un avertissement.
- **Exporter en Excel** : le fichier se télécharge (`prospection-AAAA-MM-JJ.xlsx`, `contacts-AAAA-MM-JJ.xlsx`). Exporte régulièrement : c'est ta sauvegarde.

## Statistiques, tournée, sauvegarde en ligne

- **Durée de prospection du jour** : deux menus (heures, minutes) sous le gros bouton, comme pour l'heure d'un rendez-vous. L'export Excel a un onglet « Jours » (Date, Durée en minutes, Portes, Clients notés, R1, R2), et les stats donnent le temps total et les portes par heure.
- **Stats** : portes, clients, R1, R2, taux de rendez-vous, portes par jour (14 derniers jours) et par zone, sur 7 jours, 30 jours ou tout.
- **Tournée** : dans l'onglet Stats, les zones déjà faites, de la plus ancienne à la plus récente, avec « Reprendre » pour retourner dans une zone.
- **Sauvegarde en ligne** (facultative) : voir `DEPLOIEMENT.md`. Elle copie les données dans une base Cloudflare D1 protégée par un mot de passe, et les partage entre appareils.

## Tableau de bord Google

Un bouton envoie le jour choisi dans le Google Sheet de prospection (ligne du jour dans l'onglet du mois, clients en R1 / R2 dans l'onglet « Projets »). Il passe par le script `apps-script/Code.gs` : mise en place dans `DEPLOIEMENT.md`.

## Carte et position

- **📍 Utiliser ma position** (sous la zone) : enregistre la position GPS de la zone et, si le champ est vide, le remplit avec le nom de la rue et de la commune.
- **+ Client prospecté** : la position du téléphone est enregistrée avec le client (si la localisation est autorisée).
- **Onglet Carte** : repères colorés (vert R1, orange R2, bleu autre, cercle rouge pour une zone), filtre « Aujourd'hui / Tout », et un lien « Ouvrir dans Maps » sur chaque point. L'export Excel des clients a une colonne « Lien carte ».
- La carte (Leaflet, depuis cdn.jsdelivr.net) et ses fonds (OpenStreetMap) demandent du réseau. Le nom de rue vient du service Nominatim d'OpenStreetMap : la position y est envoyée, à mentionner dans une éventuelle politique de confidentialité.

## Limites à connaître

- **R1** = rendez-vous pris, **R2** = à repasser plus tard : ce sont des statuts **par client**. Avec « + Client prospecté », on note le client, son statut (aucun, R1 avec date et heure, R2 avec date facultative) et un commentaire. Les compteurs R1 / R2 se calculent tout seuls. L'export a deux onglets : « Prospection » (Date, Zone, Portes, R1, R2) et « Clients » (Date, Zone, Client, Statut, date du RDV, Commentaire).
- La colonne **Portes** est ajoutée à l'export, en plus de Date, Zone, R1 et R2.
- La **première lecture de carte nécessite du réseau** : le lecteur de texte (Tesseract.js, chargé depuis cdn.jsdelivr.net) et ses données de langue se téléchargent une fois (quelques Mo), puis restent en cache et fonctionnent hors ligne.
- La lecture n'est jamais parfaite (cartes très stylisées, texte clair sur fond foncé) : vérifie chaque fiche.
- Les données sont par téléphone : pas de synchronisation entre appareils.

## Données personnelles

Les cartes contiennent des données personnelles de prospects. Pour les mailings, prévois une mention d'information et un lien de désinscription (RGPD, prospection B2B). Ce n'est pas un avis juridique.

## Tests

`node --test test/*.test.mjs` (lecture des cartes, génération du fichier Excel).
