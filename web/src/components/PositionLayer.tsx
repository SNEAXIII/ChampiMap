import { useEffect, useRef } from 'react';
import { Marker, type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import type { LocationFix } from '../bridge/bridge';
import { circlePolygon } from '../geo/geo';

type Props = {
  map: MapLibreMap;
  fix: LocationFix | null;
  onSelect: () => void;
  onMarker?: (marker: Marker | null) => void;
};

const SOURCE_ID = 'position-accuracy';
const EMPTY = { type: 'FeatureCollection', features: [] } as const;

/** Point bleu cliquable + cercle de précision (en mètres, suit le zoom). */
export function PositionLayer({ map, fix, onSelect, onMarker }: Props) {
  const markerRef = useRef<Marker | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const addLayers = () => {
      if (map.getSource(SOURCE_ID)) return;
      map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'position-accuracy-fill', type: 'fill', source: SOURCE_ID, paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'position-accuracy-line', type: 'line', source: SOURCE_ID, paint: { 'line-color': '#2563eb', 'line-width': 1, 'line-opacity': 0.5 } });
    };
    if (map.isStyleLoaded()) addLayers();
    else map.once('load', addLayers);

    const element = document.createElement('button');
    element.type = 'button';
    element.setAttribute('aria-label', 'Ma position');
    element.className = 'block h-5 w-5 rounded-full border-[3px] border-white bg-blue-600 shadow-[0_0_0_3px_rgba(37,99,235,0.3)]';
    // Empêche le toucher du marqueur de démarrer l'appui long (création de waypoint) de la carte.
    element.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      onSelectRef.current();
    });
    const marker = new Marker({ element });
    markerRef.current = marker;
    onMarker?.(marker);

    return () => {
      marker.remove();
      markerRef.current = null;
      onMarker?.(null);
      map.off('load', addLayers);
    };
    // onMarker est stable (setter d'état) dans App.
  }, [map, onMarker]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !fix) return;
    marker.setLngLat([fix.longitude, fix.latitude]).addTo(map);
    const source = map.getSource<GeoJSONSource>(SOURCE_ID);
    if (!source) return;
    source.setData(
      fix.accuracy === null
        ? EMPTY
        : { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: circlePolygon(fix, fix.accuracy) } },
    );
  }, [map, fix]);

  return null;
}
