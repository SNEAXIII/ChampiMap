import { useEffect, useRef, useState } from 'react';
import type { LngLat, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';

const HOLD_MS = 500;
const MOVE_TOLERANCE_PX = 10;
const VISEUR_OFFSET_PX = 60;
const TOUCH_CONTEXTMENU_GUARD_MS = 1500;

export type ViseurState = { x: number; y: number; lngLat: LngLat } | null;

/**
 * Appui long sur la carte : un viseur apparaît au-dessus du doigt et suit ses mouvements,
 * la carte ne glisse plus. Relâcher appelle `onRelease` avec la position du viseur.
 * Sur PC, le clic droit fait la même chose.
 */
export function useLongPressViseur(map: MapLibreMap | null, onRelease: (lngLat: LngLat) => void): ViseurState {
  const [viseur, setViseur] = useState<ViseurState>(null);
  const onReleaseRef = useRef(onRelease);

  useEffect(() => {
    onReleaseRef.current = onRelease;
  });

  useEffect(() => {
    if (!map) return;
    const container = map.getCanvasContainer();
    let timer: number | undefined;
    let start: { x: number; y: number } | null = null;
    let active = false;
    let current: ViseurState = null;
    let lastTouchAt = 0;

    const toLocal = (touch: Touch) => {
      const rect = container.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };

    const place = (point: { x: number; y: number }) => {
      const y = point.y - VISEUR_OFFSET_PX;
      current = { x: point.x, y, lngLat: map.unproject([point.x, y]) };
      setViseur(current);
    };

    const reset = () => {
      window.clearTimeout(timer);
      start = null;
      if (active) {
        active = false;
        map.dragPan.enable();
        map.touchZoomRotate.enable();
      }
      current = null;
      setViseur(null);
    };

    const onTouchStart = (event: TouchEvent) => {
      lastTouchAt = Date.now();
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      start = toLocal(event.touches[0]);
      timer = window.setTimeout(() => {
        if (!start) return;
        active = true;
        map.dragPan.disable();
        map.touchZoomRotate.disable();
        navigator.vibrate?.(30);
        place(start);
      }, HOLD_MS);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!start) return;
      const point = toLocal(event.touches[0]);
      if (active) {
        event.preventDefault();
        place(point);
      } else if (Math.hypot(point.x - start.x, point.y - start.y) > MOVE_TOLERANCE_PX) {
        reset();
      }
    };

    const onTouchEnd = () => {
      const picked = active ? current : null;
      reset();
      if (picked) onReleaseRef.current(picked.lngLat);
    };

    // Clic droit sur PC. Sur Android, un appui long déclenche aussi `contextmenu` : on l'ignore.
    const onContextMenu = (event: MapMouseEvent) => {
      if (Date.now() - lastTouchAt < TOUCH_CONTEXTMENU_GUARD_MS) return;
      onReleaseRef.current(event.lngLat);
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', reset);
    map.on('contextmenu', onContextMenu);

    return () => {
      reset();
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', reset);
      map.off('contextmenu', onContextMenu);
    };
  }, [map]);

  return viseur;
}
