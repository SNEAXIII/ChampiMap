import { useEffect, useRef, useState } from 'react';
import type { LocationFix } from '../bridge/bridge';
import { walkingHeading } from '../geo/geo';

// Positions gardées pour calculer la direction : au-delà, un vieux point ne dit plus rien du trajet actuel.
const HISTORY_MS = 60_000;

/** Direction de marche déduite des dernières positions GPS. Garde la dernière connue à l'arrêt (null au départ). */
export function useHeading(fix: LocationFix | null): number | null {
  const history = useRef<LocationFix[]>([]);
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (!fix) return;
    history.current = [...history.current.filter((old) => fix.time - old.time <= HISTORY_MS), fix];
    const next = walkingHeading(history.current);
    if (next !== null) setHeading(next);
  }, [fix]);
  return heading;
}
