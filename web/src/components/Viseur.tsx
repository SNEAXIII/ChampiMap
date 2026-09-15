import type { ViseurState } from '../map/useLongPressViseur';
import { formatCoords } from '../geo/geo';

export function Viseur({ viseur }: { viseur: NonNullable<ViseurState> }) {
  return (
    <div className="pointer-events-none absolute z-20" style={{ left: viseur.x, top: viseur.y }}>
      <div className="absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-red-600 bg-white/20">
        <div className="absolute top-1/2 left-1/2 h-0.5 w-7 -translate-x-1/2 -translate-y-1/2 bg-red-600" />
        <div className="absolute top-1/2 left-1/2 h-7 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-red-600" />
      </div>
      <div className="absolute top-7 -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 text-xs whitespace-nowrap text-white">
        {formatCoords({ latitude: viseur.lngLat.lat, longitude: viseur.lngLat.lng })}
      </div>
    </div>
  );
}
