import { useEffect, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LocationFix } from '../bridge/bridge';
import { bearingDegrees } from '../geo/geo';
import type { Waypoint } from '../waypoints/waypointStore';

type Props = {
  map: MapLibreMap;
  fix: LocationFix;
  target: Waypoint;
  stale: boolean;
};

const ORBIT_RADIUS_PX = 40;

/** Flèche en orbite autour de la position, pointant vers la cible (même hors écran). Atténuée si le fix est périmé, comme le point de position. */
export function TargetArrow({ map, fix, target, stale }: Props) {
  const [, redraw] = useState(0);

  useEffect(() => {
    const update = () => redraw((n) => n + 1);
    map.on('move', update);
    return () => {
      map.off('move', update);
    };
  }, [map]);

  const point = map.project([fix.longitude, fix.latitude]);
  // Angle à l'écran = relèvement (nord vrai) corrigé de la rotation de la carte.
  const screenAngle = bearingDegrees(fix, target) - map.getBearing();

  return (
    <div className="pointer-events-none absolute z-10" style={{ left: point.x, top: point.y, opacity: stale ? 0.4 : 1 }}>
      <div style={{ transform: `rotate(${screenAngle}deg)` }}>
        <div
          className="absolute h-0 w-0 -translate-x-1/2 -translate-y-1/2 border-x-[10px] border-b-[20px] border-x-transparent border-b-emerald-600 drop-shadow"
          style={{ top: -ORBIT_RADIUS_PX }}
        />
      </div>
    </div>
  );
}
