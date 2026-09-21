import { useMemo, useState } from 'react';
import { distanceMeters, formatDistance, type LatLon } from '../geo/geo';
import type { Waypoint } from '../waypoints/waypointStore';

type Props = {
  waypoints: Waypoint[];
  reference: LatLon;
  onPick: (waypoint: Waypoint) => void;
  onClose: () => void;
};

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function WaypointList({ waypoints, reference, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const needle = normalize(query.trim());
    return waypoints
      .filter((waypoint) => normalize(waypoint.name).includes(needle))
      .map((waypoint) => ({ waypoint, distance: distanceMeters(reference, waypoint) }))
      .sort((a, b) => a.distance - b.distance);
  }, [waypoints, reference, query]);

  return (
    <section className="absolute inset-0 z-30 flex flex-col bg-white">
      <header className="flex items-center gap-2 border-b border-gray-200 p-3">
        <input
          type="search"
          aria-label="Rechercher un point"
          placeholder="Rechercher un point"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base"
        />
        <button type="button" onClick={onClose} aria-label="Fermer" className="px-3 py-2 text-xl text-gray-500">
          ✕
        </button>
      </header>
      {rows.length === 0 ? (
        <p className="p-6 text-center text-gray-500">
          {waypoints.length === 0 ? 'Aucun point. Maintiens le doigt sur la carte pour en créer un.' : 'Aucun résultat.'}
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {rows.map(({ waypoint, distance }) => (
            <li key={waypoint.id}>
              <button
                type="button"
                onClick={() => onPick(waypoint)}
                className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{waypoint.name}</span>
                <span className="text-sm text-gray-500">{formatDistance(distance)}</span>
                <span aria-label={waypoint.dirty ? "Sur l'appareil" : 'Sauvegardé'}>{waypoint.dirty ? '📱' : '☁️'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
