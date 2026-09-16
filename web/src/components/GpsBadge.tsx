import type { LocationState } from '../location/useLocation';

type Props = {
  location: LocationState;
  // Calculé par App via useStale (tick toutes les 10 s) : App se re-rend donc régulièrement,
  // ce qui suffit aussi à rafraîchir le texte « il y a N min » ci-dessous sans tick local.
  stale: boolean;
};

export function GpsBadge({ location, stale }: Props) {
  const fix = location.fix;

  let text: string;
  if (location.permissionDenied) text = 'Position refusée · touche ◎';
  else if (!location.running) text = 'GPS arrêté · touche ◎';
  else if (stale && fix) text = `Position d'il y a ${Math.round((Date.now() - fix.time) / 60_000)} min`;
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
