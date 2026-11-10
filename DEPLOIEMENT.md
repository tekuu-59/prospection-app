# Mettre l'app Prospection en ligne (Cloudflare Pages)

Dernière mise à jour : 10 novembre 2026. Coût : 0 € à l'usage prévu (limites gratuites de Cloudflare à vérifier sur leur site). L'app est un site statique, plus une petite route `/api/sync` (fichier `_worker.js`) pour la sauvegarde en ligne.

Deux méthodes. La **A** est la plus rapide et ne demande pas de compte GitHub ; la **B** permet de republier d'un simple `git push`.

> **À décider avant de commencer : l'adresse définitive.** Les données (portes, clients) sont stockées dans le navigateur, *par adresse de site*. Si l'adresse change plus tard (nouveau nom de projet, domaine perso), le téléphone repart avec des données vides. Choisis donc le nom du projet une fois pour toutes, et exporte en Excel avant tout changement.

## Méthode A : envoi direct du dossier (5 minutes)

1. Dézippe `prospection-app.zip`. Tu obtiens un dossier `prospection-app` avec `index.html` à l'intérieur.
2. Crée un compte sur cloudflare.com et active la double authentification.
3. Dans le tableau de bord, ouvre « Workers & Pages », puis « Create », puis l'onglet « Pages ».
4. Choisis « Upload your static files » (envoi direct), donne un nom au projet (par exemple `prospection-lucas`), puis valide.
5. Glisse le **dossier** `prospection-app` dans la zone d'envoi (ou envoie le zip, selon ce que l'écran accepte). `index.html` doit être à la racine de ce qui est envoyé, pas dans un sous-dossier.
6. Clique sur « Deploy ». Après quelques secondes, l'adresse `https://nom-du-projet.pages.dev` s'affiche.

**Mettre à jour plus tard :** ouvre le projet, onglet « Deployments », « Create new deployment », et renvoie le dossier.

## Méthode B : avec GitHub (publication automatique)

1. Crée un dépôt GitHub **privé** (par exemple `prospection-app`), sans README ni licence.
2. Dans le dossier de l'app :

```bash
git init
git add .
git commit -m "Première version"
git branch -M main
git remote add origin https://github.com/TON-COMPTE/prospection-app.git
git push -u origin main
```

3. Sur Cloudflare : « Workers & Pages », « Create », « Pages », « Connect to Git », autorise GitHub et choisis le dépôt.
4. Réglages de publication :

| Réglage | Valeur |
| --- | --- |
| Framework preset | None |
| Build command | (vide) |
| Build output directory | `/` |

5. Lance la publication. L'adresse `.pages.dev` apparaît au bout d'une minute ou deux.

**Mettre à jour plus tard :** `git add .`, `git commit -m "..."`, `git push` : Cloudflare republie tout seul.

Les intitulés de Cloudflare changent de temps en temps : suis les libellés que tu vois plutôt que les noms exacts ci-dessus.

## Activer la sauvegarde en ligne (base D1 + mot de passe)

Sans cette étape, l'app marche très bien mais ses données restent dans le téléphone (« Mode local » s'affiche en bas). Avec elle, chaque modification est copiée sur ton compte Cloudflare, et un nouveau téléphone retrouve tout en saisissant le mot de passe. L'app continue de marcher hors ligne et envoie les modifications au retour du réseau.

1. **Créer la base.** Dans Cloudflare : « Storage & Databases » (ou « Workers & Pages »), « D1 SQL Database », « Create », nom `prospection`. Ouvre l'onglet « Console », colle le contenu du fichier `schema.sql` et exécute-le.
2. **Lier la base au projet.** Ouvre ton projet Pages, « Settings », « Bindings » (ou « Functions »), « Add », « D1 database ». Nom de la variable : `DB` (exactement). Choisis la base `prospection`.
3. **Choisir le mot de passe.** Dans « Settings », « Variables and secrets », ajoute un secret nommé `APP_PASSWORD`, avec une longue phrase de passe (16 caractères ou plus, unique). C'est le mot de passe que l'app te demandera.
4. **Republier.** Un réglage ne s'applique qu'à la publication suivante : fais un nouveau déploiement (méthode A : renvoie le dossier ; méthode B : `git push` ou « Retry deployment »).
5. **Activer sur le téléphone.** Ouvre l'app : en bas, « Saisis le mot de passe pour activer la sauvegarde en ligne ». Entre le mot de passe : le message devient « ☁️ Sauvegardé en ligne ». Fais de même sur chaque appareil.

