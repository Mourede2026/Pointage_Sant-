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

## 4. Sécurité et limites
- L'empreinte est une **photo** conservée pour contrôle visuel par l'administrateur : il n'y a pas de reconnaissance biométrique automatique.
- Les images sont dans Drive avec « lien accessible à tous ceux qui l'ont » : ne partagez pas ces liens. Pour plus de confidentialité, restreignez le partage et servez les fichiers via le script.
- L'heure de retard et la zone sont calculées côté serveur (fuseau Africa/Porto-Novo) : l'agent ne peut pas les modifier.
- Le Sheet contient des données personnelles : limitez son partage aux administrateurs de la plateforme.
- La géolocalisation du navigateur peut être falsifiée sur un téléphone modifié ; la précision GPS (`acc`) est enregistrée pour aider à détecter les cas douteux.
- Quotas Apps Script gratuits : suffisants pour un centre, à surveiller pour un déploiement départemental.

## 5. Installer l'application sur le téléphone
La page doit être ouverte en **HTTPS** (GitHub Pages l'est).
- **Android (Chrome)** : ouvrez le lien, menu ⋮ > **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
- **iPhone (Safari uniquement)** : ouvrez le lien, bouton Partager > **Sur l'écran d'accueil**.
L'icône verte « épingle avec coche » apparaît alors comme une application. Les pointages exigent toujours une connexion Internet et la géolocalisation.
Pour changer l'icône, remplacez les fichiers du dossier `icons/` en gardant les mêmes noms et tailles.
