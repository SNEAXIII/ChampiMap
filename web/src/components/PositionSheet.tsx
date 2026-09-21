import { useState } from 'react';
import { LuCarFront, LuMapPinPlus } from 'react-icons/lu';
import { BottomSheet } from './BottomSheet';
import type { LocationFix } from '../bridge/bridge';
import { formatCoords } from '../geo/geo';

type Props = {
  fix: LocationFix;
  onCreateWaypoint: () => void;
  onParkHere: () => Promise<void>;
  onClose: () => void;
};

export function PositionSheet({ fix, onCreateWaypoint, onParkHere, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <BottomSheet title="Ma position" onClose={onClose}>
      <p className="text-sm text-gray-500">{formatCoords(fix)}</p>
      <p className="mb-3 text-sm text-gray-500">Précision : {fix.accuracy === null ? 'inconnue' : `± ${Math.round(fix.accuracy)} m`}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onCreateWaypoint} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 py-3 font-medium text-white">
          <LuMapPinPlus size={20} aria-hidden />
          Créer un point
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(false);
            try {
              await onParkHere();
            } catch (err) {
              console.error('Enregistrement de la voiture impossible', err);
              setError(true);
              setBusy(false);
            }
          }}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-700 py-3 font-medium text-white disabled:opacity-60"
        >
          <LuCarFront size={20} aria-hidden />
          Garé ici
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">Enregistrement impossible sur l'appareil.</p>}
    </BottomSheet>
  );
}
