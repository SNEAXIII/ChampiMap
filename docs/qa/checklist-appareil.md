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
- [ ] B8 Appui long sur point bleu / 📍 : pas de viseur
- [ ] B9 Retour ferme la feuille « Ma position »
- [ ] Icônes barre système sombres sur Android 10 (enableEdgeToEdge)
- [ ] Release APK : smoke test (bridge, retour, IndexedDB, origine appassets)

### Phase 3 — revue finale (2026-09-16)
- [ ] C1 A1 en premier : « Approximative » → pas de crash (`logcat -b crash`), badge « ± N m » sans « 0 sat. »
- [ ] C2 Stop depuis la notif app en arrière-plan puis réouverture : badge « GPS arrêté » ; point bleu grisé (périmé)
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
- [ ] C16 Position périmée : couper le GPS (Stop) → badge « Position d'il y a N min » après 60 s, marqueur atténué
- [ ] C17 Ménage : mode avion laissé activé à la fin de la séance du 2026-09-16
