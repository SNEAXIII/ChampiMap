import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { formatCoords, formatDistance } from '../geo/geo';
import { deleteWaypoint, editWaypoint, type Waypoint } from '../waypoints/waypointStore';
import { IconPicker } from './IconPicker';
import { WaypointGlyph } from './WaypointGlyph';

type Props = {
  waypoint: Waypoint;
  distance: number | null;
  isTarget: boolean;
  /** Point voiture le plus récent : badge « Dernière voiture ». */
  isLatestCar: boolean;
  onToggleTarget: () => void;
  onClose: () => void;
};

export function WaypointSheet({ waypoint, distance, isTarget, isLatestCar, onToggleTarget, onClose }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(waypoint.name);
  const [icon, setIcon] = useState(waypoint.icon);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  return (
    <BottomSheet title={waypoint.name} onClose={onClose}>
      <div className="mb-3 flex items-center gap-3">
        <WaypointGlyph icon={waypoint.icon} size={40} />
        <div className="min-w-0">
          {isLatestCar && <p className="mb-0.5 inline-block rounded bg-blue-700 px-1.5 text-xs font-semibold text-white">Dernière voiture</p>}
          <p className="text-sm text-gray-500">{formatCoords(waypoint)}</p>
          <p className="text-sm text-gray-500">{distance === null ? 'Distance inconnue' : `À ${formatDistance(distance)}`}</p>
        </div>
      </div>
      {editing ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            setBusy(true);
            setError(false);
            try {
              await editWaypoint(waypoint.id, trimmed, icon);
              setEditing(false);
              setBusy(false);
            } catch (err) {
              console.error('Modification du point impossible', err);
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
          <IconPicker value={icon} onChange={setIcon} />
          {error && <p role="alert" className="text-sm text-red-600">Enregistrement impossible sur l'appareil.</p>}
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onToggleTarget}
              className={`flex-1 rounded-lg py-3 font-medium ${isTarget ? 'bg-gray-100' : 'bg-emerald-700 text-white'}`}
            >
              {isTarget ? 'Ne plus cibler' : 'Cibler'}
            </button>
            <button type="button" onClick={() => setEditing(true)} className="flex-1 rounded-lg bg-gray-100 py-3 font-medium">
              Modifier
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
                  console.error('Suppression du point impossible', err);
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
