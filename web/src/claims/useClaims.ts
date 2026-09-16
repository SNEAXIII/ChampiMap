import { useEffect, useRef, useState } from 'react';
import { callNative, onNative, type Claim, type ClaimProgress } from '../bridge/bridge';

/** Zones hors ligne et progression des téléchargements, tenues à jour par les événements Kotlin. */
export function useClaims(): { claims: Claim[]; progress: Record<string, ClaimProgress> } {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [progress, setProgress] = useState<Record<string, ClaimProgress>>({});
  // Numéro de la dernière requête lancée : une réponse plus ancienne arrivée en retard (ex. deux refresh()
  // rapprochés) est ignorée pour ne pas écraser un état plus récent avec une liste obsolète.
  const latestRequest = useRef(0);

  useEffect(() => {
    const refresh = () => {
      const requestId = ++latestRequest.current;
      void callNative('listClaims', {})
        .then((list) => {
          if (requestId === latestRequest.current) setClaims(list);
        })
        .catch(console.warn);
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