Si l'envoi direct du dossier (méthode A) n'applique pas le fichier `_worker.js` ou les réglages, passe par la méthode B (GitHub) : c'est celle que Cloudflare gère le mieux. Je n'ai pas pu tester ces écrans d'ici.

Comment ça se comporte :

- Si deux appareils modifient la même chose, la modification la plus récente gagne.
- Supprimer un jour sur un appareil le supprime aussi sur les autres.
- Un mot de passe oublié se change dans les secrets Cloudflare ; l'app redemande alors le nouveau.
- Le mot de passe est enregistré dans le téléphone et envoyé en HTTPS à chaque synchronisation. Il n'y a pas de limite d'essais : prends une longue phrase de passe.

## Remplir le tableau de bord Google (facultatif)

Le bouton « 📤 Envoyer vers le tableau » (écran Prospection, tout en bas) écrit un jour de prospection dans ton Google Sheet. Il faut d'abord que la sauvegarde en ligne marche (même mot de passe). **Fais le premier essai sur une copie du tableau**, pas sur l'original.

1. **Coller le script.** Ouvre le tableau, menu « Extensions », « Apps Script ». Supprime le code d'exemple, colle le contenu du fichier `apps-script/Code.gs` et enregistre.
2. **Choisir un jeton.** Dans l'éditeur, roue dentée « Paramètres du projet », « Propriétés du script », ajoute une propriété `TOKEN` avec une longue phrase (différente du mot de passe de l'app).
3. **Publier le script.** « Déployer », « Nouveau déploiement », type « Application Web », « Exécuter en tant que » : moi, « Qui a accès » : tout le monde. Valide, autorise l'accès à ton compte (si Google affiche « application non validée », clique sur « Paramètres avancés » puis « Accéder à… »). Copie l'adresse qui finit par `/exec`.
4. **Donner l'adresse à Cloudflare.** Dans ton projet Pages, « Settings », « Variables and secrets », ajoute deux secrets : `SHEET_SCRIPT_URL` (l'adresse `/exec`) et `SHEET_TOKEN` (la même phrase que `TOKEN`). Republie le projet.
5. **Envoyer.** Dans l'app, choisis le jour (aujourd'hui par défaut) et touche « Envoyer vers le tableau ». Un message indique l'onglet et la ligne remplis.

Ce que le script écrit :

| Où | Quoi |
| --- | --- |
| Onglet du mois (son nom contient « novembre », « décembre »… ; les onglets « Modèle » sont ignorés) | Une ligne par jour, dans le bloc de la bonne semaine (semaine du lundi au dimanche, la semaine 1 contient le 1er du mois), sur la première ligne libre. Type = Prospection. Lieu = Z1 à Z16 si la journée n'a qu'une zone et qu'elle porte ce nom, sinon vide. Durée en minutes. Contacts = nombre de clients notés. R1, R2. Rendez-vous pris = R1. |
| Onglet « Projets » | Une ligne par client en R1 ou R2 : Date, Nom du projet (le client), R (R1 ou R2), Besoin (le commentaire), Date de rendez-vous (si renseignée). Les autres colonnes ne sont pas touchées. |

- Renvoyer le même jour met à jour les mêmes lignes, sans doublon.
- Les lignes de synthèse hebdomadaire et les colonnes de performance ne sont jamais modifiées.
- Les colonnes sont retrouvées par leurs titres (Date, Type, Lieu, Durée, Contacts, R1, R2, Rendez-vous pris) : tu peux les déplacer. Si tu en renommes une, le message d'erreur de l'app le dit.
- Après toute modification du script : « Déployer », « Gérer les déploiements », crayon, « Nouvelle version », sinon l'adresse garde l'ancien code.
- Si le tableau appartient à une organisation Google Workspace, l'administrateur peut interdire l'accès « tout le monde » : dans ce cas, fais l'essai depuis une copie dans un compte personnel.

## Installer sur le téléphone

Ouvre l'adresse en HTTPS (Cloudflare la fournit d'office), puis :

- **iPhone (Safari)** : Partager, puis « Sur l'écran d'accueil ».
- **Android (Chrome)** : menu ⋮, puis « Installer l'application ».

Ouvre ensuite l'app **depuis l'icône** : sur iPhone, un site non installé peut voir ses données effacées par le système. Au premier lancement, accepte la localisation (utile pour la carte) et l'appareil photo (pour les cartes de visite).

