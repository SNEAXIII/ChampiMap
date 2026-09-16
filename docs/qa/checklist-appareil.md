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
- [ ] E1 Supprimer une zone hors ligne : la taille de `chunks.db` (`run-as fr.champimap ls -la databases/`) diminue

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
