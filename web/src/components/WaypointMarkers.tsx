import { useEffect, useRef } from 'react';
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { Waypoint } from '../waypoints/waypointStore';

type Props = {
  map: MapLibreMap;
  waypoints: Waypoint[];
  onSelect: (id: string) => void;
};

type Entry = { marker: Marker; label: HTMLElement };

/** Garde un marqueur MapLibre par waypoint visible. */
export function WaypointMarkers({ map, waypoints, onSelect }: Props) {
  const entries = useRef(new Map<string, Entry>());
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const current = entries.current;
    const seen = new Set<string>();
    for (const waypoint of waypoints) {
      seen.add(waypoint.id);
      let entry = current.get(waypoint.id);
      if (!entry) {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'relative';
        element.innerHTML =
          '<span class="block text-3xl leading-none">📍</span>' +
          '<span data-label class="absolute top-full left-1/2 max-w-32 -translate-x-1/2 truncate rounded bg-white/90 px-1 text-xs font-medium shadow"></span>';
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          onSelectRef.current(waypoint.id);
        });
        const label = element.querySelector<HTMLElement>('[data-label]')!;
        const marker = new Marker({ element, anchor: 'bottom' }).setLngLat([waypoint.longitude, waypoint.latitude]).addTo(map);
        entry = { marker, label };
        current.set(waypoint.id, entry);
      }
      entry.label.textContent = waypoint.name;
      entry.marker.setLngLat([waypoint.longitude, waypoint.latitude]);
    }
    for (const [id, entry] of current) {
      if (!seen.has(id)) {
        entry.marker.remove();
        current.delete(id);
      }
    }
  }, [map, waypoints]);

  useEffect(() => {
    const current = entries.current;
    return () => {
      current.forEach((entry) => entry.marker.remove());
      current.clear();
    };
  }, [map]);

  return null;
}
