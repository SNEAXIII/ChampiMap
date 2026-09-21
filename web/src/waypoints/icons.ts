import type { IconType } from 'react-icons';
import { GiChanterelles, GiMushroom, GiMushroomGills, GiMushrooms, GiOakLeaf, GiWaterDrop, GiWoodCabin } from 'react-icons/gi';
import { LuBinoculars, LuCarFront, LuFlag, LuMapPin, LuStar, LuTriangleAlert } from 'react-icons/lu';

export type WaypointIcon = { id: string; label: string; Icon: IconType; color: string };

/** Catalogue des icônes de points. `id` est stocké (IndexedDB, Supabase) : ne jamais le renommer. */
export const WAYPOINT_ICONS: WaypointIcon[] = [
  { id: 'pin', label: 'Point', Icon: LuMapPin, color: '#047857' },
  { id: 'mushroom', label: 'Champi', Icon: GiMushroomGills, color: '#b45309' },
  { id: 'cepe', label: 'Cèpe', Icon: GiMushroom, color: '#92400e' },
  { id: 'girolle', label: 'Girolle', Icon: GiChanterelles, color: '#d97706' },
  { id: 'mushroom-spot', label: 'Coin à champis', Icon: GiMushrooms, color: '#9a3412' },
  { id: 'leaf', label: 'Feuille', Icon: GiOakLeaf, color: '#4d7c0f' },
  { id: 'water', label: 'Eau', Icon: GiWaterDrop, color: '#0284c7' },
  { id: 'flag', label: 'Drapeau', Icon: LuFlag, color: '#7c3aed' },
  { id: 'star', label: 'Favori', Icon: LuStar, color: '#ca8a04' },
  { id: 'cabin', label: 'Cabane', Icon: GiWoodCabin, color: '#7c2d12' },
  { id: 'viewpoint', label: 'Point de vue', Icon: LuBinoculars, color: '#475569' },
  { id: 'danger', label: 'Danger', Icon: LuTriangleAlert, color: '#dc2626' },
  { id: 'car', label: 'Voiture', Icon: LuCarFront, color: '#1d4ed8' },
];

export const DEFAULT_ICON_ID = 'pin';
export const CAR_ICON_ID = 'car';

const byId = new Map(WAYPOINT_ICONS.map((icon) => [icon.id, icon]));

/** Icône d'un point ; un id inconnu (créé par une version plus récente de l'app) retombe sur « Point ». */
export const waypointIcon = (id: string | undefined): WaypointIcon => byId.get(id ?? DEFAULT_ICON_ID) ?? byId.get(DEFAULT_ICON_ID)!;
