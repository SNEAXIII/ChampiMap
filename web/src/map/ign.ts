import type { StyleSpecification } from 'maplibre-gl';

// Géoplateforme IGN, WMTS sans clé. Tuiles « non soumises à limite d'usage » (CGU art. 3.2).
export const PLAN_IGN_TILE_URL =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png';

// Sur Android, Kotlin sert les chunks depuis le cache SQLite (ou l'IGN) sur cette URL.
export const CHUNK_TILE_URL = 'https://appassets.androidplatform.net/chunks/{z}/{x}/{y}';

// Détail max imposé (docs/mvp.md). Au-delà, MapLibre agrandit le zoom 17 : flou mais jamais blanc.
export const MAX_DETAIL_ZOOM = 17;

// Forêt de Chaux, [longitude, latitude].
export const START_CENTER: [number, number] = [5.68, 47.08];
export const START_ZOOM = 12;

export function createIgnStyle(tileUrl: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      'plan-ign': {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        minzoom: 0,
        maxzoom: MAX_DETAIL_ZOOM,
        attribution: '© IGN – Plan IGN',
      },
    },
    layers: [
      // Fond visible là où aucune tuile n'est chargée.
      { id: 'background', type: 'background', paint: { 'background-color': '#ece9e1' } },
      { id: 'plan-ign', type: 'raster', source: 'plan-ign' },
    ],
  };
}
