import { useCallback, useEffect, useState } from 'react';
import { callNative, onNative, type LocationFix } from '../bridge/bridge';

export type LocationState = {
  fix: LocationFix | null;
  satellites: number | null;
  running: boolean;
  permissionDenied: boolean;
  start: () => void;
};

// Une position plus vieille que ce seuil est considérée périmée (pas de nouveau fix depuis trop longtemps).
export const STALE_MS = 60_000;

/** Fix périmé : soit trop vieux, soit le GPS est arrêté (dernier fix connu mais plus suivi). */
export function isStale(fix: LocationFix | null, running: boolean): boolean {
  return fix !== null && (!running || Date.now() - fix.time > STALE_MS);
}

/** Position GPS fournie par Android (ou par le navigateur du PC). Démarre le GPS au montage. */
export function useLocation(): LocationState {
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [satellites, setSatellites] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const start = useCallback(() => {
    callNative('startLocation', {}).catch(console.warn);
  }, []);

  useEffect(() => {
    const unsubscribers = [
      onNative('location', setFix),
      onNative('satellites', ({ count }) => setSatellites(count)),
      onNative('locationState', (state) => {
        setRunning(state.running);
        setPermissionDenied(state.permissionDenied);
      }),
    ];
    start();
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [start]);

  return { fix, satellites, running, permissionDenied, start };
}
