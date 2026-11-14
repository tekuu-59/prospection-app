# Prospection : l'app terrain des franchisés

Une app pour téléphone qui sert à la prospection en porte-à-porte. Chaque franchisé installe **sa propre copie** : sa base de données, son mot de passe, ses données. Personne ne voit celles des autres.

Coût : 0 € (comptes gratuits GitHub et Cloudflare). Mise en place : environ 20 minutes, une seule fois, sans rien installer sur l'ordinateur.

## Ce que fait l'app

| Écran | À quoi il sert |
| --- | --- |
| 🚪 **Portes** | Un gros bouton compte chaque porte poussée (« − annuler » retire la dernière). Vous y notez la zone (tapée ou trouvée par GPS), la durée de la journée, et les clients rencontrés avec un commentaire et un statut : **R1** = rendez-vous pris (date et heure obligatoires, bouton 📅 pour l'ajouter à Google Agenda), **R2** = à repasser (date facultative). En bas : l'historique des jours, l'export Excel et l'envoi vers le tableau de bord Google. |
| 🗺 **Carte** | Les zones et les clients sur une carte (vert = R1, orange = R2, bleu = sans statut), pour aujourd'hui ou pour tout l'historique. |
| 📊 **Stats** | Sur 7 jours, 30 jours ou tout : portes, clients, R1, R2, temps passé, portes par heure, taux de rendez-vous, portes par jour, résultats par zone, et les zones déjà faites (pour la tournée). |
| 💼 **Cartes** | Photo d'une carte de visite : la société, le nom, l'e-mail, le téléphone, le site et l'adresse sont lus et pré-remplis. Vous vérifiez, vous enregistrez. Export Excel des contacts pour un mailing. |

Toujours en bas de l'écran : l'état de la sauvegarde en ligne et le numéro de version.

---

## Mettre en place sa copie

Il vous faut un compte [GitHub](https://github.com) et un compte [Cloudflare](https://dash.cloudflare.com/sign-up) (gratuits). Activez la double authentification sur les deux.

### 1. Copier le projet sur votre GitHub (fork)

1. Sur la page GitHub de ce projet, cliquez sur **Fork**, puis **Create fork**.
2. Votre copie est publique, comme l'original. Ce n'est pas un problème : aucune donnée ni aucun mot de passe n'y est stocké (ils sont chez Cloudflare). **N'écrivez jamais votre mot de passe dans un fichier du dépôt.**

### 2. Créer la base de données

1. Cloudflare : **Storage & Databases**, **D1 SQL Database**, **Create database**, nom `prospection`. Dans les options d'emplacement (**Location** / **Jurisdiction**), choisissez **EU** : les données de vos prospects restent alors dans l'Union européenne (plus simple pour le RGPD). Ce choix n'est possible qu'à la création. Si l'option n'apparaît pas : `npx wrangler d1 create prospection --jurisdiction eu` dans un terminal.
2. Ouvrez-la, onglet **Console** : collez le contenu du fichier [`schema.sql`](schema.sql), puis **Execute**.
3. Copiez son **Database ID** (un long identifiant du type `3940d0da-…`, pas le nom).

### 3. Régler `wrangler.jsonc`

Dans votre fork sur GitHub, ouvrez `wrangler.jsonc`, cliquez sur le crayon, et changez deux valeurs (gardez les guillemets) :

- `"name"` : le nom de votre app, en minuscules et tirets, par exemple `prospection-rouen`. Il donnera l'adresse `https://prospection-rouen.VOTRE-COMPTE.workers.dev`. **Cette adresse est définitive** : les données du téléphone y sont liées, un changement d'adresse les fait disparaître du téléphone.
- `"database_id"` : remplacez l'identifiant présent (celui du franchisé d'origine) par **le vôtre**.

Puis **Commit changes**.

### 4. Publier sur Cloudflare

1. Cloudflare : **Workers & Pages**, **Create**, **Import a repository**. Autorisez GitHub et choisissez votre fork.
2. **Project name** : exactement le même nom que `"name"` à l'étape 3.
3. Laissez **Build command** vide et **Deploy command** à `npx wrangler deploy`. Validez.
4. Au bout d'une ou deux minutes, l'adresse `https://….workers.dev` s'affiche.

### 5. Choisir le mot de passe

Dans le Worker : **Settings**, **Variables and Secrets** (le bloc **Runtime**, pas celui de Build), **Add**, type **Secret**, nom `APP_PASSWORD`, valeur : une longue phrase de passe (16 caractères ou plus). Puis **Deploy** : un secret n'est pris en compte qu'après un déploiement.

Le Worker limite déjà les essais à 60 par minute et par adresse (bloc `ratelimits` de `wrangler.jsonc`), ce qui rend inutile une attaque par essais successifs sur une longue phrase de passe.

**Recommandé : fermer l'app aux inconnus avec Cloudflare Access** (gratuit jusqu'à 50 utilisateurs). Seules les adresses e-mail que vous autorisez peuvent alors ouvrir l'app, après un code reçu par e-mail. Le mot de passe reste une deuxième barrière.

