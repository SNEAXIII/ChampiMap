import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import { waypointIcon } from '../waypoints/icons';
import { latestCarId, type Waypoint } from '../waypoints/waypointStore';

type Props = {
  map: MapLibreMap;
  waypoints: Waypoint[];
  onSelect: (id: string) => void;
};

type Entry = { element: HTMLButtonElement; marker: Marker | null };

/** Goutte de la couleur de l'icône, pointe en bas (ancre du marqueur), icône blanche dedans. */
function Pin({ waypoint, highlighted }: { waypoint: Waypoint; highlighted: boolean }) {
  const { Icon, color } = waypointIcon(waypoint.icon);
  const side = highlighted ? 38 : 30; // côté du carré tourné de 45° qui forme la goutte
  const box = Math.round(side * Math.SQRT2);
  const offset = (box - side) / 2;
  return (
    <>
      <span className="relative block" style={{ width: box, height: box }}>
        <span
          className={`absolute flex items-center justify-center rounded-full rounded-br-none border-2 border-white shadow-md ${highlighted ? 'ring-4 ring-blue-400/60' : ''}`}
          style={{ left: offset, top: offset, width: side, height: side, backgroundColor: color, transform: 'rotate(45deg)' }}
        >
          {/* Goutte ≈ cercle intérieur de (side - 4) px (bordure 2 px) : le carré qui y tient fait ≈ 0,7 × ce diamètre. */}
          <Icon size={Math.floor((side - 4) * 0.68)} color="white" style={{ transform: 'rotate(-45deg)' }} aria-hidden />
        </span>
      </span>
      <span
        className={`absolute top-full left-1/2 max-w-32 -translate-x-1/2 truncate rounded px-1 text-xs font-medium shadow ${highlighted ? 'bg-blue-700 text-white' : 'bg-white/90'}`}
      >
        {waypoint.name}
      </span>
    </>
  );
}

/** Garde un marqueur MapLibre par waypoint visible ; le contenu est rendu par React dans l'élément du marqueur. */
export function WaypointMarkers({ map, waypoints, onSelect }: Props) {
  const entries = useRef(new Map<string, Entry>());
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  // Élément DOM de chaque marqueur, créé au rendu (idempotent) pour pouvoir y rendre un portail tout de suite.
  const elementOf = (id: string): HTMLButtonElement => {
    let entry = entries.current.get(id);
    if (!entry) {
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'relative';
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        onSelectRef.current(id);
      });
      entry = { element, marker: null };
      entries.current.set(id, entry);
    }
    return entry.element;
  };

  useEffect(() => {
    const current = entries.current;
    const seen = new Set<string>();
    for (const waypoint of waypoints) {
      seen.add(waypoint.id);
      const entry = current.get(waypoint.id)!;
      entry.marker ??= new Marker({ element: entry.element, anchor: 'bottom' }).setLngLat([waypoint.longitude, waypoint.latitude]).addTo(map);
      entry.marker.setLngLat([waypoint.longitude, waypoint.latitude]);
    }
    for (const [id, entry] of current) {
      if (!seen.has(id)) {
        entry.marker?.remove();
        current.delete(id);
      }
    }
  }, [map, waypoints]);

  useEffect(() => {
    const current = entries.current;
    // Retire les marqueurs mais garde les éléments : les portails React y sont rendus et l'effet ci-dessus
    // recrée les marqueurs autour d'eux (remontage StrictMode, changement de carte).
    return () => {
      current.forEach((entry) => {
        entry.marker?.remove();
        entry.marker = null;
      });
    };
  }, [map]);

  const carId = latestCarId(waypoints);
  return waypoints.map((waypoint) =>
    createPortal(<Pin waypoint={waypoint} highlighted={waypoint.id === carId} />, elementOf(waypoint.id), waypoint.id),
  );
}
