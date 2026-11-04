# Pointage Santé — guide d'installation

Architecture : **GitHub Pages** (page `index.html`) → **Google Apps Script** (`Code.gs`) → **Google Sheet + Google Drive**.

## 1. Backend (Google Apps Script)
1. Ouvrez votre Google Sheet → **Extensions > Apps Script**.
2. Remplacez le contenu de `Code.gs` par le fichier fourni. Vérifiez la constante `SHEET_ID`.
3. Dans la liste des fonctions, choisissez **`setup`** puis **Exécuter**. Acceptez les autorisations (Sheets, Drive, Maps).
   Cela crée les onglets (Structures, Zones, Admins, Agents, Records), la clé secrète et le dossier Drive `PointageSante`.
4. **Paramètres du projet > Propriétés du script**, ajoutez :
   | Propriété | Valeur |
   |---|---|
   | `ADMIN_PHONE` | téléphone de l'administrateur de la plateforme (ex. 22997000000) |
   | `ADMIN_PASSWORD` | un mot de passe solide |
5. **Déployer > Nouveau déploiement > Application Web** : exécuter en tant que **Moi**, accès **Tout le monde**. Copiez l'URL qui finit par `/exec`.
   (À chaque modification de `Code.gs`, refaites **Gérer les déploiements > Modifier > Nouvelle version**.)

## 2. Frontend (GitHub)
1. Créez un dépôt GitHub et envoyez **tous** les fichiers : `index.html`, `manifest.webmanifest`, `sw.js` et le dossier `icons/`.
2. L'URL `/exec` d'Apps Script est déjà renseignée dans `index.html` (constante `API_URL`) ; modifiez-la seulement si vous redéployez avec une nouvelle URL.
3. **Settings > Pages** : Source = branche `main`, dossier `/ (root)`. L'application sera sur `https://VOTRE-COMPTE.github.io/NOM-DEPOT/`.

## 3. Premiers pas
1. Connectez-vous en **Administrateur** avec `ADMIN_PHONE` / `ADMIN_PASSWORD`.
2. **Structures** : créez chaque structure, puis ajoutez ses zones de travail **depuis le lieu physique** (bouton « + Zone (ma position) »).
3. **Administrateurs** : créez le compte de l'administrateur de chaque structure.
4. Les agents ouvrent le lien, font leur **première inscription**, puis se connectent avec téléphone + PIN.

## 4. Zone de travail et sécurité
- **Pointage uniquement dans la zone :** hors de la zone (plus la tolérance), le pointage est **refusé**. La tentative est enregistrée dans l'onglet Records avec `status = refusé`, visible par l'administrateur.
- **Délimiter une enceinte clôturée :** Administration > Structures > « + Zone clôturée (polygone) ». Placez-vous à chaque angle de la clôture, dans l'ordre, et appuyez sur « Point ici » (minimum 3 points), puis « Terminer ». La tolérance (20 m par défaut) accepte les petites erreurs GPS près de la clôture. Une « Zone circulaire » reste possible pour un petit site.
- **Précision GPS :** un signal plus imprécis que 60 m (constante `MAX_ACC` dans `Code.gs`) est refusé avec le message de réessayer à l'air libre.
- **Plus de photo d'empreinte :** l'agent s'identifie par téléphone + PIN. Une vérification biométrique réelle demande WebAuthn (empreinte du téléphone) ou un lecteur fixe.
- Une position GPS peut être falsifiée par une application de fausse localisation : le serveur ne peut pas le détecter avec certitude. Les tentatives refusées et la précision (`acc`) enregistrées aident à repérer les cas douteux.
- Les images (signatures) sont dans Drive avec « lien accessible à tous ceux qui l'ont » : ne partagez pas ces liens.
- Le Sheet contient des données personnelles : limitez son partage aux administrateurs de la plateforme.
- **Mise à jour depuis une version précédente :** collez le nouveau `Code.gs`, relancez `setup()` (il ajoute les colonnes `poly`, `tol` et `status`), puis créez une nouvelle version du déploiement. Les anciennes zones circulaires restent valides.

## 5. Installer l'application sur le téléphone
La page doit être ouverte en **HTTPS** (GitHub Pages l'est).
- **Android (Chrome)** : ouvrez le lien, menu ⋮ > **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
- **iPhone (Safari uniquement)** : ouvrez le lien, bouton Partager > **Sur l'écran d'accueil**.
L'icône verte « épingle avec coche » apparaît alors comme une application. Les pointages exigent toujours une connexion Internet et la géolocalisation.
Pour changer l'icône, remplacez les fichiers du dossier `icons/` en gardant les mêmes noms et tailles.