1. **Zero Trust**, **Access controls**, **Applications**, **Add an application**, **Self-hosted**, destination **Workers**.
2. **Destinations** : **Scope** = le nom de votre Worker (celui de `wrangler.jsonc`), **Type** = « A Worker's production and preview URLs ». Laissez « RDP, SSH, VNC » sur Off.
3. **Access policies**, **Create new policy** : nom (ex. `Equipe`), **Action** = **Allow**, **Session duration** = **1 month** (pour ne pas devoir vous reconnecter sur le terrain), règle **Include**, **Emails** = les adresses des personnes qui prospectent. Enregistrez, revenez sur l'application et ajoutez cette règle (**Add existing policy**).
4. **Authentication** : laissez « Accept all available identity providers » activé ; le code par e-mail (One-time PIN) est inclus.
5. **Details** : **Name** = `Prospection`, **Session Duration** = **1 month**.
6. Vérifiez que le bloc **Preview** montre bien le Worker sous **Destinations** (sinon « No destinations assigned » : rien n'est protégé), puis **Create**.
7. Testez dans une fenêtre de navigation privée : Cloudflare demande l'e-mail puis un code, puis l'app s'affiche. Sur le téléphone, ouvrez l'app avec du réseau et connectez-vous une fois. Hors ligne, l'app marche toujours ; la synchro reprend après reconnexion. Au bout d'un mois, la synchro échoue : rechargez l'app pour vous reconnecter (les données du téléphone ne sont pas touchées).

Les intitulés des écrans Cloudflare changent de temps en temps : suivez ceux que vous voyez.

### 6. Vérifier

Ouvrez `https://VOTRE-ADRESSE/api/sync` dans un navigateur. Vous devez voir `"worker":true,"db":true,"password":true`. Sinon, voir « En cas de souci ».

### 7. Installer l'app sur le téléphone

L'app est une PWA : elle s'installe depuis le navigateur, sans passer par l'App Store ni le Play Store.

1. Ouvrez votre adresse `https://….workers.dev` sur le téléphone.
2. **iPhone** (avec **Safari** obligatoirement) : bouton Partager, **Sur l'écran d'accueil**.
   **Android** (Chrome) : menu ⋮, **Installer l'application** (ou **Ajouter à l'écran d'accueil**).
3. Ouvrez l'app **depuis l'icône** (sur iPhone, un site non installé peut voir ses données effacées par le système).
4. En bas de l'écran Portes, entrez le mot de passe une seule fois : « ☁️ Sauvegardé en ligne » s'affiche.
5. Acceptez la localisation (carte, nom de rue) et l'appareil photo (cartes de visite).

Faites de même sur chaque appareil : ils partagent les mêmes données. L'app marche aussi sans réseau et envoie les modifications au retour du réseau.

### 8. Test de 5 minutes avant le terrain

- [ ] Le bouton compte, « − annuler » retire une porte.
- [ ] Un client en R1 avec date s'enregistre, et 📅 ouvre Google Agenda.
- [ ] « 📍 Utiliser ma position » remplit la zone, l'onglet Carte montre le point.
- [ ] Scanner 2 ou 3 vraies cartes de visite et vérifier chaque champ.
- [ ] Exporter en Excel et ouvrir le fichier.
- [ ] Saisir une porte, attendre « Sauvegardé en ligne », vérifier qu'elle apparaît sur un 2e appareil.
- [ ] En mode avion, l'app s'ouvre et la saisie marche.

Après les tests, remettez à zéro : tout en bas de l'app, **Effacer toutes les données…**, tapez `EFFACER` (efface le téléphone et la sauvegarde en ligne).

---

## Brancher le tableau de bord Google Sheet (facultatif, 10 minutes)

Le bouton **📤 Envoyer vers le tableau** (écran Portes, en bas) écrit une journée dans votre Google Sheet. Prérequis : la sauvegarde en ligne marche. **Faites le premier essai sur une copie du tableau.**

1. **Coller le script.** Dans le Google Sheet : **Extensions**, **Apps Script**. Supprimez le code d'exemple, collez le contenu de [`apps-script/Code.gs`](apps-script/Code.gs), **Enregistrer**.
2. **Choisir un jeton.** Roue dentée **Paramètres du projet**, **Propriétés du script**, **Ajouter** : nom `TOKEN`, valeur : une longue phrase différente du mot de passe de l'app.
3. **Publier le script.** **Déployer**, **Nouveau déploiement**, type **Application Web**, « Exécuter en tant que » : **Moi**, « Qui a accès » : **Tout le monde**. Autorisez l'accès (si Google affiche « application non validée » : **Paramètres avancés**, puis **Accéder à…**). Copiez l'adresse qui finit par `/exec`.
4. **Donner l'adresse à Cloudflare.** Dans le Worker, **Settings**, **Variables and Secrets** (bloc **Runtime**), deux **Secrets** : `SHEET_SCRIPT_URL` (l'adresse `/exec`) et `SHEET_TOKEN` (la même phrase que `TOKEN`). Puis **Deploy**. `/api/sync` doit maintenant afficher `"sheet":true`.
5. **Envoyer.** Dans l'app, choisissez le jour et touchez **Envoyer vers le tableau**. Renvoyer le même jour met à jour sans doublon.

