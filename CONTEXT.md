# Champi Map

Carte Android utilisable hors ligne, dans l'esprit de Xaero's World Map, pour se repérer sur le terrain (forêt, sans réseau) avec des waypoints synchronisés.

Les termes inspirés de Minecraft (Chunk, Région, Claim) appartiennent au code et à la documentation. Ils n'apparaissent jamais dans l'interface : le libellé affiché est indiqué sous chaque terme.

## Language

### Carte

**Chunk**:
Une image de carte identifiée par son zoom, sa colonne x et sa ligne y.
_Avoid_: tuile, tile
_Libellé UI_ : image (seulement le compteur de progression d'une zone hors ligne)

**Région**:
La plus petite surface carrée sélectionnable pour un claim, alignée sur une grille fixe (sens Minecraft). Ce n'est jamais une forme libre dessinée par l'utilisateur.
_Avoid_: zone, secteur, région administrative
_Libellé UI_ : case

**Claim**:
Un rectangle de régions, défini par sa région en haut à gauche et sa région en bas à droite, dont tous les chunks sont gardés hors ligne, de la vue la plus dézoomée jusqu'au niveau de détail fixé par l'app.
_Avoid_: zone offline, carte offline, téléchargement
_Libellé UI_ : zone hors ligne

**Chunk claimé**:
Un chunk couvert par au moins un claim. Il n'est jamais supprimé par le nettoyage du cache.
_Avoid_: chunk protégé, chunk épinglé

**Cache**:
L'ensemble des chunks non claimés conservés parce qu'ils ont été vus récemment, supprimables quand la limite de taille est atteinte.

**Brouillard**:
Le voile gris posé sur les régions dont les chunks ne sont pas disponibles : en cours de téléchargement, ou absentes du cache et des claims quand il n'y a pas de réseau.
_Avoid_: fog, zone grisée

### Waypoints

**Waypoint**:
Un point nommé (nom, latitude, longitude) appartenant à un utilisateur.
_Avoid_: POI, marqueur, favori
_Libellé UI_ : point

**Waypoint local**:
Un waypoint dont la dernière version n'a pas encore été envoyée au cloud.
_Libellé UI_ : 📱 sur l'appareil

**Waypoint synchronisé**:
Un waypoint dont la dernière version est identique en local et dans le cloud.
_Libellé UI_ : ☁️ sauvegardé

**Cible**:
Le waypoint vers lequel l'utilisateur navigue. Il y a au plus une cible à la fois.
_Avoid_: waypoint suivi, destination

**Viseur**:
Le réticule qui apparaît au-dessus du doigt pendant un appui long, pour placer précisément un nouveau waypoint.
_Avoid_: cible, curseur, crosshair

### Orientation

**Position**:
L'endroit où se trouve le téléphone, avec sa précision en mètres.

**Cap**:
La direction vers laquelle pointe le haut du téléphone tenu à plat, par rapport au nord vrai.
_Avoid_: orientation (confondu avec portrait/paysage), heading

**Relèvement**:
L'angle entre le nord vrai et la direction qui va de la position à la cible.
_Avoid_: bearing, direction du waypoint

**Suivi**:
L'état dans lequel la carte se recentre sur la position et tourne selon le cap. Il s'arrête dès que l'utilisateur déplace la carte.
_Avoid_: follow, suivre un waypoint
