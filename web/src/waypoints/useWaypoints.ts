import { useSyncExternalStore } from 'react';
import { getVisibleWaypoints, subscribeWaypoints, type Waypoint } from './waypointStore';

/** Waypoints non supprimés, mis à jour à chaque modification. */
export function useWaypoints(): Waypoint[] {
  return useSyncExternalStore(subscribeWaypoints, getVisibleWaypoints);
}
