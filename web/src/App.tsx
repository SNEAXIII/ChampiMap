import { useCallback, useEffect, useState } from 'react';
import type { LngLat, Map as MapLibreMap } from 'maplibre-gl';
import { MapView } from './components/MapView';
import { WaypointMarkers } from './components/WaypointMarkers';
import { Viseur } from './components/Viseur';
import { CreateWaypointSheet } from './components/CreateWaypointSheet';
import { WaypointSheet } from './components/WaypointSheet';
import { useLongPressViseur } from './map/useLongPressViseur';
import { useWaypoints } from './waypoints/useWaypoints';
import { createWaypoint, defaultWaypointName } from './waypoints/waypointStore';
import { callNative, onNative } from './bridge/bridge';
import type { LatLon } from './geo/geo';

export type Sheet =
  | { kind: 'create'; position: LatLon; defaultName: string }
  | { kind: 'waypoint'; id: string }
  | null;

export function App() {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const waypoints = useWaypoints();

  const openCreateSheet = useCallback((lngLat: LngLat) => {
    setSheet({ kind: 'create', position: { latitude: lngLat.lat, longitude: lngLat.lng }, defaultName: defaultWaypointName() });
  }, []);
  const viseur = useLongPressViseur(map, openCreateSheet);

  // Bouton retour Android : ferme la couche du dessus.
  const hasLayer = sheet !== null;
  useEffect(() => {
    void callNative('setBackEnabled', { enabled: hasLayer });
  }, [hasLayer]);
  useEffect(() => onNative('back', () => setSheet(null)), []);

  const selected = sheet?.kind === 'waypoint' ? waypoints.find((waypoint) => waypoint.id === sheet.id) : undefined;

  return (
    <main className="relative h-full w-full overflow-hidden">
      <MapView onMapReady={setMap} />
      {map && <WaypointMarkers map={map} waypoints={waypoints} onSelect={(id) => setSheet({ kind: 'waypoint', id })} />}
      {viseur && <Viseur viseur={viseur} />}
      {sheet?.kind === 'create' && (
        <CreateWaypointSheet
          position={sheet.position}
          defaultName={sheet.defaultName}
          onCancel={() => setSheet(null)}
          onCreate={async (name) => {
            await createWaypoint(name, sheet.position.latitude, sheet.position.longitude);
            setSheet(null);
          }}
        />
      )}
      {selected && <WaypointSheet key={selected.id} waypoint={selected} onClose={() => setSheet(null)} />}
    </main>
  );
}
