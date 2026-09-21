# Icônes des points et voiture garée

## But

- Chaque point a une icône, choisie dans un catalogue orienté forêt et champignons, plus une voiture.
- La voiture garée : chaque « garé ici » crée un point voiture (historique gardé), le plus récent est mis en surbrillance.
- Les emojis de l'interface sont remplacés par des icônes vectorielles.

## Icônes

- Bibliothèque : `react-icons` (Lucide `lu` + Game Icons `gi` pour les champignons et la faune). Import nommé : seules les icônes utilisées sont embarquées.
- Catalogue dans un module unique `web/src/waypoints/icons.ts` : `id` (stocké), libellé, composant, couleur.

| id | Libellé | Icône | Couleur |
|---|---|---|---|
| `pin` | Point | `LuMapPin` | `#047857` |
| `mushroom` | Champi | `GiMushroomGills` | `#b45309` |
| `cepe` | Cèpe | `GiMushroom` | `#92400e` |
| `girolle` | Girolle | `GiChanterelles` | `#d97706` |
| `mushroom-spot` | Coin à champis | `GiMushrooms` | `#9a3412` |
| `pine` | Sapin | `LuTreePine` | `#166534` |
| `tree` | Feuillu | `LuTreeDeciduous` | `#15803d` |
| `sprout` | Pousse | `LuSprout` | `#65a30d` |
| `leaf` | Feuille | `GiOakLeaf` | `#4d7c0f` |
| `water` | Eau | `GiWaterDrop` | `#0284c7` |
| `deer` | Cerf | `GiDeerHead` | `#78350f` |
| `boar` | Sanglier | `GiBoar` | `#57534e` |
| `bird` | Oiseau | `LuBird` | `#0f766e` |
| `flag` | Drapeau | `LuFlag` | `#7c3aed` |
| `star` | Favori | `LuStar` | `#ca8a04` |
| `cabin` | Cabane | `GiWoodCabin` | `#7c2d12` |
| `viewpoint` | Point de vue | `LuBinoculars` | `#475569` |
| `danger` | Danger | `LuTriangleAlert` | `#dc2626` |
| `car` | Voiture | `LuCarFront` | `#1d4ed8` |

- Un `id` inconnu (point créé par une version plus récente) s'affiche comme `pin`.

## Données

- `Waypoint.icon: string`. Points existants (IndexedDB) sans champ : lus comme `'pin'`, pas de migration IndexedDB.
- Supabase : migration `supabase/migrations/20260921000000_waypoint_icon.sql`, `alter table public.waypoints add column icon text not null default 'pin'`.
- Sync : `toRow` / `fromRow` envoient et reçoivent `icon`. Un changement d'icône passe par `updatedAt` (le plus récent gagne), comme un renommage.
- Déploiement : `npx supabase db push` avant d'installer l'APK, sinon l'upsert échoue (colonne inconnue) et les points restent 📱 jusqu'au push.

## Interface

- **Marqueur** : goutte de la couleur de l'icône, icône blanche dedans, nom dessous. Rendu React (portail dans l'élément du `Marker` MapLibre).
- **Nouveau point** : grille d'icônes (défaut `pin`) sous le nom.
- **Feuille d'un point** : « Renommer » devient « Modifier » (nom + grille d'icônes).
- **Liste** : icône colorée devant le nom.
- **Voiture** :
  - Feuille de ta position (tap sur le point bleu) : bouton « Garé ici » qui crée directement un point `car` nommé « Voiture JJ/MM HH:MM » à la position GPS.
  - Tous les points voiture sont gardés. Le plus récent (plus grand `createdAt` parmi les points `car` non supprimés) est en surbrillance : marqueur plus grand avec un halo, et badge « Dernière » dans la liste et dans sa feuille.
- **Nom par défaut** : « Point JJ/MM HH:MM » (au lieu de « Waypoint … »).
- **Emojis remplacés** (Lucide) : barre du bas (📍 🗺️ ⚙️), état de sync (📱 ☁️), bandeau de cible (🎯 ✅), alertes boussole (🧭 📱) et stockage (⚠️), croix de fermeture (✕), boutons ◎ ◉ ▲ (GPS, suivi, nord), badge GPS.

## Vérification

- `npx tsc --noEmit`, build Android, lint.
- Captures Chrome headless (catalogue, marqueurs, voiture en surbrillance, barre du bas).
- Checklist appareil : section O (création avec icône, modification, sync d'une icône entre deux appareils ou après réinstallation, « Garé ici » deux fois → seul le dernier en surbrillance, emojis disparus).
