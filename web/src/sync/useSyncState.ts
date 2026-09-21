import { useSyncExternalStore } from 'react';
import { getSyncState, subscribeSyncState, type SyncState } from './sync';

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSyncState, getSyncState);
}
