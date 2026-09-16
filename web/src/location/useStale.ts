import { useEffect, useState } from 'react';
import type { LocationFix } from '../bridge/bridge';
import { isStale } from './useLocation';

// Réévalue l'ancienneté périodiquement : fix.time ne change pas tout seul, il faut re-render pour la détecter
// même si aucun nouveau fix n'arrive (App peut sinon rester sans re-render pendant plusieurs minutes).
const STALE_CHECK_INTERVAL_MS = 10_000;

/** Périmé au sens de `isStale`, réévalué toutes les 10 s indépendamment des re-renders déclenchés ailleurs. */
export function useStale(fix: LocationFix | null, running: boolean): boolean {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => forceTick((tick) => tick + 1), STALE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);
  return isStale(fix, running);
}
