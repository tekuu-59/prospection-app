# Prospection : l'app terrain pour la franchise

Une app à installer sur le téléphone pour la prospection en porte-à-porte. Gratuite, sans compte à créer pour les utilisateurs, avec un compte Cloudflare (gratuit) pour la mettre en ligne.

**Ce qu'elle fait**

| Écran | À quoi ça sert |
| --- | --- |
| 🚪 Portes | Un gros bouton qui compte les portes. Zone, durée du jour, clients prospectés avec leur statut **R1** (rendez-vous pris) ou **R2** (à repasser), commentaires, historique. |
| 🗺 Carte | Les zones et les clients sur une carte (vert R1, orange R2). |
| 📊 Stats | Portes, rendez-vous, taux de transformation, portes par heure, zones déjà faites. |
| 💼 Cartes | Photo d'une carte de visite : société, nom, e-mail, téléphone, site et adresse sont lus et pré-remplis. Export pour un mailing. |

Plus : export Excel, sauvegarde en ligne entre appareils, et envoi du jour dans le tableau de bord Google Sheet.

---

## Installer sa propre copie (environ 20 minutes, une seule fois)

Chaque franchisé a **sa propre copie**, avec sa base et son mot de passe : personne ne voit les données des autres.

Il te faut : un compte [GitHub](https://github.com) et un compte [Cloudflare](https://cloudflare.com) (gratuits). Active la double authentification sur les deux.

### 1. Faire un fork sur ton GitHub
1. Sur la page GitHub de ce projet, clique sur **Fork**, puis **Create fork**. Tu obtiens ta propre copie, qui reste liée à l'original pour recevoir les mises à jour.
2. Vérifie à la racine de ta copie, à côté de `index.html` : `wrangler.jsonc`, `.assetsignore`, `_worker.js`.

Tu n'as pas de compte GitHub à l'aise avec les forks ? Télécharge le zip, crée un dépôt vide et envoie-y les fichiers (les fichiers qui commencent par un point sont masqués sur Mac et Linux : ils doivent apparaître dans la liste sur GitHub). Tu perdras seulement le bouton de mise à jour.

### 2. Créer la base de données
1. Cloudflare : **Storage & Databases**, **D1**, **Create database**, nom `prospection`.
2. Ouvre-la, onglet **Console**, colle le contenu du fichier `schema.sql`, **Execute**.
3. Copie son **Database ID** (un long identifiant, pas le nom).

### 3. Renseigner l'identifiant
Dans `wrangler.jsonc` sur GitHub (crayon pour modifier), remplace `REMPLACE-MOI` par ton Database ID. Garde les guillemets. Si tu changes `"name"`, il doit être identique au nom du Worker créé à l'étape suivante.

### 4. Publier le site
1. Cloudflare : **Workers & Pages**, **Create**, **Import a repository** (Git), choisis `prospection-app`.
2. Laisse la commande de build vide, valide. Au bout d'une ou deux minutes, tu obtiens une adresse `https://….workers.dev`.
3. Cette adresse est **définitive** : les données du téléphone sont liées à elle. Choisis le nom une fois pour toutes.

### 5. Choisir le mot de passe
Dans le Worker : **Settings**, **Variables and Secrets** (le bloc **Runtime**, pas celui de Build), **Add**, type **Secret**, nom `APP_PASSWORD`, valeur : une longue phrase de passe (16 caractères ou plus). Clique sur **Deploy**.

### 6. Vérifier
Ouvre `https://TON-ADRESSE/api/sync`. Tu dois voir `"worker":true,"db":true,"password":true`. Sinon, voir « En cas de souci » plus bas.

### 7. Installer sur le téléphone
- **iPhone (Safari)** : Partager, **Sur l'écran d'accueil**.
- **Android (Chrome)** : menu ⋮, **Installer l'application**.

Ouvre l'app depuis l'icône, entre le mot de passe en bas de l'écran une seule fois : « ☁️ Sauvegardé en ligne » s'affiche. Fais pareil sur chaque appareil.

---

## Utiliser l'app au quotidien

1. **Zone** : tape son nom, ou « 📍 Utiliser ma position ».
2. **Chaque porte** : un appui sur le gros bouton. « − annuler » retire la dernière.
3. **Client rencontré** : « + Client prospecté », nom, statut (Aucun, R1 avec date et heure, R2 avec ou sans date), commentaire.
4. **Durée du jour** : deux menus, heures puis minutes.
5. **Carte de visite** : onglet Cartes, **Scanner**, vérifie les champs, **Enregistrer**. La première lecture a besoin de réseau (téléchargement unique du lecteur de texte).
6. **Fin de journée** : **Exporter en Excel**, ou **Envoyer vers le tableau** si le Google Sheet est branché.

Les données sont sur le téléphone **et** sur ton Cloudflare. Exporte quand même en Excel de temps en temps.

## Brancher le Google Sheet (facultatif)

Voir `DEPLOIEMENT.md`, section « Remplir le tableau de bord Google ». **Fais le premier essai sur une copie de ta feuille.** Le script s'adapte à un tableau avec un onglet par mois et un onglet « Projets ».

## Mettre à jour l'app

- **Modifier un fichier** : modifie-le sur GitHub, commit, le site se republie tout seul. Si tu touches au code, change `VERSION` dans `sw.js` (`v17` en `v18`) pour que les téléphones prennent la nouvelle version.
- **Recevoir une nouvelle version de ce projet** : sur ton fork, clique sur **Sync fork**, puis **Update branch**. S'il signale un conflit sur `wrangler.jsonc`, garde **ta** version (elle contient ton Database ID). Cloudflare republie tout seul. Sans fork : remplace les fichiers à la main, **sauf** `wrangler.jsonc`.
- Ferme complètement l'app et rouvre-la, deux fois si besoin : la version s'affiche en bas.

## Repartir de zéro après des tests

- Dans l'app, tout en bas : **Effacer toutes les données…**, taper `EFFACER`. Efface le téléphone et la sauvegarde en ligne.
- Base seulement : D1, Console, `DELETE FROM records;`

## En cas de souci

| Symptôme | Cause probable |
| --- | --- |
| « Mode local : aucun serveur… » | `_worker.js` ou `wrangler.jsonc` manquant à la racine du dépôt. |
| « Serveur trouvé, mais la base ou le mot de passe n'est pas configuré » | Ouvre `/api/sync` : `"db":false` = mauvais Database ID ; `"password":false` = secret absent du bloc **Runtime**, ou pas redéployé. |
| Erreur de build « Uploading a Pages _worker.js » | `.assetsignore` absent du dépôt. |
| Erreur « must have a valid database_id » | `REMPLACE-MOI` toujours dans `wrangler.jsonc`. |
| L'ancienne version reste affichée | Fermer l'app complètement et la rouvrir. |
| La caméra ne s'ouvre pas | Autoriser l'appareil photo dans les réglages du téléphone ; l'adresse doit être en `https://`. |
| Données disparues sur iPhone | L'app n'était pas installée sur l'écran d'accueil, ou l'adresse a changé. |

Détails et captures de la procédure : `DEPLOIEMENT.md`.

## Données personnelles

Les cartes contiennent des données de prospects. Pour les mailings, prévois une mention d'information et un lien de désinscription (RGPD, prospection B2B). Ce n'est pas un avis juridique. La position GPS d'une zone est envoyée à OpenStreetMap (Nominatim) pour retrouver le nom de la rue ; les photos de cartes ne sont jamais enregistrées.

## Pour les développeurs

App en JavaScript pur, sans build. `_worker.js` (route `/api/sync` et `/api/sheet`) et `wrangler.jsonc` pour Cloudflare. Test local : `python3 -m http.server 8000`. Tests : `node --test test/*.mjs`.
