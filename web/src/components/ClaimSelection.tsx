import { useEffect, useMemo, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { callNative, isAndroid, type StorageStats } from '../bridge/bridge';
import { formatBytes } from '../format/formatBytes';
import {
  estimateBytes,
  GLOBAL_WARNING_BYTES,
  rectFromRegions,
  rectRing,
  regionAt,
  regionCount,
  regionsInView,
  type RegionRect,
} from '../claims/regions';

type Props = {
  map: MapLibreMap;
  onDone: () => void;
};

const GRID_SOURCE = 'selection-grid';
const RECT_SOURCE = 'selection-rect';
const GRID_MIN_ZOOM = 9;
const EMPTY = { type: 'FeatureCollection', features: [] } as const;

function defaultClaimName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Zone du ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

/** Mode sélection : grille de cases, un doigt (ou la souris sur PC) trace le rectangle. */
export function ClaimSelection({ map, onDone }: Props) {
  const [rect, setRect] = useState<RegionRect | null>(null);
  const [averages, setAverages] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(defaultClaimName);

  useEffect(() => {
    void callNative('getChunkSizeAverages', {}).then(setAverages);
    void callNative('getStorageStats', {}).then(setStats);
  }, []);

  // Gestes : sur Android, un doigt ne déplace plus la carte (deux doigts oui). Sur PC, la souris dessine.
  useEffect(() => {
    if (isAndroid) map.cooperativeGestures.enable();
    else map.dragPan.disable();
    map.boxZoom.disable();
    return () => {
      map.cooperativeGestures.disable();
      map.dragPan.enable();
      map.boxZoom.enable();
    };
  }, [map]);

  // Couches grille + rectangle.
  useEffect(() => {
    map.addSource(GRID_SOURCE, { type: 'geojson', data: EMPTY });
    map.addSource(RECT_SOURCE, { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'selection-grid', type: 'line', source: GRID_SOURCE, paint: { 'line-color': '#1f2937', 'line-width': 0.6, 'line-opacity': 0.5 } });
    map.addLayer({ id: 'selection-rect-fill', type: 'fill', source: RECT_SOURCE, paint: { 'fill-color': '#059669', 'fill-opacity': 0.25 } });
    map.addLayer({ id: 'selection-rect-line', type: 'line', source: RECT_SOURCE, paint: { 'line-color': '#047857', 'line-width': 2 } });

    const drawGrid = () => {
      const source = map.getSource(GRID_SOURCE) as GeoJSONSource | undefined;
      if (!source) return;
      if (map.getZoom() < GRID_MIN_ZOOM) {
        source.setData(EMPTY);
        return;
      }
      const view = regionsInView(map.getBounds());
      const lines: number[][][] = [];
      for (let x = view.xMin; x <= view.xMax + 1; x++) {
        const ring = rectRing({ xMin: x, yMin: view.yMin, xMax: x, yMax: view.yMax })[0];
        lines.push([ring[0], ring[3]]);
      }
      for (let y = view.yMin; y <= view.yMax + 1; y++) {
        const ring = rectRing({ xMin: view.xMin, yMin: y, xMax: view.xMax, yMax: y })[0];
        lines.push([ring[0], ring[1]]);
      }
      source.setData({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } });
    };
    drawGrid();
    map.on('moveend', drawGrid);

    return () => {
      map.off('moveend', drawGrid);
      for (const layer of ['selection-grid', 'selection-rect-fill', 'selection-rect-line']) if (map.getLayer(layer)) map.removeLayer(layer);
      for (const source of [GRID_SOURCE, RECT_SOURCE]) if (map.getSource(source)) map.removeSource(source);
    };
  }, [map]);

  // Dessin : ancre au premier contact, coin opposé en suivant le doigt ou la souris.
  useEffect(() => {
    const container = map.getCanvasContainer();
    let anchor: { x: number; y: number } | null = null;
    // Un doigt qui n'a jamais bougé (tap) sélectionne sa case ; un deuxième doigt (pincer/déplacer) annule
    // l'ancre sans toucher au rectangle déjà tracé, sinon son touchstart (touches.length passe à 1 avant que
    // le deuxième doigt ne soit vu) effacerait le rectangle en cours.
    let touchDragged = false;

    const regionUnder = (clientX: number, clientY: number) => {
      const box = container.getBoundingClientRect();
      const lngLat = map.unproject([clientX - box.left, clientY - box.top]);
      return regionAt(lngLat.lng, lngLat.lat);
    };
    const start = (clientX: number, clientY: number) => {
      anchor = regionUnder(clientX, clientY);
      setRect(rectFromRegions(anchor, anchor));
    };
    const extend = (clientX: number, clientY: number) => {
      if (anchor) setRect(rectFromRegions(anchor, regionUnder(clientX, clientY)));
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 1) {
        anchor = regionUnder(event.touches[0].clientX, event.touches[0].clientY);
        touchDragged = false;
      } else {
        // Deuxième doigt : on ne dessine plus au doigt levé, le rectangle existant est laissé tel quel.
        anchor = null;
      }
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 1 && anchor) {
        touchDragged = true;
        extend(event.touches[0].clientX, event.touches[0].clientY);
      }
    };
    const onTouchEnd = (event: TouchEvent) => {
      // Tap (pas de glissé, pas de deuxième doigt) : sélectionne la case sous le doigt.
      if (anchor && !touchDragged) setRect(rectFromRegions(anchor, anchor));
      if (event.touches.length === 0) {
        anchor = null;
        touchDragged = false;
      }
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 0) start(event.clientX, event.clientY);
    };
    const onMouseMove = (event: MouseEvent) => {
      if (event.buttons & 1) extend(event.clientX, event.clientY);
    };
    const onMouseUp = () => {
      anchor = null;
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: true });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [map]);

  useEffect(() => {
    const source = map.getSource(RECT_SOURCE) as GeoJSONSource | undefined;
    source?.setData(rect ? { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rectRing(rect) } } : EMPTY);
  }, [map, rect]);

  const estimate = useMemo(() => (rect ? estimateBytes(rect, averages) : 0), [rect, averages]);
  const projectedTotal = stats ? stats.cacheBytes + stats.claimBytes + estimate : 0;

  const confirm = async () => {
    if (!rect) return;
    await callNative('createClaim', { id: crypto.randomUUID(), name: name.trim() || defaultClaimName(), ...rect });
    onDone();
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-2xl bg-white p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.2)]">
      {naming ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <h2 className="text-lg font-semibold">Nom de la zone</h2>
          <input aria-label="Nom de la zone" value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-base" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setNaming(false)} className="flex-1 rounded-lg bg-gray-100 py-3 font-medium">
              Retour
            </button>
            <button type="submit" className="flex-1 rounded-lg bg-emerald-700 py-3 font-medium text-white">
              Télécharger
            </button>
          </div>
        </form>
      ) : (
        <>
          <h2 className="text-lg font-semibold">Nouvelle zone hors ligne</h2>
          <p className="mt-1 text-sm text-gray-600">
            {rect
              ? `${regionCount(rect)} case${regionCount(rect) > 1 ? 's' : ''} · ≈ ${formatBytes(estimate)}`
              : isAndroid
                ? 'Trace un rectangle avec un doigt. Deux doigts pour déplacer la carte.'
                : 'Trace un rectangle à la souris. Molette pour zoomer.'}
          </p>
          {rect && projectedTotal > GLOBAL_WARNING_BYTES && (
            <p className="mt-2 rounded-lg bg-amber-100 p-2 text-sm font-medium text-amber-900">
              ⚠️ L'app occupera ≈ {formatBytes(projectedTotal)} (plus de 1 Go). Les cartes vues récemment seront réduites d'autant.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={onDone} className="flex-1 rounded-lg bg-gray-100 py-3 font-medium">
              Annuler
            </button>
            <button type="button" disabled={!rect} onClick={() => setNaming(true)} className="flex-1 rounded-lg bg-emerald-700 py-3 font-medium text-white disabled:opacity-40">
              Télécharger
            </button>
          </div>
        </>
      )}
    </div>
  );
}
