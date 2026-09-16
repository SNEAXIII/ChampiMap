import { useEffect, useState } from 'react';
import { isStale, type LocationState } from '../location/useLocation';

// Réévalue l'ancienneté périodiquement : fix.time ne change pas tout seul, il faut re-render pour l'afficher.
const STALE_CHECK_INTERVAL_MS = 10_000;

export function GpsBadge({ location }: { location: LocationState }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => forceTick((tick) => tick + 1), STALE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const fix = location.fix;
  const stale = isStale(fix, location.running);

  let text: string;
  if (location.permissionDenied) text = 'Position refusée · touche ◎';
  else if (stale && fix) text = `Position d'il y a ${Math.round((Date.now() - fix.time) / 60_000)} min`;
  else if (!location.running) text = 'GPS arrêté · touche ◎';
  else if (!fix) text = 'Recherche GPS…';
  else {
    const accuracy = fix.accuracy === null ? '± ?' : `± ${Math.round(fix.accuracy)} m`;
    text = location.satellites === null ? accuracy : `${accuracy} · ${location.satellites} sat.`;
  }
  return (
    <div className="pointer-events-none absolute top-2 left-2 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-700 shadow">
      {text}
    </div>
  );
}
