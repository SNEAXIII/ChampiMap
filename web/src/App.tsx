import { useCallback, useEffect, useRef, useState } from 'react';
import type { LngLat, Map as MapLibreMap } from 'maplibre-gl';
import { MapView } from './components/MapView';
import { WaypointMarkers } from './components/WaypointMarkers';
import { Viseur } from './components/Viseur';
import { CreateWaypointSheet } from './components/CreateWaypointSheet';
import { WaypointSheet } from './components/WaypointSheet';
import { WaypointList } from './components/WaypointList';
import { BottomBar } from './components/BottomBar';
import { ClaimSelection } from './components/ClaimSelection';
import { ClaimOverlays } from './components/ClaimOverlays';
import { ClaimsPanel } from './components/ClaimsPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { GpsBadge } from './components/GpsBadge';
import { PositionLayer } from './components/PositionLayer';
import { PositionSheet } from './components/PositionSheet';
import { LocateButton, type FollowMode } from './components/LocateButton';
import { NorthButton } from './components/NorthButton';
import { CompassWarnings } from './components/CompassWarnings';
import { TargetArrow } from './components/TargetArrow';
import { TargetBanner } from './components/TargetBanner';
import { useLongPressViseur } from './map/useLongPressViseur';
import { useTarget } from './target/useTarget';
import { useWaypoints } from './waypoints/useWaypoints';
import { useClaims } from './claims/useClaims';
import { rectBounds } from './claims/regions';
import { useLocation } from './location/useLocation';
import { useStale } from './location/useStale';
import { useHeading } from './location/useHeading';
import { createWaypoint, defaultWaypointName, latestCarId, type Waypoint } from './waypoints/waypointStore';
import { CAR_ICON_ID } from './waypoints/icons';
import { callNative, onNative } from './bridge/bridge';
import { distanceMeters, type LatLon } from './geo/geo';

export type Sheet =
  | { kind: 'create'; position: LatLon; defaultName: string }
  | { kind: 'waypoint'; id: string }
  | { kind: 'position' }
  | null;

export type Panel = 'waypoints' | 'claims' | 'settings' | null;