Ce que le script écrit :

| Où | Quoi |
| --- | --- |
| Onglet du mois (son nom contient « novembre », « décembre »… ; les onglets « Modèle » sont ignorés) | Une ligne par jour, dans le bloc de la bonne semaine. Type = Prospection, Lieu = la zone si elle s'appelle Z1 à Z16, Durée en minutes, Contacts = nombre de portes poussées, R1, R2, Rendez-vous pris = R1. |
| Onglet « Projets » | Une ligne par client en R1 ou R2 : Date, Nom du projet, R, Besoin (le commentaire), Date de rendez-vous. |

**RGPD** : le tableau reçoit des noms de prospects. Utilisez un compte **Google Workspace** (professionnel) : il comprend un contrat de traitement des données avec Google, contrairement à un compte Gmail gratuit. Un texte saisi qui commence par `=`, `+`, `-` ou `@` est écrit comme du texte, jamais comme une formule.

Le tableau doit suivre le modèle du réseau : colonnes titrées Date, Type, Lieu, Durée, Contacts, R1, R2, Rendez-vous pris (déplaçables, pas renommables), et un onglet « Projets ». Les lignes de synthèse et de performance ne sont jamais modifiées. Si le tableau appartient à un Google Workspace qui interdit l'accès « Tout le monde », essayez depuis une copie sur un compte personnel.

**Après une modification du script** : **Déployer**, **Gérer les déploiements**, crayon, **Nouvelle version**, sinon l'adresse garde l'ancien code.

