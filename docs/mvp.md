# MVP — spécification

Le vocabulaire (Chunk, Région, Claim, Brouillard, Cible, Viseur, Cap, Relèvement, Suivi…) est défini dans [CONTEXT.md](../CONTEXT.md). Les décisions structurantes sont dans [docs/adr/](./adr/).

## Stack

- `web/` : Vite + React + TypeScript + Tailwind + **MapLibre GL JS** ([ADR 0003](./adr/0003-maplibre-plutot-que-leaflet.md)).
- `android/` : Kotlin, une seule `MainActivity` avec une WebView, plus un service de localisation. Pas de Compose.
- Supabase : Google Auth + table `waypoints`. Aucun backend custom.
- Android 8+ (`minSdk 26`), portrait verrouillé.
- Pas de tests automatisés pour le MVP : on teste en live sur le téléphone (USB).

## Carte

- Source : **Plan IGN v2** (Géoplateforme WMTS, sans clé, PNG). Pas de photos aériennes. SCAN 25 est interdit aux particuliers.
- Mention « © IGN » minime : bouton ⓘ repliable.
- La carte tourne selon le cap uniquement en Suivi. Sinon elle garde la rotation choisie par l'utilisateur, avec une boussole pour revenir au nord.
- Zoom au-delà du détail disponible : image agrandie floue, jamais d'écran blanc.

## Chunks, cache, claims

- Chunks servis par Kotlin : interception WebView + SQLite unique ([ADR 0001](./adr/0001-cache-chunks-interception-kotlin-sqlite.md)).
- Région = emprise d'un chunk au **zoom 13** (≈ 3 km de côté). Constante réglable.
- Détail max = **zoom 17**, imposé. À confirmer par des tests terrain.
- Claim = coin haut-gauche + coin bas-droite (en régions) + nom. Il couvre z0 → z17. La propriété « claimé » d'un chunk est calculée à partir des claims, jamais stockée par chunk.
- **Cache** : vise 500 MB (non réglable), les chunks non claimés les plus anciens sont supprimés d'abord.
- **Seuil global de 1 GB** (cache + claims) :
  - avertissement visible avant de créer un claim qui fait dépasser ;
  - au-delà, le cache se vide pour se rapprocher de 1 GB ;
  - les claims ne sont jamais supprimés automatiquement.
