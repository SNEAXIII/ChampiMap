import { useCallback, useEffect, useState } from 'react';
import type { LngLat, Map as MapLibreMap } from 'maplibre-gl';
import { MapView } from './components/MapView';
import { WaypointMarkers } from './components/WaypointMarkers';
import { Viseur } from './components/Viseur';
import { CreateWaypointSheet } from './components/CreateWaypointSheet';
import { WaypointSheet } from './components/WaypointSheet';
import { WaypointList } from './components/WaypointList';
import { BottomBar } from './components/BottomBar';
import { GpsBadge } from './components/GpsBadge';
import { PositionLayer } from './components/PositionLayer';
import { PositionSheet } from './components/PositionSheet';
import { LocateButton, type FollowMode } from './components/LocateButton';
import { useLongPressViseur } from './map/useLongPressViseur';
import { useWaypoints } from './waypoints/useWaypoints';
import { isStale, useLocation } from './location/useLocation';
import { createWaypoint, defaultWaypointName, type Waypoint } from './waypoints/waypointStore';
import { callNative, onNative } from './bridge/bridge';
import { distanceMeters, type LatLon } from './geo/geo';

export type Sheet =
  | { kind: 'create'; position: LatLon; defaultName: string }
  | { kind: 'waypoint'; id: string }
  | { kind: 'position' }
  | null;

export type Panel = 'waypoints' | null;

export function App() {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [listReference, setListReference] = useState<LatLon>({ latitude: 0, longitude: 0 });
  const [followMode, setFollowMode] = useState<FollowMode>('free');
  const [centerOnNextFix, setCenterOnNextFix] = useState(false);
  const waypoints = useWaypoints();
  const location = useLocation();
  const fix = location.fix;
  const stale = isStale(fix, location.running);

  const openCreateSheet = useCallback((lngLat: LngLat) => {
    setSheet({ kind: 'create', position: { latitude: lngLat.lat, longitude: lngLat.lng }, defaultName: defaultWaypointName() });
  }, []);
  const viseur = useLongPressViseur(map, openCreateSheet);

  // Bouton retour Android : ferme la feuille, sinon le panneau.
  const hasLayer = sheet !== null || panel !== null;
  useEffect(() => {
    callNative('setBackEnabled', { enabled: hasLayer }).catch(console.warn);
  }, [hasLayer]);
  useEffect(
    () =>
      onNative('back', () => {
        if (sheet) setSheet(null);
        else setPanel(null);
      }),
    [sheet],
  );

  // Déplacer la carte au doigt quitte Centré/Suivi.
  useEffect(() => {
    if (!map) return;
    const onDragStart = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) {
        setFollowMode('free');
        // Sinon un centrage en attente (tap sur ◎ avant tout fix) rattraperait le glissé au fix suivant.
        setCenterOnNextFix(false);
      }
    };
    map.on('dragstart', onDragStart);
    return () => {
      map.off('dragstart', onDragStart);
    };
  }, [map]);

  // Suivi : la carte suit chaque nouvelle position. Premier tap sans position : centrer dès qu'elle arrive.
  useEffect(() => {
    if (!map || !fix) return;
    if (centerOnNextFix) {
      setCenterOnNextFix(false);
      setFollowMode('centered');
      map.easeTo({ center: [fix.longitude, fix.latitude], bearing: 0 });
    } else if (followMode === 'follow') {
      map.easeTo({ center: [fix.longitude, fix.latitude], duration: 500 });
    }
  }, [map, fix, followMode, centerOnNextFix]);

  // Écran allumé uniquement en Suivi.
  useEffect(() => {
    callNative('setKeepScreenOn', { on: followMode === 'follow' }).catch(console.warn);
  }, [followMode]);

  // Si le fix disparaît (resync natif) pendant que la feuille « Ma position » est ouverte, la fermer.
  useEffect(() => {
    if (sheet?.kind === 'position' && fix === null) setSheet(null);
  }, [sheet, fix]);

  const pressLocate = () => {
    if (!location.running) location.start();
    if (!map) return;
    if (!fix) {
      setCenterOnNextFix(true);
      return;
    }
    const center: [number, number] = [fix.longitude, fix.latitude];
    if (followMode === 'free') {
      setFollowMode('centered');
      map.easeTo({ center, bearing: 0 });
    } else if (followMode === 'centered') {
      setFollowMode('follow');
      map.easeTo({ center });
    } else {
      setFollowMode('centered');
    }
  };

  const openWaypointList = () => {
    const center = map?.getCenter();
    if (fix) setListReference(fix);
    else if (center) setListReference({ latitude: center.lat, longitude: center.lng });
    setSheet(null);
    setPanel('waypoints');
  };

  const showWaypoint = (waypoint: Waypoint) => {
    setPanel(null);
    setFollowMode('free');
    map?.flyTo({ center: [waypoint.longitude, waypoint.latitude], zoom: Math.max(map.getZoom(), 15) });
    setSheet({ kind: 'waypoint', id: waypoint.id });
  };

  const selected = sheet?.kind === 'waypoint' ? waypoints.find((waypoint) => waypoint.id === sheet.id) : undefined;

  return (
    <main className="flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <MapView onMapReady={setMap} />
        <GpsBadge location={location} />
        {map && <PositionLayer map={map} fix={fix} stale={stale} onSelect={() => setSheet({ kind: 'position' })} />}
        {map && <WaypointMarkers map={map} waypoints={waypoints} onSelect={(id) => setSheet({ kind: 'waypoint', id })} />}
        {viseur && <Viseur viseur={viseur} />}
        <LocateButton mode={followMode} onPress={pressLocate} />
        {sheet?.kind === 'create' && (
          <CreateWaypointSheet
            key={sheet.defaultName + sheet.position.latitude + ',' + sheet.position.longitude}
            position={sheet.position}
            defaultName={sheet.defaultName}
            onCancel={() => setSheet(null)}
            onCreate={async (name) => {
              await createWaypoint(name, sheet.position.latitude, sheet.position.longitude);
              setSheet(null);
            }}
          />
        )}
        {sheet?.kind === 'position' && fix && (
          <PositionSheet
            fix={fix}
            onClose={() => setSheet(null)}
            onCreateWaypoint={() => setSheet({ kind: 'create', position: fix, defaultName: 'Ma position' })}
          />
        )}
        {selected && (
          <WaypointSheet
            key={selected.id}
            waypoint={selected}
            distance={fix ? distanceMeters(fix, selected) : null}
            onClose={() => setSheet(null)}
          />
        )}
        {panel === 'waypoints' && (
          <WaypointList waypoints={waypoints} reference={listReference} onPick={showWaypoint} onClose={() => setPanel(null)} />
        )}
      </div>
      <BottomBar onOpenWaypoints={openWaypointList} />
    </main>
  );
}
