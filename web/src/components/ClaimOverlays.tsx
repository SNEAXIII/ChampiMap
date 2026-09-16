import { useEffect, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { callNative, type Claim } from '../bridge/bridge';
import { rectRing, regionCount, regionSquare, regionsInView } from '../claims/regions';

type Props = {
  map: MapLibreMap;
  claims: Claim[];
};

const CLAIMS_SOURCE = 'claims';
const OFFLINE_FOG_SOURCE = 'offline-fog';
const OFFLINE_FOG_MIN_ZOOM = 10;
const MAX_FOG_REGIONS = 1600;
const EMPTY = { type: 'FeatureCollection', features: [] } as const;

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/**
 * Brouillard :
 * - voile gris sur les zones en cours de téléchargement ;
 * - contour discret autour des zones complètes ;
 * - sans réseau, voile sur les cases ni en zone ni en cache.
 */
export function ClaimOverlays({ map, claims }: Props) {
  const online = useOnline();
  // Les sources n'existent qu'après le chargement du style : les effets suivants attendent `ready`.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const addLayers = () => {
      setReady(true);
      if (map.getSource(CLAIMS_SOURCE)) return;
      map.addSource(CLAIMS_SOURCE, { type: 'geojson', data: EMPTY });
      map.addSource(OFFLINE_FOG_SOURCE, { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'offline-fog', type: 'fill', source: OFFLINE_FOG_SOURCE, paint: { 'fill-color': '#6b7280', 'fill-opacity': 0.35 } });
      map.addLayer({
        id: 'claims-downloading',
        type: 'fill',
        source: CLAIMS_SOURCE,
        filter: ['==', ['get', 'status'], 'downloading'],
        paint: { 'fill-color': '#6b7280', 'fill-opacity': 0.45 },
      });
      map.addLayer({
        id: 'claims-complete',
        type: 'line',
        source: CLAIMS_SOURCE,
        filter: ['==', ['get', 'status'], 'complete'],
        paint: { 'line-color': '#047857', 'line-width': 1.5, 'line-opacity': 0.6, 'line-dasharray': [3, 2] },
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
    const source = map.getSource(CLAIMS_SOURCE) as GeoJSONSource | undefined;
    source?.setData({
      type: 'FeatureCollection',
      features: claims.map((claim) => ({
        type: 'Feature',
        properties: { status: claim.status },
        geometry: { type: 'Polygon', coordinates: rectRing(claim) },
      })),
    });
  }, [map, claims, ready]);

  useEffect(() => {
    if (!ready) return;
    const fogSource = () => map.getSource(OFFLINE_FOG_SOURCE) as GeoJSONSource | undefined;
    if (online) {
      fogSource()?.setData(EMPTY);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const view = regionsInView(map.getBounds());
      if (map.getZoom() < OFFLINE_FOG_MIN_ZOOM || regionCount(view) > MAX_FOG_REGIONS) {
        fogSource()?.setData(EMPTY);
        return;
      }
      const available = new Set((await callNative('getAvailableRegions', view)).map(([x, y]) => `${x}:${y}`));
      if (cancelled) return;
      const covered = (x: number, y: number) =>
        available.has(`${x}:${y}`) ||
        claims.some((claim) => claim.status === 'complete' && x >= claim.xMin && x <= claim.xMax && y >= claim.yMin && y <= claim.yMax);
      const squares: number[][][][] = [];
      for (let x = view.xMin; x <= view.xMax; x++) {
        for (let y = view.yMin; y <= view.yMax; y++) if (!covered(x, y)) squares.push(regionSquare(x, y));
      }
      fogSource()?.setData({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: squares } });
    };
    void refresh();
    map.on('moveend', refresh);
    return () => {
      cancelled = true;
      map.off('moveend', refresh);
    };
  }, [map, claims, online, ready]);

  return null;
}