## Vérifier que c'est la bonne version

Un petit « v16 » (ou plus) s'affiche tout en bas de l'écran Prospection. Après une mise à jour, ferme complètement l'app et rouvre-la une ou deux fois, avec du réseau, pour qu'elle prenne la nouvelle version.

Avant de s'en servir pour de vrai, fais ce test de 5 minutes sur le téléphone :

- [ ] Le bouton compte, « − annuler » retire une porte.
- [ ] « + Client prospecté » enregistre un client avec R1 (date) et un commentaire.
- [ ] « 📍 Utiliser ma position » remplit la zone, et l'onglet Carte montre le point.
- [ ] Scanner 2 ou 3 vraies cartes de visite : vérifier chaque champ.
- [ ] Exporter en Excel et ouvrir les fichiers.
- [ ] Onglet Stats : les totaux et le suivi de tournée correspondent à ce que tu as saisi.
- [ ] Envoi vers le tableau Google (sur une copie) : la ligne du jour apparaît dans le bon onglet et les clients en R1 / R2 dans « Projets ».
- [ ] Onglet QR : saisir l'adresse du site, scanner le QR code avec un autre téléphone.
- [ ] Si la sauvegarde en ligne est activée : saisir une porte, attendre « Sauvegardé en ligne », ouvrir l'app sur un 2e appareil et vérifier qu'elle y apparaît.
- [ ] Mettre le téléphone en mode avion : l'app s'ouvre et la saisie marche.

## Protéger l'accès (facultatif)

L'adresse `.pages.dev` est publique, mais non listée, et l'app contient une balise qui demande aux moteurs de recherche de ne pas l'indexer. Les données restent dans le téléphone : quelqu'un qui connaîtrait l'adresse verrait seulement une app vide. Si tu veux quand même limiter l'accès, Cloudflare Access permet d'exiger une connexion par e-mail devant le site ; regarde les conditions et la gratuité sur le site de Cloudflare avant de l'activer.

## Données et RGPD

- Sans la sauvegarde en ligne, les données restent dans le téléphone. Avec elle, elles sont aussi stockées dans ta base Cloudflare (D1) : Cloudflare devient un sous-traitant à mentionner dans ta politique de confidentialité. **Exporte quand même en Excel de temps en temps.**
- La carte et la lecture des cartes de visite chargent des fichiers depuis cdn.jsdelivr.net ; le fond de carte vient d'OpenStreetMap et le nom de rue de Nominatim (la position y est envoyée).
- Les cartes de visite contiennent des données de prospects : prévois une mention d'information et un lien de désinscription dans les mailings (ce n'est pas un avis juridique).

## Dépannage

- **Page blanche ou « 404 »** : `index.html` n'est pas à la racine de ce qui a été envoyé. Renvoie le contenu du dossier, pas le dossier parent.
- **L'ancienne version reste affichée** : ferme complètement l'app et rouvre-la, deux fois si besoin.
- **La caméra ne s'ouvre pas** : l'adresse doit commencer par `https://` ; vérifie aussi l'autorisation de l'appareil photo dans les réglages du téléphone.
- **La première lecture de carte échoue** : elle télécharge le lecteur de texte, il faut du réseau.
- **Données disparues sur iPhone** : l'app n'était pas installée sur l'écran d'accueil, ou l'adresse a changé.
- **« Mode local : aucun serveur de sauvegarde détecté »** alors que le site est en ligne : ouvre `https://TON-SITE/api/sync` dans le navigateur. Si tu vois `{"worker":true,"db":true,"password":true,...}`, tout est bon. Page d'app ou 404 → `_worker.js` n'est pas à la racine du déploiement. `"db":false` ou `"password":false` → le binding D1 nommé `DB` ou le secret `APP_PASSWORD` manque ; ajoute-le puis **redéploie** (les réglages ne s'appliquent qu'au déploiement suivant).

## Remettre l'app à zéro après tes tests

- **Dans l'app** : tout en bas, « Effacer toutes les données… », taper `EFFACER`. Efface le téléphone **et** la sauvegarde en ligne (les autres appareils se vident à leur prochaine synchro).
- **Seulement la base en ligne** : Cloudflare → Storage & Databases → D1 → ta base → Console → `DELETE FROM records;`
- **Seulement ce navigateur** : réglages du navigateur → données du site → supprimer.
Pense aussi à vider les lignes de test dans le Google Sheet.
