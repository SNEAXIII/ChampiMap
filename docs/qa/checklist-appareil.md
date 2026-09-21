# Champi Map — checklist QA appareil (session finale)

Appareil : Samsung R5GYB08Q2NV (+ émulateur Android 10 `champi-api29` si mémoire suffisante). Taps adb peu fiables : préférer UiAutomator2/Appium ou taps au doigt.

## Phase 2 (déjà vérifié, sauf)
- [ ] Renommer un waypoint (fait au doigt par l'utilisateur, sans capture)

## Phase 3 — position
- [ ] A1 Permission « Approximative » : pas de crash, badge ± N m
- [ ] A2 Retour en « Précise »
- [ ] A3 Stop GPS depuis la notification app en arrière-plan → au retour badge « GPS arrêté · touche ◎ » (capture faite, verdict non consigné)
- [ ] B1 Point bleu + cercle de précision
- [x] B2 ◎ recentre (nord en haut)
- [~] B3 ◎ → ◉ Suivi + KEEP_SCREEN_ON actif (recentrage vu, flag non vérifié)
- [ ] B4 Glisser la carte → ◎ gris + KEEP_SCREEN_ON retiré
- [ ] B5 Tap point bleu → « Ma position » → Créer un waypoint ici → 📍 au point bleu
- [ ] B6 Tap 📍 → « À N m »
- [x] B7 Mode avion : fix < 60 s (± 3 m, 34 sat)
- [ ] B8 Appui long sur point bleu / 📍 : pas de viseur ; appui long sur un marqueur n'ouvre pas non plus la feuille de création
- [ ] B9 Retour ferme la feuille « Ma position »
- [ ] Icônes barre système sombres sur Android 10 (enableEdgeToEdge)
- [ ] Release APK : smoke test (bridge, retour, IndexedDB, origine appassets)

### Phase 3 — revue finale (2026-09-16)
- [ ] C1 A1 en premier : « Approximative » → pas de crash (`logcat -b crash`), badge « ± N m » sans « 0 sat. »
- [ ] C2 Stop depuis la notif app en arrière-plan puis réouverture : badge « GPS arrêté · touche ◎ » ; point bleu atténué (périmé)
- [ ] C3 Écran éteint 10+ min en poche (Doze, optimisation batterie Samsung) : fixes toutes les ~30 s
- [ ] C4 Android 14+ : balayer la notification du service — Stop encore accessible ? GPS continue ?
- [ ] C5 Notifications refusées (13+) : service sans notif visible, Stop trouvable (gestionnaire d'apps actives) ?
- [ ] C6 Refuser la localisation deux fois puis ◎ ; puis autoriser dans Réglages et revenir : texte du badge
- [ ] C7 Révoquer la localisation dans Réglages pendant que le service tourne : pas de boucle de crash, permission redemandée
- [ ] C8 Option dev « Ne pas conserver les activités » : arrière-plan puis retour via la notif — état et ◎ OK
- [ ] C9 Balayer l'app des récents : notif et icône GPS disparaissent
- [ ] C10 En Suivi, glisser en partant du point bleu : la carte bouge et quitte le Suivi ; idem ailleurs
- [ ] C11 En Suivi, pincer pour zoomer : geste non interrompu par l'easeTo
- [ ] C12 Crédit IGN (i) visible et touchable en bas à gauche, ◎ en bas à droite
- [ ] C13 KEEP_SCREEN_ON : actif en Suivi, retiré après glissé, retiré après arrière-plan/retour
- [ ] C14 Batterie : 1 h en arrière-plan GPS actif (batterystats / écran batterie Samsung)
- [ ] C15 Crash du renderer (chrome://inspect ou mémoire basse) : l'activité se recrée et la position se resynchronise
- [ ] C16 GPS actif sans nouveau fix pendant > 60 s : badge « Position d'il y a N min » et point bleu atténué ; simulable en intérieur loin des fenêtres
- [ ] C17 Ménage : mode avion laissé activé à la fin de la séance du 2026-09-16

## Phase 4 — cache des cartes
- [ ] D1 En ligne : carte Plan IGN servie via `/chunks/`, aucune erreur CORS dans logcat
- [ ] D2 Après 3 glissés + 2 zooms : `run-as fr.champimap ls -la databases/` montre `chunks.db` non vide
- [ ] D3 Mode avion + relance : zone parcourue affichée depuis le cache, zone jamais vue beige
- [ ] D4 Wi-Fi + GPS actif, panneau Paramètres laissé ouvert : « Cartes vues récemment » augmente nettement en 2 min sans avoir à fermer puis rouvrir le panneau (rafraîchi toutes les 3 s)
- [ ] D5 « aussi en données mobiles » coché survit à une relance ; le décocher
- [ ] D6 Mode avion : zoom 17 autour de soi sans avoir parcouru la zone → carte affichée (pré-téléchargée)
- [ ] D7 Pré-téléchargement stoppé quand le GPS est arrêté (Stop)
- [ ] D8 Remettre le mode avion à OFF (`airplane_mode_on` = 0)
- [ ] D9 Disque presque plein + mode avion : tuiles déjà vues toujours affichées, pas de boucle de re-téléchargement
- [ ] D10 Taille réelle de `chunks.db` (+ `-wal`/`-shm`) proche de « Cartes vues récemment »
- [ ] D11 Cache stable ≤ 500 Mo dans la durée, WAL de quelques Mo au repos
- [ ] D12 Réseau lent : tuiles en cache servies immédiatement, pas d'ANR
- [ ] D13 Retour du réseau après coupure : les tuiles beiges se chargent seules, sans action
- [ ] D14 Wi-Fi coupé pendant un pré-téléchargement (données mobiles non cochées) : conso data quasi nulle
- [ ] D15 Position à la limite de deux secteurs : pas de pré-téléchargement relancé toutes les 5 s
- [ ] D16 Réseau coupé pendant un pré-téléchargement puis rétabli : reprise au fix suivant, pas de crash au Stop
- [ ] D17 `logcat` (AndroidRuntime, SQLite) propre après 30 min d'utilisation
- [ ] D18 Tuiles OK en debug (localhost) et en release (appassets)
- [ ] D19 Hors ligne au zoom 17 sur une zone où seuls z15-16 ont été vus : tuile floue affichée, jamais beige

## Phase 5 — zones hors ligne (à vérifier une fois la phase implémentée)
- [ ] E1 Supprimer une zone hors ligne : ses chunks redeviennent du cache ordinaire (pas de suppression immédiate, `chunks.db` ne diminue que si le cache dépasse ensuite sa cible) ; la zone disparaît bien de la liste et de la carte
- [ ] E2 Zoomer sur des cases déjà vues en ligne (jamais téléchargées en zone) : le brouillard hors ligne ne les recouvre pas (régression C1 — `availableRegions`)
- [ ] E3 Wi-Fi connecté mais sans accès Internet (portail captif) : le brouillard hors ligne apparaît-il à tort ? (limite connue de `navigator.onLine`, à documenter si oui)
- [ ] E4 Supprimer la zone en cours de téléchargement alors qu'une autre est en attente : cette dernière démarre
- [ ] E5 Tracer une grande zone (> 1 Go projeté) : l'avertissement « plus de 1 Go » apparaît avant de lancer le téléchargement
- [ ] E6 Zone couvrant un secteur hors couverture IGN (erreurs persistantes) : elle n'est pas marquée « Complète » dès la première passe en échec, seulement après des passes qui stagnent/empirent d'affilée (I1)
- [ ] E7 Appuyer sur Accueil juste après le lancement de l'app avec une zone en cours de téléchargement : pas de crash (I2 — `ForegroundServiceStartNotAllowedException`)
- [ ] E8 Double-tap rapide sur [Télécharger] lors de la création d'une zone : une seule zone créée (I3)
- [ ] E9 Poser un doigt puis un second avec un léger tremblement du premier avant qu'il ne se pose (pincer/zoomer) : le rectangle déjà tracé reste inchangé (M2)
- [ ] E10 Sous le niveau de zoom de la grille (9) : glisser un doigt ou la souris ne trace aucun rectangle ; message « Zoome pour afficher la grille des cases. » affiché (M3)

### Task 1 — création et téléchargement
- [ ] F1 Mise à jour depuis la phase 4 : l'app démarre sans crash (migration `chunks.db` v1 → v2) ; `logcat` (AndroidRuntime, SQLite) propre
- [ ] F2 Zoom niveau 11 sur une zone jamais vue, tap « Zones hors ligne » : la grille apparaît
- [ ] F3 Un doigt sur ~2 cases : rectangle vert aligné sur la grille, « 2 cases · ≈ N Mo » ; la carte n'a pas bougé
- [ ] F3b Après avoir tracé un rectangle, poser un second doigt (pincer ou déplacer à deux doigts) : le rectangle reste inchangé, la carte zoome/bouge normalement
- [ ] F3c Un tap (sans glisser) sur une case : sélectionne cette case seule (« 1 case · ≈ N Mo »)
- [ ] F4 [Télécharger] → nom « Zone du JJ/MM » → [Télécharger] : le mode sélection se ferme, la notification « Téléchargement des zones hors ligne » montre un pourcentage qui augmente
- [ ] F5 App en arrière-plan (Home) pendant 60 s : la notification progresse toujours
- [ ] F6 Mode avion pendant le téléchargement : la notification passe à « en attente du réseau » ; désactiver le mode avion : la progression reprend
- [ ] F7 Forcer l'arrêt de l'app pendant le téléchargement puis la relancer : la notification réapparaît, la progression continue sans repartir de zéro
- [ ] F8 Téléchargement terminé : mode avion, relancer, zoomer au niveau 17 dans la zone → carte nette ; remettre le mode avion à OFF (`airplane_mode_on` = `0`)

### Task 2 — liste des zones
- [ ] G1 Tap « Zones hors ligne » : la liste montre la zone de la Task 1, avec « Complète », sa taille (Mo) et sa date
- [ ] G2 [+ Nouvelle zone hors ligne] : le mode sélection s'ouvre ; créer une zone d'une case ; rouvrir la liste : la nouvelle zone affiche un pourcentage qui augmente (rouvrir après 10 s)
- [ ] G3 [Renommer] → `Forêt` → OK : le nom change
- [ ] G4 [Voir sur la carte] : la liste se ferme et la carte cadre la zone
- [ ] G5 [Supprimer] → [Confirmer] sur la zone d'une case : elle disparaît ; si elle était en cours, la notification s'arrête sous ~5 s
- [ ] G6 Paramètres : « Zones hors ligne : N Mo » correspond à peu près à la somme des tailles affichées
- [ ] G7 Retour Android depuis la liste : la liste se ferme

### Task 3 — brouillard et contours
- [ ] H1 Créer une zone d'une case ; pendant son téléchargement : la case est voilée de gris
- [ ] H2 Téléchargement terminé : voile retiré, contour vert pointillé autour de la zone (la zone de la Task 1 aussi)
- [ ] H3 Mode avion, attendre 3 s, zoomer au niveau 11 autour d'une zone complète : les cases ni en zone ni déjà vues sont voilées, la zone complète et les secteurs parcourus ne le sont pas
- [ ] H4 Dézoomer sous le niveau 10 : pas de voile hors ligne
- [ ] H5 Désactiver le mode avion : le voile hors ligne disparaît sous ~3 s ; vérifier `airplane_mode_on` = `0`

## Phase 6 — sauvegarde Supabase

Prérequis : `docs/supabase-setup.md` complété (web/.env.local + android/local.properties remplis).

### Task 2 — connexion Google
- [ ] I1 Paramètres : section « Sauvegarder mes waypoints » avec [Se connecter avec Google]
- [ ] I2 Tap : la feuille Google Credential Manager s'ouvre ; choisir un compte soi-même
- [ ] I3 Capture : « Connecté : <email> » ; relancer l'app (force-stop + start) : toujours connecté (session persistée)
- [ ] I4 En cas d'erreur affichée, la rapporter mot pour mot (pistes : SHA-1 du client Android, Client IDs dans Supabase, « Nonces mismatch »)
- [ ] I5 [Se déconnecter] : le bouton de connexion revient
- [ ] I6 Mode avion : le bouton affiche « Connexion impossible hors ligne », l'app reste utilisable ; désactiver le mode avion, vérifier `airplane_mode_on` = `0`

### Task 3 — synchronisation
- [ ] J1 Déconnecté, créer 2 waypoints `Sync A` et `Sync B` : dans la liste, 📱 sur chacun
- [ ] J2 Paramètres → se connecter (choisir un compte soi-même). Sous ~5 s : « ☁️ Tous les waypoints sont sauvegardés », et la liste montre ☁️ sur les deux (première connexion : rattachement et envoi)
- [ ] J3 Demander à l'utilisateur de vérifier dans Supabase (Table Editor → waypoints) que `Sync A` et `Sync B` existent avec son `user_id`
- [ ] J4 Mode avion (accord donné) : renommer `Sync A` en `Sync A2` et supprimer `Sync B`. La liste affiche 📱 pour `Sync A2` (et ne montre plus `Sync B`). Paramètres : « 📱 1 waypoint sur l'appareil » (compte le renommage, pas la suppression). Tenter « Se déconnecter » → « Confirmer » : message refusant la déconnexion (« 2 modifications pas encore sauvegardées » — renommage + suppression comptent ensemble)
- [ ] J5 Désactiver le mode avion (vérifier `airplane_mode_on` = `0`). Sous ~5 s, `Sync A2` passe à ☁️. L'utilisateur vérifie dans Supabase : `Sync A2` renommé, et `deleted_at` renseigné sur `Sync B`
- [ ] J6 Conflit : l'utilisateur modifie le `name` de `Sync A2` en `Serveur` et met `updated_at` à maintenant + 1 h dans le Table Editor. Tap « Synchroniser » : le waypoint s'appelle « Serveur » sur le téléphone
- [ ] J6b Après J6, renommer « Serveur » en « Serveur 2 » sur le téléphone : il passe à ☁️, et Supabase (Table Editor) affiche « Serveur 2 »
- [ ] J7 Se déconnecter (en ligne) : la liste est vide. Se reconnecter : « Serveur » revient, et `Sync B` reste supprimé (non affiché)
- [ ] J8 Relancer l'app : aucune erreur de sync affichée, les waypoints sont toujours là

## Phase 7 — boussole et cible

### Task 1 — cap et Suivi
- [ ] K1 Téléphone posé à plat, haut du téléphone vers le nord (boussole ou repère connu) : le cône bleu du marqueur pointe vers le haut de la carte (nord en haut)
- [ ] K2 Se tourner de 90° vers l'est : le cône pointe vers la droite de la carte
- [ ] K3 Tap ◎ deux fois (Suivi ◉) : la carte tourne, le haut de l'écran correspond à la direction du téléphone ; se tourner lentement : la carte suit sans saccades gênantes (signaler sinon)
- [ ] K3b En Suivi, pincer pour zoomer : le geste va à son terme sans être coupé net par la rotation de la carte
- [ ] K4 Redresser le téléphone à la verticale : le bandeau « Tiens le téléphone à plat » apparaît, et la carte arrête de tourner (garde sa dernière orientation) ; le reposer à plat : le bandeau disparaît et la carte reprend le cap
- [ ] K5 Glisser la carte au doigt (sortie du Suivi) : la carte garde sa rotation et le bouton nord ▲ apparaît ; taper dessus : nord en haut, le bouton disparaît
- [ ] K6 Tap ◎ (Centré) : nord en haut
- [ ] K7 Si « Boussole imprécise » s'affiche à un moment, faire un 8 avec le téléphone : le bandeau disparaît

### Task 2 — cible
- [ ] L1 Créer (ou utiliser) un waypoint à 100–500 m, dans une direction connue. Tap dessus → [Cibler] : la feuille se ferme, le bandeau « 🎯 Nom · N m » apparaît en bas à gauche, et une flèche verte orbite autour du point bleu vers le waypoint
- [ ] L2 Dézoomer/déplacer la carte pour que le waypoint sorte de l'écran : la flèche pointe toujours vers lui
- [ ] L3 Suivi ◉ : la carte tourne avec le téléphone, et la flèche reste orientée vers le waypoint réel (se tourner dans la direction indiquée pour confirmer)
- [ ] L4 Écran : `timeout 30 adb shell dumpsys window | grep -i KEEP_SCREEN_ON` actif, même après être sorti du Suivi (glisser la carte), tant que la cible est active
- [ ] L5 Créer un waypoint « Ici » sur sa propre position (tap point bleu → Créer), le cibler : bandeau vert « ✅ Arrivé · Ici » (distance < 10 m). La cible n'est pas arrêtée automatiquement
- [ ] L6 ✕ sur le bandeau : bandeau et flèche disparaissent. Hors Suivi, le flag KEEP_SCREEN_ON disparaît
- [ ] L7 Cibler un waypoint, relancer l'app : la cible est toujours active. Supprimer ce waypoint : la cible disparaît
- [ ] L8 Cible active : le « ⓘ » d'attribution IGN (bas à gauche) reste visible sous le bandeau et reste tapable

### Revue finale
- [ ] M1 Suivi ◉ actif : appui long sur la carte (viseur) en gardant le doigt immobile : la carte reste fixe pendant tout l'appui, et le point créé au relâchement correspond bien au réticule affiché
- [ ] M2 En Suivi, ouvrir « Zones hors ligne » → [+ Nouvelle zone hors ligne] : le Suivi est quitté (bouton ◎), la grille de sélection est nord en haut et ne bouge pas pendant le tracé du rectangle
- [ ] M3 Hors ligne + Suivi en marchant (ou en simulant un déplacement) : le brouillard se met à jour au fil de la marche, pas seulement à l'arrêt
- [ ] M4 Feuille d'un waypoint (WaypointSheet) à 360 dp de large : les 3 boutons sont lisibles, pas de texte coupé
- [ ] M5 Provoquer « 🧭 Boussole imprécise : fais un 8 avec le téléphone » : le message est entièrement visible (pas de troncature) même à 360 dp
- [ ] M6 Téléphone posé à plat et immobile, démarrage à froid de l'app (force-stop puis relance) : le cône de cap apparaît sans avoir à bouger le téléphone
- [ ] M7 Cibler un waypoint, se déconnecter puis se reconnecter avec le même compte : la cible reste active (comportement attendu)

## Retours de QA du 21/09 — optimisations
- [ ] N1 Interface : plus aucun « waypoint » visible (barre du bas « Points », « Nouveau point », recherche, liste vide, Paramètres → compte)
- [ ] N2 Nouvelle zone hors ligne, zoom ≥ 9 : la grille des cases est nettement visible (trait sombre bordé de blanc), en forêt comme en ville
- [ ] N3 Sélectionner 1 case et noter l'estimation ; après téléchargement, la taille affichée dans la liste est du même ordre (± 50 %)
- [ ] N4 Télécharger une zone de ~10 cases : nettement plus rapide qu'avant (≈ 5–10 s par case en 4G/Wi-Fi) ; la liste affiche « N / M images », la notification aussi
- [ ] N5 Pendant ce téléchargement, déplacer la carte ailleurs : les tuiles à l'écran continuent de s'afficher sans blocage
