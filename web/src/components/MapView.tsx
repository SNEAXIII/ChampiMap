import { useEffect, useRef } from 'react';
import { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ignStyle, START_CENTER, START_ZOOM } from '../map/ign';

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const map = new MapLibreMap({
      container: containerRef.current!,
      style: ignStyle,
      center: START_CENTER,
      zoom: START_ZOOM,
      maxZoom: 20,
      attributionControl: { compact: true },
    });
    // StrictMode monte l'effet deux fois en dev : on détruit proprement la carte.
    return () => map.remove();
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
