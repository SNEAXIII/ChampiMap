import { useEffect, useRef } from 'react';
import { Marker, type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import type { LocationFix } from '../bridge/bridge';
import { circlePolygon } from '../geo/geo';

type Props = {
  map: MapLibreMap;
  fix: LocationFix | null;
  stale: boolean;
  onSelect: () => void;
  onMarker?: (marker: Marker | null) => void;
};

const SOURCE_ID = 'position-accuracy';
const EMPTY = { type: 'FeatureCollection', features: [] } as const;

/** Ajoute la source et les couches du cercle de précision si elles manquent encore. Sûr à rappeler. */
function ensureLayers(map: MapLibreMap): void {
  if (map.getSource(SOURCE_ID)) return;
  map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'position-accuracy-fill', type: 'fill', source: SOURCE_ID, paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'position-accuracy-line', type: 'line', source: SOURCE_ID, paint: { 'line-color': '#2563eb', 'line-width': 1, 'line-opacity': 0.5 } });
}

/** Point bleu cliquable + cercle de précision (en mètres, suit le zoom). */
export function PositionLayer({ map, fix, stale, onSelect, onMarker }: Props) {
  const markerRef = useRef<Marker | null>(null);
  const addedRef = useRef(false);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const onLoad = () => ensureLayers(map);
    if (map.isStyleLoaded()) ensureLayers(map);
    else map.once('load', onLoad);

    const element = document.createElement('button');
    element.type = 'button';
    element.setAttribute('aria-label', 'Ma position');
    element.className = 'block h-5 w-5 rounded-full border-[3px] border-white bg-blue-600 shadow-[0_0_0_3px_rgba(37,99,235,0.3)]';
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      onSelectRef.current();
    });
    const marker = new Marker({ element });
    markerRef.current = marker;
    addedRef.current = false;
    onMarker?.(marker);

    return () => {
      marker.remove();
      markerRef.current = null;
      addedRef.current = false;
      onMarker?.(null);
      map.off('load', onLoad);
    };
    // onMarker est stable (setter d'état) dans App.
  }, [map, onMarker]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !fix) return;
    marker.setLngLat([fix.longitude, fix.latitude]);
    // N'attache le marqueur à la carte qu'une fois : addTo() répété est inutile et recrée du travail à chaque fix.
    if (!addedRef.current) {
      marker.addTo(map);
      addedRef.current = true;
    }
    marker.getElement().style.opacity = stale ? '0.4' : '1';
    // La couche a pu ne pas être prête au montage (style pas encore chargé, 'load' raté) : on retente ici,
    // à chaque fix, tant que la source manque, pour ne jamais rester bloqué silencieusement.
    if (!map.getSource(SOURCE_ID) && map.isStyleLoaded()) ensureLayers(map);
    const source = map.getSource<GeoJSONSource>(SOURCE_ID);
    if (!source) return;
    source.setData(
      fix.accuracy === null
        ? EMPTY
        : { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: circlePolygon(fix, fix.accuracy) } },
    );
    if (map.getLayer('position-accuracy-fill')) {
      map.setPaintProperty('position-accuracy-fill', 'fill-opacity', stale ? 0.06 : 0.12);
      map.setPaintProperty('position-accuracy-line', 'line-opacity', stale ? 0.25 : 0.5);
    }
  }, [map, fix, stale]);

  return null;
}
