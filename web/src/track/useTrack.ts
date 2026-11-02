import { useCallback, useEffect, useState } from 'react';
import { callNative, onNative, type TrackPoint } from '../bridge/bridge';

export type TrackState = {
  points: TrackPoint[];
  clear: () => Promise<void>;
};

/** Parcours enregistré par Kotlin (y compris app en arrière-plan), tenu à jour point par point. */
export function useTrack(): TrackState {
  const [points, setPoints] = useState<TrackPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    const reload = () =>
      callNative('getTrack', {})
        .then((track) => {
          if (!cancelled) setPoints(track);
        })
        .catch(console.warn);
    const unsubscribers = [
      onNative('trackPoint', (point) => setPoints((current) => [...current, point])),
      onNative('trackChanged', reload),
    ];
    reload();
    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const clear = useCallback(async () => {
    await callNative('clearTrack', {});
    setPoints([]);
  }, []);

  return { points, clear };
}