---

## Recevoir les mises à jour

1. Sur votre fork GitHub : **Sync fork**, puis **Update branch**. Cloudflare republie tout seul.
2. En cas de conflit sur `wrangler.jsonc` : gardez **votre** nom et **votre** Database ID, mais reprenez les nouveaux blocs (par exemple `ratelimits`).
3. Sur le téléphone : fermez complètement l'app et rouvrez-la, deux fois si besoin. La version et sa date s'affichent tout en bas (par exemple `v0.9 (12/11/2026 21h04)`).

Si vous modifiez vous-même le code : changez `VERSION` dans `sw.js` (`v0.9` → `v0.10`) et le numéro affiché en bas de `index.html`, sinon les téléphones gardent l'ancienne version.

## En cas de souci

| Symptôme | Cause probable |
| --- | --- |
| Erreur de build sur `database_id` ou « database not found » | `"database_id"` dans `wrangler.jsonc` n'est pas celui de **votre** base. |
| Erreur de build sur le nom du Worker | `"name"` dans `wrangler.jsonc` différent du nom du projet Cloudflare. |
| « Mode local : aucun serveur… » | Ouvrez `/api/sync` : si la page de l'app s'affiche, le déploiement n'a pas pris `wrangler.jsonc` (vérifiez qu'il est à la racine du fork). |
| « Serveur trouvé, mais la base ou le mot de passe n'est pas configuré » | Sur `/api/sync` : `"db":false` = mauvais Database ID ; `"password":false` = secret absent du bloc **Runtime**, ou pas redéployé. |
| « Envoi vers Google non configuré » | `"sheet":false` : `SHEET_SCRIPT_URL` ou `SHEET_TOKEN` manquant (bloc **Runtime**), ou pas redéployé. |
| « unauthorized » ou « Le script Google ne répond pas correctement » | `SHEET_TOKEN` différent de `TOKEN`, ou script pas en accès « Tout le monde », ou pas publié en nouvelle version. |
| Pas de proposition d'installation sur iPhone | Il faut Safari, pas Chrome ni l'aperçu d'une autre app. |
| L'ancienne version reste affichée | Fermer complètement l'app et la rouvrir, avec du réseau. |
| La caméra ne s'ouvre pas | Autoriser l'appareil photo dans les réglages du téléphone. |
| La première lecture de carte échoue | Elle télécharge le lecteur de texte (environ 8 Mo, depuis votre propre adresse) une fois : il faut du réseau. |
| « Trop de tentatives » ou synchro « en attente » qui dure | Plus de 60 requêtes en une minute depuis la même adresse : attendez une minute. |
| L'app affiche une page de connexion Cloudflare | Cloudflare Access est activé : entrez votre e-mail autorisé et le code reçu. |
| Données disparues du téléphone | L'app n'était pas installée sur l'écran d'accueil, ou l'adresse a changé. Avec la sauvegarde en ligne, entrez le mot de passe pour tout récupérer. |
| Mot de passe oublié | Changez le secret `APP_PASSWORD` dans Cloudflare, **Deploy**, puis entrez le nouveau sur chaque téléphone. |

