import { useEffect, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { LuNavigation2 } from 'react-icons/lu';

type Props = {
  map: MapLibreMap;
  hidden: boolean;
};

/** Visible quand la carte est tournée : un tap remet le nord en haut. */
export function NorthButton({ map, hidden }: Props) {
  const [bearing, setBearing] = useState(map.getBearing());

  useEffect(() => {
    const update = () => setBearing(map.getBearing());
    map.on('rotate', update);
    return () => {
      map.off('rotate', update);
    };
  }, [map]);

  if (hidden || Math.abs(bearing) < 1) return null;
  return (
    <button
      type="button"
      onClick={() => map.easeTo({ bearing: 0 })}
      aria-label="Remettre le nord en haut"
      className="absolute right-3 bottom-20 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-lg"
    >
      <span className="block text-red-600" style={{ transform: `rotate(${-bearing}deg)` }}>
        <LuNavigation2 size={22} fill="currentColor" aria-hidden />
      </span>
    </button>
  );
}
