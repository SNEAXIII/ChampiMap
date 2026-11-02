import { useEffect, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { TrackPoint } from '../bridge/bridge';

type Props = {
  map: MapLibreMap;
  points: TrackPoint[];
};

const SOURCE_ID = 'track';
const EMPTY = { type: 'FeatureCollection', features: [] } as const;

/**
 * Parcours : petits points violets (couleur absente du Plan IGN) posés là où l'on est passé.
 * Les plus anciens sont plus pâles, pour lire le sens de la marche ; le point de départ est plus gros.
 */
export function TrackLayer({ map, points }: Props) {
  // La source n'existe qu'après le chargement du style.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const addLayers = () => {
      setReady(true);
      if (map.getSource(SOURCE_ID)) return;
      map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'track-dots',
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-color': '#7c3aed',
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12,
            ['case', ['get', 'start'], 4, 1.5],
            16,
            ['case', ['get', 'start'], 6, 3],
            19,
            ['case', ['get', 'start'], 8, 5],
          ],
          'circle-opacity': ['get', 'opacity'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['case', ['get', 'start'], 2, 1],
          'circle-stroke-opacity': ['get', 'opacity'],
        },
      });
    };
    if (map.isStyleLoaded()) addLayers();
    else map.once('load', addLayers);
    return () => {
      map.off('load', addLayers);
    };
  }, [map]);

  useEffect(() => {
    if (!ready) return;
    const last = points.length - 1;
    map.getSource<GeoJSONSource>(SOURCE_ID)?.setData({
      type: 'FeatureCollection',
      features: points.map((point, index) => ({
        type: 'Feature',
        properties: {
          start: index === 0,
          // De 0,4 (plus ancien) à 1 (plus récent).
          opacity: last <= 0 ? 1 : 0.4 + (0.6 * index) / last,
        },
        geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
      })),
    });
  }, [map, ready, points]);

  return null;
}
