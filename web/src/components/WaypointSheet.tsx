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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  return (
    <BottomSheet title={waypoint.name} onClose={onClose}>
      <p className="mb-3 text-sm text-gray-500">{formatCoords(waypoint)}</p>
      {renaming ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            setBusy(true);
            setError(false);
            try {
              await renameWaypoint(waypoint.id, trimmed);
              setRenaming(false);
              setBusy(false);
            } catch (err) {
              console.error('Renommage du waypoint impossible', err);
              setError(true);
              setBusy(false);
            }
          }}
        >
          <div className="flex gap-2">
            <input
              aria-label="Nouveau nom"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base"
            />
            <button type="submit" disabled={busy} className="rounded-lg bg-emerald-700 px-4 font-medium text-white disabled:opacity-60">
              OK
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">Enregistrement impossible sur l'appareil.</p>}
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button type="button" onClick={() => setRenaming(true)} className="flex-1 rounded-lg bg-gray-100 py-3 font-medium">
              Renommer
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                setBusy(true);
                setError(false);
                try {
                  await deleteWaypoint(waypoint.id);
                  onClose();
                } catch (err) {
                  console.error('Suppression du waypoint impossible', err);
                  setError(true);
                  setBusy(false);
                }
              }}
              className={`flex-1 rounded-lg py-3 font-medium disabled:opacity-60 ${confirmDelete ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'}`}
            >
              {confirmDelete ? 'Confirmer' : 'Supprimer'}
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">Enregistrement impossible sur l'appareil.</p>}
        </div>
      )}
    </BottomSheet>
  );
}