export function App() {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [listReference, setListReference] = useState<LatLon>({ latitude: 0, longitude: 0 });
  const [followMode, setFollowMode] = useState<FollowMode>('free');
  const [centerOnNextFix, setCenterOnNextFix] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const waypoints = useWaypoints();
  const location = useLocation();
  const { claims, progress } = useClaims();
  const fix = location.fix;
  const stale = useStale(fix, location.running);
  const heading = useHeading();
  const [targetId, setTargetId] = useTarget();
  const target = waypoints.find((waypoint) => waypoint.id === targetId) ?? null;

  // Cible supprimée (ici ou via la sync) : on arrête de la cibler.
  useEffect(() => {
    if (targetId !== null && waypoints.length > 0 && target === null) setTargetId(null);
  }, [targetId, target, waypoints.length, setTargetId]);

  const openCreateSheet = useCallback((lngLat: LngLat) => {
    setSheet({ kind: 'create', position: { latitude: lngLat.lat, longitude: lngLat.lng }, defaultName: defaultWaypointName() });
  }, []);
  // Pas de viseur ni de création de waypoint en mode sélection de zone.
  const viseur = useLongPressViseur(selecting ? null : map, openCreateSheet);

  // Bouton retour Android : ferme la feuille, sinon le panneau.
  const hasLayer = sheet !== null || panel !== null || selecting;
  useEffect(() => {
    callNative('setBackEnabled', { enabled: hasLayer }).catch(console.warn);
  }, [hasLayer]);
  useEffect(
    () =>
      onNative('back', () => {
        if (sheet) setSheet(null);
        else if (selecting) setSelecting(false);
        else setPanel(null);
      }),
    [sheet, selecting],
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

  // Geste utilisateur (pincer/tourner/incliner) en cours : le suivi ne doit pas l'interrompre en repoussant
  // la caméra sous lui (un pincer sans assez de déplacement pour déclencher dragstart resterait sinon coupé
  // net par le prochain easeTo du Suivi).
  const userGestureRef = useRef(false);
  useEffect(() => {
    if (!map) return;
    const onGestureStart = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) userGestureRef.current = true;
    };
    const onGestureEnd = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) userGestureRef.current = false;
    };
    map.on('zoomstart', onGestureStart);
    map.on('rotatestart', onGestureStart);
    map.on('pitchstart', onGestureStart);
    map.on('zoomend', onGestureEnd);
    map.on('rotateend', onGestureEnd);
    map.on('pitchend', onGestureEnd);
    return () => {
      map.off('zoomstart', onGestureStart);
      map.off('rotatestart', onGestureStart);
      map.off('pitchstart', onGestureStart);
      map.off('zoomend', onGestureEnd);
      map.off('rotateend', onGestureEnd);
      map.off('pitchend', onGestureEnd);
    };
  }, [map]);

  // Premier tap sans position : centrer (nord en haut) dès qu'elle arrive.
  useEffect(() => {
    if (!map || !fix || !centerOnNextFix) return;
    setCenterOnNextFix(false);
    setFollowMode('centered');
    map.easeTo({ center: [fix.longitude, fix.latitude], bearing: 0 });
  }, [map, fix, centerOnNextFix]);

  // Suivi : la carte suit la position et tourne selon le cap.
  const headingDegrees = heading?.heading ?? null;
  useEffect(() => {
    // Un geste utilisateur en cours (pincer, tourner...) ne doit pas être coupé par ce recentrage.
    // Le viseur (appui long) désactive dragPan : sans cette garde, la carte tournerait encore sous
    // un doigt immobile et le point créé au relâchement ne correspondrait plus au réticule.
    // Idem derrière un panneau plein écran (rien à voir) : autant ne pas animer la caméra pour rien.
    if (!map || !fix || followMode !== 'follow' || userGestureRef.current || viseur !== null || panel !== null) return;
    map.easeTo({
      center: [fix.longitude, fix.latitude],
      // Cap dégénéré près de la verticale (téléphone redressé) : garder la rotation actuelle plutôt
      // que suivre un azimut erratique.
      bearing: heading && !heading.tilted ? heading.heading : map.getBearing(),
      // Rejoué jusqu'à 10×/s (cap) : un easing par défaut redémarré à chaque appel est saccadé, linéaire
      // et court enchaîne proprement.
      duration: 150,
      easing: (t) => t,
    });
  }, [map, fix, followMode, heading, viseur, panel]);

  // Écran allumé uniquement en Suivi ou avec une Cible active.
  const keepScreenOn = followMode === 'follow' || target !== null;
  useEffect(() => {
    callNative('setKeepScreenOn', { on: keepScreenOn }).catch(console.warn);
  }, [keepScreenOn]);

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
      // Centré = nord en haut.
      setFollowMode('centered');
      map.easeTo({ center, bearing: 0 });
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
        <GpsBadge location={location} stale={stale} />
        {map && <ClaimOverlays map={map} claims={claims} />}
        {map && <PositionLayer map={map} fix={fix} heading={headingDegrees} stale={stale} onSelect={() => setSheet({ kind: 'position' })} />}
        {map && <WaypointMarkers map={map} waypoints={waypoints} onSelect={(id) => setSheet({ kind: 'waypoint', id })} />}
        {viseur && <Viseur viseur={viseur} />}
        {map && <NorthButton map={map} hidden={followMode === 'follow'} />}
        <CompassWarnings heading={heading} active={keepScreenOn} />
        {map && fix && target && <TargetArrow map={map} fix={fix} target={target} stale={stale} />}
        {target && <TargetBanner target={target} distance={fix ? distanceMeters(fix, target) : null} onStop={() => setTargetId(null)} />}
        <LocateButton mode={followMode} onPress={pressLocate} />
        {sheet?.kind === 'create' && (
          <CreateWaypointSheet
            key={sheet.defaultName + sheet.position.latitude + ',' + sheet.position.longitude}
            position={sheet.position}
            defaultName={sheet.defaultName}
            onCancel={() => setSheet(null)}
            onCreate={async (name, icon) => {
              await createWaypoint(name, sheet.position.latitude, sheet.position.longitude, icon);
              setSheet(null);
            }}
          />
        )}
        {sheet?.kind === 'position' && fix && (
          <PositionSheet
            fix={fix}
            onClose={() => setSheet(null)}
            onCreateWaypoint={() => setSheet({ kind: 'create', position: fix, defaultName: 'Ma position' })}
            onParkHere={async () => {
              await createWaypoint(defaultWaypointName(new Date(), 'Voiture'), fix.latitude, fix.longitude, CAR_ICON_ID);
              setSheet(null);
            }}
          />
        )}
        {selected && (
          <WaypointSheet
            key={selected.id}
            waypoint={selected}
            distance={fix ? distanceMeters(fix, selected) : null}
            isTarget={targetId === selected.id}
            isLatestCar={latestCarId(waypoints) === selected.id}
            onToggleTarget={() => {
              setTargetId(targetId === selected.id ? null : selected.id);
              setSheet(null);
            }}
            onClose={() => setSheet(null)}
          />
        )}
        {selecting && map && <ClaimSelection map={map} claims={claims} onDone={() => setSelecting(false)} />}
        {panel === 'waypoints' && (
          <WaypointList waypoints={waypoints} reference={listReference} onPick={showWaypoint} onClose={() => setPanel(null)} />
        )}
        {panel === 'settings' && <SettingsPanel onClose={() => setPanel(null)} />}
        {panel === 'claims' && (
          <ClaimsPanel
            claims={claims}
            progress={progress}
            onClose={() => setPanel(null)}
            onNewClaim={() => {
              setPanel(null);
              // cooperativeGestures : un seul doigt ne déclenche pas dragstart, donc rien n'interromprait
              // le Suivi pendant le tracé du rectangle — la carte tournerait/paniquerait sous la sélection.
              setFollowMode('free');
              map?.easeTo({ bearing: 0 });
              setSelecting(true);
            }}
            onShow={(claim) => {
              setPanel(null);
              setFollowMode('free');
              map?.fitBounds(rectBounds(claim), { padding: 40 });
            }}
          />
        )}
      </div>
      <BottomBar
        // Le mode sélection d'une zone est lancé depuis « Zones hors ligne » : l'onglet reste marqué.
        active={selecting ? 'claims' : panel}
        onOpenWaypoints={openWaypointList}
        onOpenClaims={() => {
          setSheet(null);
          setSelecting(false);
          setPanel('claims');
        }}
        onOpenSettings={() => {
          setSheet(null);
          setPanel('settings');
        }}
      />
    </main>
  );
}
