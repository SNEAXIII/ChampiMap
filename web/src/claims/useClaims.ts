import { useEffect, useState } from 'react';
import { callNative, onNative, type Claim, type ClaimProgress } from '../bridge/bridge';

/** Zones hors ligne et progression des téléchargements, tenues à jour par les événements Kotlin. */
export function useClaims(): { claims: Claim[]; progress: Record<string, ClaimProgress> } {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [progress, setProgress] = useState<Record<string, ClaimProgress>>({});

  useEffect(() => {
    const refresh = () => {
      void callNative('listClaims', {}).then(setClaims);
    };
    refresh();
    const unsubscribers = [
      onNative('claimsChanged', () => {
        refresh();
        setProgress({});
      }),
      onNative('claimProgress', (update) => setProgress((current) => ({ ...current, [update.claimId]: update }))),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  return { claims, progress };
}
