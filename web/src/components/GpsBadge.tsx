import type { LocationState } from '../location/useLocation';

export function GpsBadge({ location }: { location: LocationState }) {
  let text: string;
  if (location.permissionDenied) text = 'Position refusée · touche ◎';
  else if (!location.running) text = 'GPS arrêté · touche ◎';
  else if (!location.fix) text = 'Recherche GPS…';
  else {
    const accuracy = location.fix.accuracy === null ? '± ?' : `± ${Math.round(location.fix.accuracy)} m`;
    text = location.satellites === null ? accuracy : `${accuracy} · ${location.satellites} sat.`;
  }
  return (
    <div className="pointer-events-none absolute top-2 left-2 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-700 shadow">
      {text}
    </div>
  );
}
