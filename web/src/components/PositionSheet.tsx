import { useState } from 'react';
import { LuCarFront, LuEraser, LuMapPinPlus } from 'react-icons/lu';
import { BottomSheet } from './BottomSheet';
import type { LocationFix } from '../bridge/bridge';
import { formatCoords } from '../geo/geo';

type Props = {
  fix: LocationFix;
  onCreateWaypoint: () => void;
  onParkHere: () => Promise<void>;
  /** Nombre de points du parcours enregistré. */
  trackLength: number;
  onClearTrack: () => Promise<void>;
  onClose: () => void;
};

export function PositionSheet({ fix, onCreateWaypoint, onParkHere, trackLength, onClearTrack, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
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
      <div className="mt-4 border-t border-gray-200 pt-3">
        <p className="text-sm text-gray-500">
          {trackLength === 0
            ? 'Parcours : les points violets apparaîtront derrière vous en marchant.'
            : `Parcours : ${trackLength} point${trackLength > 1 ? 's' : ''} (le plus gros est le départ). Effacé tout seul après 6 h sans marcher.`}
        </p>
        {trackLength > 0 && (
          <button
            type="button"
            onClick={async () => {
              if (!confirmClear) {
                setConfirmClear(true);
                return;
              }
              try {
                await onClearTrack();
              } catch (err) {
                console.warn(err);
              }
              setConfirmClear(false);
            }}
            className={`mt-2 flex w-full items-center justify-center gap-2 rounded-lg py-3 font-medium ${confirmClear ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'}`}
          >
            <LuEraser size={20} aria-hidden />
            {confirmClear ? 'Confirmer : effacer le parcours' : 'Effacer le parcours'}
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
