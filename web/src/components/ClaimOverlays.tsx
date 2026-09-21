import { useEffect, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { callNative, type Claim } from '../bridge/bridge';
import { rectRing, regionCount, regionSquare, regionsInView } from '../claims/regions';
import { useOnline } from '../net/useOnline';

type Props = {
  map: MapLibreMap;
  claims: Claim[];
};

const CLAIMS_SOURCE = 'claims';
const OFFLINE_FOG_SOURCE = 'offline-fog';
const OFFLINE_FOG_MIN_ZOOM = 10;
const MAX_FOG_REGIONS = 1600;
const EMPTY = { type: 'FeatureCollection', features: [] } as const;

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
    // Des rafraîchissements successifs (moveend rapprochés) peuvent répondre dans le désordre :
    // seule la dernière requête lancée a le droit de repeindre le brouillard.
    let generation = 0;
    // moveend peut être rejoué très vite (la carte suit le cap en Suivi) : sans ce délai, chaque
    // interruption d'easeTo relancerait un appel natif + un recalcul du brouillard.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    // Dernier rafraîchissement déclenché : au-delà d'1 s sans repeindre, le debounce seul retarderait
    // indéfiniment le brouillard pendant qu'on marche en Suivi (moveend rejoué toutes les 100–150 ms).
    let lastRefreshAt = 0;
    const refresh = async () => {
      const current = ++generation;
      const view = regionsInView(map.getBounds());
      if (map.getZoom() < OFFLINE_FOG_MIN_ZOOM || regionCount(view) > MAX_FOG_REGIONS) {
        if (cancelled || current !== generation) return;
        fogSource()?.setData(EMPTY);
        return;
      }
      let available: Set<string>;
      try {
        available = new Set((await callNative('getAvailableRegions', view)).map(([x, y]) => `${x}:${y}`));
      } catch (error) {
        console.warn('getAvailableRegions a échoué, brouillard hors ligne inchangé', error);
        return;
      }
      if (cancelled || current !== generation) return;
      const covered = (x: number, y: number) =>
        available.has(`${x}:${y}`) ||
        claims.some((claim) => claim.status === 'complete' && x >= claim.xMin && x <= claim.xMax && y >= claim.yMin && y <= claim.yMax);
      const squares: number[][][][] = [];
      for (let x = view.xMin; x <= view.xMax; x++) {
        for (let y = view.yMin; y <= view.yMax; y++) if (!covered(x, y)) squares.push(regionSquare(x, y));
      }
      fogSource()?.setData({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: squares } });
    };
    const triggerRefresh = () => {
      lastRefreshAt = Date.now();
      void refresh();
    };
    const onMoveEnd = () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      if (Date.now() - lastRefreshAt >= 1000) {
        debounceTimer = null;
        triggerRefresh();
        return;
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        triggerRefresh();
      }, 300);
    };
    // Immédiat : premier calcul et bascule en ligne/hors ligne, seuls les moveend rapprochés sont différés.
    triggerRefresh();
    map.on('moveend', onMoveEnd);
    return () => {
      cancelled = true;
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      map.off('moveend', onMoveEnd);
    };
  }, [map, claims, online, ready]);

  return null;
}
