import { formatDistance } from '../geo/geo';
import type { Waypoint } from '../waypoints/waypointStore';

type Props = {
  target: Waypoint;
  distance: number | null;
  onStop: () => void;
};

const ARRIVED_METERS = 10;

export function TargetBanner({ target, distance, onStop }: Props) {
  const arrived = distance !== null && distance < ARRIVED_METERS;
  return (
    <div className={`absolute bottom-12 left-3 z-10 flex max-w-[70%] items-center gap-2 rounded-full py-2 pr-2 pl-4 shadow-lg ${arrived ? 'bg-emerald-600 text-white' : 'bg-white'}`}>
      <span className="min-w-0 truncate text-sm font-medium">
        {arrived ? `✅ Arrivé · ${target.name}` : `🎯 ${target.name} · ${distance === null ? '…' : formatDistance(distance)}`}
      </span>
      <button type="button" onClick={onStop} aria-label="Arrêter de cibler" className={`rounded-full px-2 text-lg ${arrived ? 'text-white' : 'text-gray-500'}`}>
        ✕
      </button>
    </div>
  );
}
