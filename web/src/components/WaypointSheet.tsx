import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { formatCoords } from '../geo/geo';
import { deleteWaypoint, renameWaypoint, type Waypoint } from '../waypoints/waypointStore';

type Props = {
  waypoint: Waypoint;
  onClose: () => void;
};

export function WaypointSheet({ waypoint, onClose }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(waypoint.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <BottomSheet title={waypoint.name} onClose={onClose}>
      <p className="mb-3 text-sm text-gray-500">{formatCoords(waypoint)}</p>
      {renaming ? (
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (trimmed) await renameWaypoint(waypoint.id, trimmed);
            setRenaming(false);
          }}
        >
          <input
            aria-label="Nouveau nom"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base"
          />
          <button type="submit" className="rounded-lg bg-emerald-700 px-4 font-medium text-white">
            OK
          </button>
        </form>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={() => setRenaming(true)} className="flex-1 rounded-lg bg-gray-100 py-3 font-medium">
            Renommer
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              await deleteWaypoint(waypoint.id);
              onClose();
            }}
            className={`flex-1 rounded-lg py-3 font-medium ${confirmDelete ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'}`}
          >
            {confirmDelete ? 'Confirmer' : 'Supprimer'}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
