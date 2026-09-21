import { useCallback, useState } from 'react';

const STORAGE_KEY = 'champi.targetId';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Identifiant du waypoint ciblé (au plus un), gardé entre deux lancements. */
export function useTarget(): [string | null, (id: string | null) => void] {
  const [targetId, setTargetIdState] = useState<string | null>(readStored);

  const setTargetId = useCallback((id: string | null) => {
    setTargetIdState(id);
    try {
      if (id === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Stockage indisponible : la cible reste en mémoire pour cette session.
    }
  }, []);

  return [targetId, setTargetId];
}
