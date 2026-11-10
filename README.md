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

## Brancher le Google Sheet (facultatif, 10 minutes)

Le bouton **📤 Envoyer vers le tableau** (écran Portes, tout en bas) écrit la journée dans ton tableau de bord : une ligne « synthèse du jour » dans l'onglet du mois, et les clients en R1 ou R2 dans l'onglet « Projets ». Prérequis : la sauvegarde en ligne fonctionne (étapes 1 à 7). **Fais le premier essai sur une copie du tableau.**

1. **Coller le script.** Ouvre ton Google Sheet, **Extensions**, **Apps Script**. Supprime le code d'exemple, colle le contenu de `apps-script/Code.gs` (dans ce dépôt), puis **Enregistrer**.
2. **Choisir un jeton.** Dans Apps Script : roue dentée **Paramètres du projet**, **Propriétés du script**, **Ajouter** : nom `TOKEN`, valeur : une longue phrase différente du mot de passe de l'app. Enregistre.
3. **Publier le script.** **Déployer**, **Nouveau déploiement**, type **Application Web**. « Exécuter en tant que » : **Moi**. « Qui a accès » : **Tout le monde**. Valide et autorise l'accès (si Google affiche « application non validée » : **Paramètres avancés**, puis **Accéder à…**). Copie l'adresse qui finit par `/exec`.
4. **Donner l'adresse à Cloudflare.** Dans ton Worker : **Settings**, **Variables and Secrets** (bloc **Runtime**), ajoute deux **Secrets** :
   - `SHEET_SCRIPT_URL` : l'adresse `/exec` ;
   - `SHEET_TOKEN` : la même phrase que `TOKEN`.

   Puis **Deploy**. Vérifie `https://TON-ADRESSE/api/sync` : tu dois voir `"sheet":true`.
5. **Envoyer.** Dans l'app, choisis le jour (aujourd'hui par défaut) et touche **Envoyer vers le tableau**. Un message indique l'onglet et la ligne remplis. Renvoyer le même jour met à jour sans doublon.

**Ton tableau doit avoir** un onglet par mois (son nom contient « novembre », « décembre »…) avec des colonnes titrées Date, Type, Lieu, Durée, Contacts, R1, R2, Rendez-vous pris, et un onglet « Projets ». Les colonnes peuvent être déplacées, pas renommées.

**Si tu modifies le script plus tard** : **Déployer**, **Gérer les déploiements**, crayon, **Nouvelle version**. Sinon l'adresse garde l'ancien code.

Détails (ce qui est écrit où, cas particuliers, Workspace d'entreprise) : `DEPLOIEMENT.md`.

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
| « Envoi vers Google non configuré » | `"sheet":false` sur `/api/sync` : les secrets `SHEET_SCRIPT_URL` et `SHEET_TOKEN` manquent dans le bloc **Runtime**, ou pas redéployé. |
| « ⚠️ … unauthorized » ou « Le script Google ne répond pas correctement » | `SHEET_TOKEN` différent de `TOKEN`, ou le déploiement Apps Script n'est pas en accès « Tout le monde » / pas en nouvelle version. |
| Données disparues sur iPhone | L'app n'était pas installée sur l'écran d'accueil, ou l'adresse a changé. |

Détails et captures de la procédure : `DEPLOIEMENT.md`.

## Données personnelles

Les cartes contiennent des données de prospects. Pour les mailings, prévois une mention d'information et un lien de désinscription (RGPD, prospection B2B). Ce n'est pas un avis juridique. La position GPS d'une zone est envoyée à OpenStreetMap (Nominatim) pour retrouver le nom de la rue ; les photos de cartes ne sont jamais enregistrées.

## Pour les développeurs

App en JavaScript pur, sans build. `_worker.js` (route `/api/sync` et `/api/sheet`) et `wrangler.jsonc` pour Cloudflare. Test local : `python3 -m http.server 8000`. Tests : `node --test test/*.mjs`.
