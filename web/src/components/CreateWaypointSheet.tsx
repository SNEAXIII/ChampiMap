import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { formatCoords, type LatLon } from '../geo/geo';

type Props = {
  position: LatLon;
  defaultName: string;
  onCreate: (name: string) => void;
  onCancel: () => void;
};

export function CreateWaypointSheet({ position, defaultName, onCreate, onCancel }: Props) {
  const [name, setName] = useState(defaultName);

  return (
    <BottomSheet title="Nouveau waypoint" onClose={onCancel}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(name.trim() || defaultName);
        }}
      >
        <input
          aria-label="Nom du waypoint"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-base"
        />
        <p className="text-sm text-gray-500">{formatCoords(position)}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-lg bg-gray-100 py-3 font-medium">
            Annuler
          </button>
          <button type="submit" className="flex-1 rounded-lg bg-emerald-700 py-3 font-medium text-white">
            Créer
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
