import { BottomSheet } from './BottomSheet';
import type { LocationFix } from '../bridge/bridge';
import { formatCoords } from '../geo/geo';

type Props = {
  fix: LocationFix;
  onCreateWaypoint: () => void;
  onClose: () => void;
};

export function PositionSheet({ fix, onCreateWaypoint, onClose }: Props) {
  return (
    <BottomSheet title="Ma position" onClose={onClose}>
      <p className="text-sm text-gray-500">{formatCoords(fix)}</p>
      <p className="mb-3 text-sm text-gray-500">Précision : {fix.accuracy === null ? 'inconnue' : `± ${Math.round(fix.accuracy)} m`}</p>
      <button type="button" onClick={onCreateWaypoint} className="w-full rounded-lg bg-emerald-700 py-3 font-medium text-white">
        Créer un waypoint ici
      </button>
    </BottomSheet>
  );
}
