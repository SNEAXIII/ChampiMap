import { useEffect, useRef } from 'react';
import { AttributionControl, Map as MapLibreMap, ScaleControl, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { CHUNK_TILE_URL, createIgnStyle, PLAN_IGN_TILE_URL, START_CENTER, START_ZOOM } from '../map/ign';
import { isAndroid, onNative } from '../bridge/bridge';

// MapLibre 6 + bundler : sans ce worker, aucune source GeoJSON ne se charge (grille, brouillard, zones,
// précision GPS) ; seules les tuiles raster s'affichent. `?worker&url` embarque aussi maplibre-gl-shared.mjs.
setWorkerUrl(maplibreWorkerUrl);

type Props = {
  onMapReady: (map: MapLibreMap) => void;
};

export function MapView({ onMapReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const map = new MapLibreMap({
      container,
      style: createIgnStyle(isAndroid ? CHUNK_TILE_URL : PLAN_IGN_TILE_URL),
      center: START_CENTER,
      zoom: START_ZOOM,
      maxZoom: 20,
      // Carte raster vue de dessus : l'inclinaison ne sert à rien et charge des chunks lointains.
      maxPitch: 0,
      // Contrôle par défaut désactivé : on l'ajoute nous-mêmes en bas à gauche pour laisser
      // le bouton ◎ (bas à droite) libre.
      attributionControl: false,
    });
    map.addControl(new AttributionControl({ compact: true }), 'bottom-left');
    // Échelle à droite du ⓘ (coin bas-gauche mis en ligne dans index.css).
    map.addControl(new ScaleControl({ maxWidth: 90, unit: 'metric' }), 'bottom-left');
    // Mention IGN minime : repliée dès le départ.
    map.once('load', () => {
      const attribution = container.querySelector('.maplibregl-ctrl-attrib');
      attribution?.classList.remove('maplibregl-compact-show');
      attribution?.removeAttribute('open');
    });
    // Kotlin répond 404 à un chunk absent du cache sans attendre l'IGN, puis signale son arrivée :
    // on recharge alors ces tuiles (en attendant, MapLibre agrandit le zoom inférieur).
    const offChunksReady = onNative('chunksReady', (ids) => {
      map.refreshTiles(
        'plan-ign',
        ids.map(([z, x, y]) => ({ z, x, y })),
      );
    });
    onMapReady(map);
    // StrictMode monte l'effet deux fois en dev : on détruit proprement la carte.
    return () => {
      offChunksReady();
      map.remove();
    };
  }, [onMapReady]);

  return <div ref={containerRef} className="h-full w-full" />;
}
