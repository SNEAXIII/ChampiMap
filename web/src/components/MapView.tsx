import { useEffect, useRef } from 'react';
import { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ignStyle, START_CENTER, START_ZOOM } from '../map/ign';

type Props = {
  onMapReady: (map: MapLibreMap) => void;
};

export function MapView({ onMapReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const map = new MapLibreMap({
      container,
      style: ignStyle,
      center: START_CENTER,
      zoom: START_ZOOM,
      maxZoom: 20,
      // Carte raster vue de dessus : l'inclinaison ne sert à rien et charge des chunks lointains.
      maxPitch: 0,
      attributionControl: { compact: true },
    });
    // Mention IGN minime : repliée dès le départ.
    map.once('load', () => {
      const attribution = container.querySelector('.maplibregl-ctrl-attrib');
      attribution?.classList.remove('maplibregl-compact-show');
      attribution?.removeAttribute('open');
    });
    onMapReady(map);
    // StrictMode monte l'effet deux fois en dev : on détruit proprement la carte.
    return () => map.remove();
  }, [onMapReady]);

  return <div ref={containerRef} className="h-full w-full" />;
}
