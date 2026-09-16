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
