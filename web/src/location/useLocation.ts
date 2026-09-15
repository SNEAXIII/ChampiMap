import { useCallback, useEffect, useState } from 'react';
import { callNative, onNative, type LocationFix } from '../bridge/bridge';

export type LocationState = {
  fix: LocationFix | null;
  satellites: number | null;
  running: boolean;
  permissionDenied: boolean;
  start: () => void;
};

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