- **Pré-téléchargement** : la région de la position + ses 8 voisines. En Wi-Fi uniquement par défaut, interrupteur « aussi en données mobiles » dans Paramètres. Ces chunks vont dans le cache.
- **Estimation de taille** : moyenne réelle des chunks stockés pour chaque zoom, 70 KB par défaut tant qu'on n'a rien.
- **Téléchargement** et pré-téléchargement exécutés en Kotlin dans des services au premier plan (pré-téléchargement dans le service de localisation, zones hors ligne dans un service de téléchargement dédié) (le JS d'une WebView est mis en pause en arrière-plan). Le TS affiche la progression. 16 requêtes IGN au plus : 8 pour l'affichage, 8 pour les téléchargements de fond (le WMTS IGN n'a pas de limite de débit), connexions réutilisées, User-Agent identifiable. Il continue quand l'app est en arrière-plan (progression dans la notification). Reprise automatique après arrêt ou crash, en recalculant les chunks manquants.

### Création d'une zone hors ligne

1. Menu → « Nouvelle zone hors ligne » → mode sélection, la grille de cases s'affiche.
2. Un doigt trace un rectangle aligné sur les cases, deux doigts déplacent et zooment la carte.
3. En direct : nombre de cases, taille estimée, avertissement si le total dépasse 1 GB.
4. [Télécharger] → nom (prérempli « Zone du JJ/MM ») → brouillard sur les cases en cours.

### Liste des zones hors ligne

Nom, taille, date, état (complète / X % / en pause). Actions : renommer, supprimer, voir sur la carte.

### Brouillard

- Sur les régions en cours de téléchargement.
- Contour discret autour des claims complets.
- Sans réseau : brouillard sur tout ce qui n'est ni claimé ni en cache.

## Waypoints

- Stockage local IndexedDB. Champs : `id` (UUID client), `name`, `latitude`, `longitude`, `created_at`, `updated_at`, `deleted_at`, plus l'état local/synchronisé.
- **Appui long** (~0,5 s) → vibration + viseur ~60 px au-dessus du doigt, la carte ne glisse plus. Glisser = ajuster, coordonnées affichées en direct. Relâcher = feuille [Créer] [Annuler], nom prérempli avec la date. Pas de défilement au bord de l'écran.
- **Tap sur sa position** → feuille : coordonnées, précision, [Créer un waypoint ici] avec nom prérempli « Ma position ».
- **Tap sur un waypoint** → feuille : nom, coordonnées, distance, [Cibler] [Renommer] [Supprimer].
- Noms en double autorisés.
- **Liste** : triée par distance, recherche par nom en haut (hors ligne). Ligne = nom, distance, 📱/☁️. Tap = carte centrée sur le waypoint + feuille.

## Position

- Bridge Kotlin : **FusedLocationProvider haute précision** + `GnssStatus` (nombre de satellites). Cercle de précision sur la carte.
- Fréquence : **5 s** app à l'écran, **30 s** en arrière-plan. Toujours en haute précision.
- Service au premier plan avec notification. Il s'arrête quand l'app est balayée des récents ou via le bouton Stop de la notification.
- Écran maintenu allumé uniquement en Suivi ou avec une Cible active. Sinon veille normale, et le GPS repasse à 30 s.
- Bouton ◎, cycle :
  - Libre → tap → Centré (recentre une fois, nord en haut) → tap → Suivi ◉ (suit la position + tourne selon le cap).
  - Déplacer la carte → retour à Libre.

## Boussole

- Bridge Kotlin : `TYPE_ROTATION_VECTOR`, correction du nord vrai via `GeomagneticField`, alerte de calibration si le magnétomètre est peu fiable.
- Cap = haut du téléphone tenu à plat. Avertissement « tiens le téléphone à plat » au-delà de ~60° d'inclinaison.
- Cible : une flèche en orbite autour du marqueur de position pointe selon le relèvement (même hors écran). Nom + distance en bas. « Arrivé » sous 10 m, sans arrêt automatique. ✕ pour arrêter.

## Sync Supabase

- Connexion Google native (Credential Manager → `signInWithIdToken`) ([ADR 0002](./adr/0002-login-google-natif.md)), uniquement depuis Paramètres. L'app est pleinement utilisable sans compte.
- Table `waypoints` avec RLS : un utilisateur ne voit que ses propres lignes. Suppression logique via `deleted_at`.
- Conflits : le `updated_at` le plus récent gagne, par waypoint entier.
- Première connexion : tous les waypoints locaux sont rattachés au compte et envoyés. Changement de compte : dernière sync, puis on vide les waypoints locaux.
- Déclencheurs : ouverture de l'app, retour du réseau, quelques secondes après chaque modification, bouton manuel. Compteur global « N waypoints sur l'appareil ».

## Développement

- Build debug : la WebView charge le serveur Vite du PC via `adb reverse`, rechargement à chaud sur le téléphone.
- Build release : app web embarquée dans l'APK (`WebViewAssetLoader`).
- Dans le navigateur du PC : faux bridge (GPS du navigateur, boussole simulée, chunks IGN en direct).
- Origines figées : `http://localhost:5173` (debug) et `https://appassets.androidplatform.net` (release). IndexedDB est rangé par origine : changer l'une d'elles rend invisibles les waypoints locaux non synchronisés. Les waypoints créés en debug n'apparaissent pas en release.

## Phases

1. Squelette : monorepo, WebView, MapLibre + Plan IGN en direct.
2. Waypoints locaux : viseur, feuilles, liste, recherche.
3. Position : bridge GPS (avec son faux équivalent dans le navigateur), service, cercle de précision, bouton ◎ (Suivi sans rotation pour l'instant).
4. Cache : interception + SQLite, limites 500 MB / 1 GB, pré-téléchargement.
5. Claims : mode sélection, estimation, téléchargement en arrière-plan, reprise, brouillard, liste.
6. Supabase : login, table + RLS, sync.
7. Boussole : cap, rotation en Suivi, Cible et flèche.

## Plus tard (hors MVP)

- Trace GPS enregistrée en local pour rejouer le chemin parcouru.
- Photos aériennes, recherche de lieux IGN, couleurs et icônes de waypoints.