Toujours bloqué, ou une idée d'amélioration ? Posez-la dans les [Discussions du projet d'origine](https://github.com/tekuu-59/prospection-app/discussions) (pas dans votre fork). C'est public : jamais de mot de passe ni de données clients.

## Données personnelles (RGPD)

L'app tient un **fichier de prospects** (noms, commentaires, positions, cartes de visite). Chaque franchisé en est **responsable** : c'est votre fichier, pas celui de l'auteur de l'app. Ce qui suit résume vos obligations ; ce n'est pas un avis juridique, faites-le relire si besoin (service juridique du réseau, CNIL).

**Ce que l'app fait déjà pour vous**

- Effacement automatique : 3 ans après la date de prospection (durée recommandée par la CNIL pour un prospect), le nom, le commentaire et la position du client sont effacés, et les contacts de cartes de visite supprimés. Les compteurs (portes, R1, R2) restent pour les statistiques. Pensez à faire de même dans vos exports Excel et dans le Google Sheet.
- Les photos de cartes ne sont jamais enregistrées. La carte et le lecteur de texte sont servis par votre propre adresse, sans CDN.
- Un rappel sous le champ Commentaire : des faits utiles seulement, jamais de jugement sur la personne ni de donnée sensible (santé, religion, opinions…). La CNIL a déjà sanctionné des commentaires déplacés dans des fichiers clients.

**Ce que vous devez faire**

1. **Tenir un registre des traitements** (obligatoire même pour une petite entreprise, car la prospection est régulière). Une fiche suffit, par exemple :

   | Rubrique | Contenu |
   | --- | --- |
   | Traitement | Prospection commerciale en porte-à-porte |
   | Responsable | Votre société (raison sociale, adresse, gérant) |
   | Finalité | Suivre les prospects rencontrés et les rendez-vous |
   | Base légale | Intérêt légitime (art. 6.1.f RGPD) |
   | Personnes | Commerçants, dirigeants et salariés d'entreprises prospectées |
   | Données | Société, nom, fonction, e-mail, téléphone, adresse, commentaire, position GPS, date, statut R1/R2 |
   | Durée | 3 ans après le dernier contact (effacement automatique dans l'app) |
   | Destinataires | Vous et vos salariés habilités |
   | Sous-traitants | Cloudflare (hébergement de l'app et base D1, juridiction UE si choisie), Google (Sheet, si utilisé), Fondation OpenStreetMap (nom de rue à partir de la position, tuiles de la carte) |
   | Sécurité | Mot de passe, limite d'essais, Cloudflare Access (si activé), HTTPS, double authentification sur les comptes |

2. **Informer les personnes** au plus tard au premier contact. Par exemple, au dos du flyer ou de la carte laissée sur place :

   > Vos coordonnées sont enregistrées par [votre société] pour vous recontacter au sujet de votre projet, pendant 3 ans au plus. Vous pouvez y accéder, les corriger, les faire effacer ou vous opposer à leur utilisation : [e-mail]. Plus d'infos : [adresse de votre politique de confidentialité]. Réclamation possible auprès de la CNIL (cnil.fr).

3. **Répondre aux demandes** sous un mois : l'export Excel donne la copie des données, et le 🗑 les supprime (aussi dans la sauvegarde en ligne). Pensez au Google Sheet.
4. **Mailings** : une mention d'information et un lien de désinscription dans chaque e-mail.
5. **Base créée avant cette version, hors UE** : pour la passer en UE, créez une nouvelle base avec la juridiction EU, puis `npx wrangler d1 export prospection --remote --output=prospection.sql` et `npx wrangler d1 execute NOUVELLE-BASE --remote --file=prospection.sql`, changez le Database ID dans `wrangler.jsonc` et supprimez l'ancienne base.

L'adresse `workers.dev` n'est pas indexée par les moteurs de recherche, et sans mot de passe on ne voit qu'une app vide.

## Pour les développeurs

JavaScript pur, sans build. `_worker.js` sert les routes `/api/sync` (base D1) et `/api/sheet` (relais vers Apps Script) et laisse le reste aux fichiers statiques ; `wrangler.jsonc` le configure. `.assetsignore` empêche de publier les fichiers serveur. `_headers` donne les en-têtes de sécurité (CSP stricte : tout code vient de l'app ; voir `vendor/README.md` pour Leaflet et Tesseract). `rgpd.js` fait l'effacement à 3 ans. Test local : `python3 -m http.server 8000` (sans en-têtes ni API), ou `npx wrangler dev` pour avoir les deux. Tests : `node --test test/*.mjs`. La carte s'ouvre centrée sur Évreux tant qu'aucun point n'est enregistré (`app.js`, `setView`).
