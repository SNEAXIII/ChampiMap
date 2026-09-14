# Champi Map — Phase 7 : boussole et cible — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connaître le cap du téléphone tenu à plat, faire tourner la carte en Suivi, et cibler un waypoint : une flèche en orbite autour de sa position pointe vers lui, avec la distance et « Arrivé » sous 10 m.

**Architecture:**
- **Kotlin** : `HeadingSensor` lit `TYPE_ROTATION_VECTOR`, corrige vers le nord vrai avec `GeomagneticField` (déclinaison calculée à la dernière position), détecte l'inclinaison au-delà de 60° et le besoin de calibration (précision du magnétomètre). Il émet l'événement `heading`, au plus 10 fois par seconde, seulement app visible.
- **Web** :
  - le marqueur de position s'oriente selon le cap ;
  - en Suivi, la carte suit la position **et** tourne selon le cap ;
  - un bouton nord apparaît quand la carte est tournée hors Suivi ;
  - la Cible (un seul waypoint, gardée dans `localStorage`) affiche une flèche en orbite et un bandeau, et garde l'écran allumé.

**Tech Stack:** Phases 1–6, aucune nouvelle dépendance.

**Spec:** `docs/mvp.md` (sections Boussole, Carte, Position), glossaire `CONTEXT.md` (Cap, Relèvement, Cible, Suivi).

**Prérequis:**
- Phase 3 : `PositionLayer.tsx`, `LocateButton.tsx` (`FollowMode`), `WaypointSheet.tsx` avec `distance`, `App.tsx` avec les effets de suivi et de maintien de l'écran.
- Phase 6 terminée.

## Global Constraints

- `fr.champimap`, `minSdk 26`, `compileSdk 36`, `targetSdk 36`, portrait verrouillé. Pas de Leaflet/Compose/AppCompat. AGP 9 sans plugin kotlin-android.
- **Cap** = direction du haut du téléphone tenu à plat, par rapport au **nord vrai**. Capteur `TYPE_ROTATION_VECTOR`, correction `GeomagneticField`, alerte de calibration si le magnétomètre est peu fiable.
- Avertissement « Tiens le téléphone à plat » au-delà de ~60° d'inclinaison.
- **Relèvement** = angle nord vrai → direction position → cible.
- La carte tourne selon le cap **uniquement en Suivi**. Hors Suivi, elle garde la rotation choisie par l'utilisateur, avec une boussole pour revenir au nord. Centré = nord en haut.
- **Cible** : au plus un waypoint. Flèche en orbite autour du marqueur de position, pointant selon le relèvement, même si la cible est hors écran. Nom + distance en bas. « Arrivé » sous **10 m**, sans arrêt automatique. ✕ pour arrêter. Pas de navigation GPS complète.
- Écran maintenu allumé uniquement en Suivi **ou** avec une Cible active.
- Pas de tests automatisés. npm uniquement. Gradle : `export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11";`. `adb` préfixé par `timeout 30`.
- **Téléphone : prévenir l'utilisateur et attendre son accord explicite avant toute commande qui installe, lance ou modifie l'état du téléphone.** Un sous-agent s'arrête après le build et rend la main (NEEDS_CONTEXT). **Faire tourner le téléphone : action de l'utilisateur**, guidée par le sous-agent qui prend les captures.

## Procédure « lancer en debug sur le téléphone » (référencée par les tâches)

Après accord de l'utilisateur :
```bash
cd web && npm run dev                      # en arrière-plan
cd X:/Dev/Perso/champibheu
export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11"; (cd android && ./gradlew assembleDebug)
timeout 30 adb reverse tcp:5173 tcp:5173
timeout 60 adb install -r android/app/build/outputs/apk/debug/app-debug.apk
timeout 30 adb shell am force-stop fr.champimap
timeout 30 adb shell am start -n fr.champimap/.MainActivity
```
Captures : `mkdir -p android/build/screens && timeout 30 adb exec-out screencap -p > android/build/screens/<nom>.png`. Arrêter Vite avant le rapport.

## File Structure

```
android/app/src/main/java/fr/champimap/
├── HeadingSensor.kt                       cap nord vrai, inclinaison, calibration
└── MainActivity.kt                        + démarre/arrête le capteur, émet « heading »
web/src/
├── bridge/bridge.ts, bridge/fakeNative.ts + événement heading (navigateur : orientation absolue ou touches [ ])
├── geo/geo.ts                             + bearingDegrees
├── location/useHeading.ts                 dernier cap reçu
├── target/useTarget.ts                    cible persistée
├── components/
│   ├── PositionLayer.tsx                  + cône d'orientation (remplace onMarker par heading)
│   ├── NorthButton.tsx                    remet le nord en haut
│   ├── CompassWarnings.tsx                « à plat » / « fais un 8 »
│   ├── TargetArrow.tsx                    flèche en orbite
│   ├── TargetBanner.tsx                   nom + distance / Arrivé + ✕
│   └── WaypointSheet.tsx                  + [Cibler] / [Ne plus cibler]
└── App.tsx                                + rotation en Suivi, cible, écran allumé
```

---

### Task 1: Cap du téléphone, marqueur orienté et carte qui tourne en Suivi

**Files:**
- Create: `android/app/src/main/java/fr/champimap/HeadingSensor.kt`, `web/src/location/useHeading.ts`, `web/src/components/NorthButton.tsx`, `web/src/components/CompassWarnings.tsx`
- Modify: `android/app/src/main/java/fr/champimap/MainActivity.kt`, `web/src/bridge/bridge.ts`, `web/src/bridge/fakeNative.ts`, `web/src/components/PositionLayer.tsx`, `web/src/App.tsx`

**Interfaces:**
- Consumes: `LocationHub.lastFix` (phase 3), `NativeBridge.emit` (phase 2), `FollowMode`, `PositionLayer`, `useLocation` (phase 3), `emitFake`.
- Produces:
  - Kotlin `class HeadingSensor(context: Context, onChange: (heading: Double, tilted: Boolean, needsCalibration: Boolean) -> Unit)` avec `start()` et `stop()`.
  - TS `type Heading = { heading: number; tilted: boolean; needsCalibration: boolean }` exporté par `bridge.ts`, et `BridgeEvents.heading: Heading`.
  - `useHeading(): Heading | null`.
  - `PositionLayer` props `{ map: MapLibreMap; fix: LocationFix | null; heading: number | null; onSelect: () => void }`.
  - `NorthButton` props `{ map: MapLibreMap; hidden: boolean }`. `CompassWarnings` props `{ heading: Heading | null; active: boolean }`.

- [ ] **Step 1: Créer `android/app/src/main/java/fr/champimap/HeadingSensor.kt`**

```kotlin
package fr.champimap

import android.content.Context
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import kotlin.math.abs

/**
 * Cap du téléphone tenu à plat, en degrés par rapport au nord vrai.
 * Émet au plus toutes les 100 ms, et seulement si le cap bouge d'au moins 1° ou si l'état change.
 */
class HeadingSensor(
    context: Context,
    private val onChange: (heading: Double, tilted: Boolean, needsCalibration: Boolean) -> Unit,
) : SensorEventListener {

    private val sensors = context.getSystemService(SensorManager::class.java)
    private val rotationVector: Sensor? = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
    private val magnetometer: Sensor? = sensors.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
    private val matrix = FloatArray(9)
    private val angles = FloatArray(3)

    private var needsCalibration = false
    private var lastEmitAt = 0L
    private var lastHeading = Double.NaN
    private var lastTilted = false
    private var lastCalibration = false
    private var declinationFixTime = Long.MIN_VALUE
    private var declination = 0f

    fun start() {
        rotationVector?.let { sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) }
        // Le magnétomètre n'est écouté que pour sa précision (besoin de calibration).
        magnetometer?.let { sensors.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) }
    }

    fun stop() {
        sensors.unregisterListener(this)
    }

    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {
        if (sensor.type == Sensor.TYPE_MAGNETIC_FIELD) {
            needsCalibration = accuracy <= SensorManager.SENSOR_STATUS_ACCURACY_LOW
        }
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type != Sensor.TYPE_ROTATION_VECTOR) return
        val now = SystemClock.elapsedRealtime()
        if (now - lastEmitAt < MIN_INTERVAL_MS) return

        SensorManager.getRotationMatrixFromVector(matrix, event.values)
        SensorManager.getOrientation(matrix, angles)
        val magneticHeading = Math.toDegrees(angles[0].toDouble())
        val heading = ((magneticHeading + currentDeclination()) % 360 + 360) % 360
        val tilted = abs(Math.toDegrees(angles[1].toDouble())) > MAX_TILT_DEGREES ||
            abs(Math.toDegrees(angles[2].toDouble())) > MAX_TILT_DEGREES

        val unchanged = !lastHeading.isNaN() &&
            angleBetween(heading, lastHeading) < MIN_DELTA_DEGREES &&
            tilted == lastTilted &&
            needsCalibration == lastCalibration
        if (unchanged) return

        lastEmitAt = now
        lastHeading = heading
        lastTilted = tilted
        lastCalibration = needsCalibration
        onChange(heading, tilted, needsCalibration)
    }

    /** Écart nord magnétique → nord vrai à la dernière position (0 tant qu'on n'a pas de position). */
    private fun currentDeclination(): Float {
        val fix = LocationHub.lastFix ?: return 0f
        if (fix.time != declinationFixTime) {
            declinationFixTime = fix.time
            declination = GeomagneticField(
                fix.latitude.toFloat(),
                fix.longitude.toFloat(),
                fix.altitude.toFloat(),
                System.currentTimeMillis(),
            ).declination
        }
        return declination
    }

    private fun angleBetween(a: Double, b: Double): Double {
        val diff = abs(a - b) % 360
        return if (diff > 180) 360 - diff else diff
    }

    private companion object {
        const val MIN_INTERVAL_MS = 100L
        const val MIN_DELTA_DEGREES = 1.0
        const val MAX_TILT_DEGREES = 60.0
    }
}
```

- [ ] **Step 2: Modifier `MainActivity.kt`**

- Ajouter le champ après `private var locationPermissionDenied = false` :
```kotlin
    private lateinit var headingSensor: HeadingSensor
```
- Dans `onCreate`, juste après `bridge = NativeBridge(this, webView)`, ajouter :
```kotlin
        headingSensor = HeadingSensor(this) { heading, tilted, needsCalibration ->
            bridge.emit(
                "heading",
                JSONObject().put("heading", heading).put("tilted", tilted).put("needsCalibration", needsCalibration),
            )
        }
```
- Dans `onStart()`, après `LocationHub.setAppVisible(true)`, ajouter `headingSensor.start()`.
- Dans `onStop()`, en première ligne, ajouter `headingSensor.stop()`.

- [ ] **Step 3: Modifier `web/src/bridge/bridge.ts`**

- Après `export type LocationFix = …`, ajouter :
```ts
export type Heading = { heading: number; tilted: boolean; needsCalibration: boolean };
```
- Dans `BridgeEvents`, ajouter après `claimsChanged: null;` :
```ts
  heading: Heading;
```

- [ ] **Step 4: Modifier `web/src/bridge/fakeNative.ts`**

Dans `createFakeNative`, juste après l'écouteur `keydown` de la touche Échap, ajouter :
```ts
  // Cap simulé : orientation absolue du navigateur si disponible, sinon touches [ et ] (±10°).
  let fakeHeading = 0;
  const emitHeading = () => emitFake('heading', { heading: fakeHeading, tilted: false, needsCalibration: false });
  window.addEventListener('deviceorientationabsolute', (event) => {
    const alpha = (event as DeviceOrientationEvent).alpha;
    if (alpha === null) return;
    fakeHeading = (360 - alpha) % 360;
    emitHeading();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key !== '[' && event.key !== ']') return;
    fakeHeading = (fakeHeading + (event.key === ']' ? 10 : 350)) % 360;
    emitHeading();
  });
```

- [ ] **Step 5: Créer `web/src/location/useHeading.ts`**

```ts
import { useEffect, useState } from 'react';
import { onNative, type Heading } from '../bridge/bridge';

/** Dernier cap reçu (null tant que le capteur n'a rien envoyé). */
export function useHeading(): Heading | null {
  const [heading, setHeading] = useState<Heading | null>(null);
  useEffect(() => onNative('heading', setHeading), []);
  return heading;
}
```

- [ ] **Step 6: Remplacer `web/src/components/PositionLayer.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { Marker, type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import type { LocationFix } from '../bridge/bridge';
import { circlePolygon } from '../geo/geo';

type Props = {
  map: MapLibreMap;
  fix: LocationFix | null;
  heading: number | null;
  onSelect: () => void;
};

const SOURCE_ID = 'position-accuracy';
const EMPTY = { type: 'FeatureCollection', features: [] } as const;

/** Point bleu cliquable, orienté selon le cap, + cercle de précision (en mètres). */
export function PositionLayer({ map, fix, heading, onSelect }: Props) {
  const markerRef = useRef<Marker | null>(null);
  const coneRef = useRef<HTMLElement | null>(null);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const addLayers = () => {
      if (map.getSource(SOURCE_ID)) return;
      map.addSource(SOURCE_ID, { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'position-accuracy-fill', type: 'fill', source: SOURCE_ID, paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'position-accuracy-line', type: 'line', source: SOURCE_ID, paint: { 'line-color': '#2563eb', 'line-width': 1, 'line-opacity': 0.5 } });
    };
    if (map.isStyleLoaded()) addLayers();
    else map.once('load', addLayers);

    const element = document.createElement('button');
    element.type = 'button';
    element.setAttribute('aria-label', 'Ma position');
    element.className = 'relative block h-12 w-12';
    element.innerHTML =
      // Cône d'orientation : pointe vers le haut de l'élément, tourné par MapLibre selon le cap.
      '<span data-cone class="absolute top-0 left-1/2 hidden h-0 w-0 -translate-x-1/2 border-x-[9px] border-b-[18px] border-x-transparent border-b-blue-600/70"></span>' +
      '<span class="absolute top-1/2 left-1/2 block h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-blue-600 shadow-[0_0_0_3px_rgba(37,99,235,0.3)]"></span>';
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      onSelectRef.current();
    });
    coneRef.current = element.querySelector<HTMLElement>('[data-cone]');
    // rotationAlignment 'map' : la rotation est relative au nord de la carte, même quand la carte tourne.
    markerRef.current = new Marker({ element, rotationAlignment: 'map' });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      coneRef.current = null;
      map.off('load', addLayers);
    };
  }, [map]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !fix) return;
    marker.setLngLat([fix.longitude, fix.latitude]).addTo(map);
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(
      fix.accuracy === null
        ? EMPTY
        : { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: circlePolygon(fix, fix.accuracy) } },
    );
  }, [map, fix]);

  useEffect(() => {
    coneRef.current?.classList.toggle('hidden', heading === null);
    if (heading !== null) markerRef.current?.setRotation(heading);
  }, [heading]);

  return null;
}
```

- [ ] **Step 7: Créer `web/src/components/NorthButton.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';

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
      <span className="block text-lg leading-none font-bold text-red-600" style={{ transform: `rotate(${-bearing}deg)` }}>
        ▲
      </span>
    </button>
  );
}
```

- [ ] **Step 8: Créer `web/src/components/CompassWarnings.tsx`**

```tsx
import type { Heading } from '../bridge/bridge';

type Props = {
  heading: Heading | null;
  active: boolean;
};

/** Avertissements utiles seulement quand on se sert du cap (Suivi ou Cible). */
export function CompassWarnings({ heading, active }: Props) {
  if (!active || !heading || (!heading.tilted && !heading.needsCalibration)) return null;
  return (
    <div className="pointer-events-none absolute top-10 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium whitespace-nowrap text-amber-900 shadow">
      {heading.tilted ? '📱 Tiens le téléphone à plat' : '🧭 Boussole imprécise : fais un 8 avec le téléphone'}
    </div>
  );
}
```

- [ ] **Step 9: Modifier `web/src/App.tsx`**

- Imports : `import { useHeading } from './location/useHeading';`, `import { NorthButton } from './components/NorthButton';`, `import { CompassWarnings } from './components/CompassWarnings';`
- Après `const fix = location.fix;`, ajouter : `const heading = useHeading();`
- Remplacer le bloc de suivi et de maintien de l'écran de la phase 3 :
```tsx
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
```
par :
```tsx
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
    if (!map || !fix || followMode !== 'follow') return;
    map.easeTo({
      center: [fix.longitude, fix.latitude],
      bearing: headingDegrees ?? map.getBearing(),
      duration: 200,
    });
  }, [map, fix, followMode, headingDegrees]);
```
- Dans `pressLocate`, remplacer la branche finale :
```tsx
    } else {
      setFollowMode('centered');
    }
```
par :
```tsx
    } else {
      // Centré = nord en haut.
      setFollowMode('centered');
      map.easeTo({ center, bearing: 0 });
    }
```
- Remplacer `{map && <PositionLayer map={map} fix={fix} onSelect={() => setSheet({ kind: 'position' })} />}` par :
```tsx
        {map && <PositionLayer map={map} fix={fix} heading={headingDegrees} onSelect={() => setSheet({ kind: 'position' })} />}
```
- Juste avant `<LocateButton mode={followMode} onPress={pressLocate} />`, ajouter :
```tsx
        {map && <NorthButton map={map} hidden={followMode === 'follow'} />}
        <CompassWarnings heading={heading} active={followMode === 'follow'} />
```

- [ ] **Step 10: Vérifier types et builds**

```bash
cd web && npm run typecheck && npm run build
cd ../android && export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11" && ./gradlew assembleDebug
```
Expected: aucune erreur, `BUILD SUCCESSFUL`.

- [ ] **Step 11: Contrôle sur le téléphone** (après accord de l'utilisateur, procédure « lancer en debug »)

Guider l'utilisateur, qui tient le téléphone. Une capture après chaque consigne dans `android/build/screens/phase7-task1-<n>.png` :
1. « Pose le téléphone à plat, haut du téléphone vers le nord (aide-toi d'une boussole ou d'un repère connu) » : le cône bleu du marqueur pointe vers le haut de la carte (nord en haut).
2. « Tourne-toi de 90° vers l'est » : le cône pointe vers la droite de la carte.
3. Tap ◎ deux fois (Suivi ◉) : la carte tourne, et le haut de l'écran correspond à la direction du téléphone. « Tourne-toi lentement » : la carte suit sans saccades gênantes (le signaler sinon).
4. « Redresse le téléphone à la verticale » : le bandeau « Tiens le téléphone à plat » apparaît. Le reposer à plat : il disparaît.
5. Glisser la carte au doigt (sortie du Suivi) : la carte garde sa rotation et le bouton nord ▲ apparaît. Tap dessus : nord en haut, le bouton disparaît.
6. Tap ◎ (Centré) : nord en haut.
7. Si « Boussole imprécise » s'affiche à un moment, demander à l'utilisateur de faire un 8 : le bandeau disparaît.

- [ ] **Step 12: Commit**

```bash
git add android/app/src/main web/src
git commit -m "feat: cap du téléphone et carte orientée en Suivi"
```

---

### Task 2: Cible, flèche en orbite et bandeau

**Files:**
- Create: `web/src/target/useTarget.ts`, `web/src/components/TargetArrow.tsx`, `web/src/components/TargetBanner.tsx`
- Modify: `web/src/geo/geo.ts`, `web/src/components/WaypointSheet.tsx`, `web/src/App.tsx`

**Interfaces:**
- Consumes: `useHeading`, `CompassWarnings` (Task 1), `useLocation`, `LocationFix`, `distanceMeters`, `formatDistance`, `Waypoint`, `useWaypoints`, `callNative('setKeepScreenOn')`.
- Produces:
  - `geo.ts` + `bearingDegrees(from: LatLon, to: LatLon): number` (0–360, nord vrai).
  - `useTarget(): [string | null, (id: string | null) => void]`.
  - `TargetArrow` props `{ map: MapLibreMap; fix: LocationFix; target: Waypoint }`. `TargetBanner` props `{ target: Waypoint; distance: number | null; onStop: () => void }`.
  - `WaypointSheet` props `{ waypoint: Waypoint; distance: number | null; isTarget: boolean; onToggleTarget: () => void; onClose: () => void }`.

- [ ] **Step 1: Ajouter `bearingDegrees` à la fin de `web/src/geo/geo.ts`**

```ts
/** Relèvement : angle depuis le nord vrai de la direction `from` → `to`, en degrés 0–360. */
export function bearingDegrees(from: LatLon, to: LatLon): number {
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
```

- [ ] **Step 2: Créer `web/src/target/useTarget.ts`**

```ts
import { useCallback, useState } from 'react';

const STORAGE_KEY = 'champi.targetId';

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Identifiant du waypoint ciblé (au plus un), gardé entre deux lancements. */
export function useTarget(): [string | null, (id: string | null) => void] {
  const [targetId, setTargetIdState] = useState<string | null>(readStored);

  const setTargetId = useCallback((id: string | null) => {
    setTargetIdState(id);
    try {
      if (id === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Stockage indisponible : la cible reste en mémoire pour cette session.
    }
  }, []);

  return [targetId, setTargetId];
}
```

- [ ] **Step 3: Créer `web/src/components/TargetArrow.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LocationFix } from '../bridge/bridge';
import { bearingDegrees } from '../geo/geo';
import type { Waypoint } from '../waypoints/waypointStore';

type Props = {
  map: MapLibreMap;
  fix: LocationFix;
  target: Waypoint;
};

const ORBIT_RADIUS_PX = 40;

/** Flèche en orbite autour de la position, pointant vers la cible (même hors écran). */
export function TargetArrow({ map, fix, target }: Props) {
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
    <div className="pointer-events-none absolute z-10" style={{ left: point.x, top: point.y }}>
      <div style={{ transform: `rotate(${screenAngle}deg)` }}>
        <div
          className="absolute h-0 w-0 -translate-x-1/2 -translate-y-1/2 border-x-[10px] border-b-[20px] border-x-transparent border-b-emerald-600 drop-shadow"
          style={{ top: -ORBIT_RADIUS_PX }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Créer `web/src/components/TargetBanner.tsx`**

```tsx
import { formatDistance } from '../geo/geo';
import type { Waypoint } from '../waypoints/waypointStore';

type Props = {
  target: Waypoint;
  distance: number | null;
  onStop: () => void;
};

const ARRIVED_METERS = 10;

export function TargetBanner({ target, distance, onStop }: Props) {
  const arrived = distance !== null && distance < ARRIVED_METERS;
  return (
    <div className={`absolute bottom-4 left-3 z-10 flex max-w-[70%] items-center gap-2 rounded-full py-2 pr-2 pl-4 shadow-lg ${arrived ? 'bg-emerald-600 text-white' : 'bg-white'}`}>
      <span className="min-w-0 truncate text-sm font-medium">
        {arrived ? `✅ Arrivé · ${target.name}` : `🎯 ${target.name} · ${distance === null ? '…' : formatDistance(distance)}`}
      </span>
      <button type="button" onClick={onStop} aria-label="Arrêter de cibler" className={`rounded-full px-2 text-lg ${arrived ? 'text-white' : 'text-gray-500'}`}>
        ✕
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Remplacer `web/src/components/WaypointSheet.tsx`**

```tsx
import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { formatCoords, formatDistance } from '../geo/geo';
import { deleteWaypoint, renameWaypoint, type Waypoint } from '../waypoints/waypointStore';

type Props = {
  waypoint: Waypoint;
  distance: number | null;
  isTarget: boolean;
  onToggleTarget: () => void;
  onClose: () => void;
};

export function WaypointSheet({ waypoint, distance, isTarget, onToggleTarget, onClose }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(waypoint.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <BottomSheet title={waypoint.name} onClose={onClose}>
      <p className="text-sm text-gray-500">{formatCoords(waypoint)}</p>
      <p className="mb-3 text-sm text-gray-500">{distance === null ? 'Distance inconnue' : `À ${formatDistance(distance)}`}</p>
      {renaming ? (
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (trimmed) await renameWaypoint(waypoint.id, trimmed);
            setRenaming(false);
          }}
        >
          <input
            aria-label="Nouveau nom"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base"
          />
          <button type="submit" className="rounded-lg bg-emerald-700 px-4 font-medium text-white">
            OK
          </button>
        </form>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onToggleTarget}
            className={`flex-1 rounded-lg py-3 font-medium ${isTarget ? 'bg-gray-100' : 'bg-emerald-700 text-white'}`}
          >
            {isTarget ? 'Ne plus cibler' : 'Cibler'}
          </button>
          <button type="button" onClick={() => setRenaming(true)} className="flex-1 rounded-lg bg-gray-100 py-3 font-medium">
            Renommer
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              await deleteWaypoint(waypoint.id);
              onClose();
            }}
            className={`flex-1 rounded-lg py-3 font-medium ${confirmDelete ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'}`}
          >
            {confirmDelete ? 'Confirmer' : 'Supprimer'}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
```

- [ ] **Step 6: Modifier `web/src/App.tsx`**

- Imports : `import { useTarget } from './target/useTarget';`, `import { TargetArrow } from './components/TargetArrow';`, `import { TargetBanner } from './components/TargetBanner';`
- Après `const heading = useHeading();`, ajouter :
```tsx
  const [targetId, setTargetId] = useTarget();
  const target = waypoints.find((waypoint) => waypoint.id === targetId) ?? null;

  // Cible supprimée (ici ou via la sync) : on arrête de la cibler.
  useEffect(() => {
    if (targetId !== null && waypoints.length > 0 && target === null) setTargetId(null);
  }, [targetId, target, waypoints.length, setTargetId]);
```
- Remplacer l'effet de maintien de l'écran :
```tsx
  // Écran allumé uniquement en Suivi.
  useEffect(() => {
    void callNative('setKeepScreenOn', { on: followMode === 'follow' });
  }, [followMode]);
```
par :
```tsx
  // Écran allumé uniquement en Suivi ou avec une Cible active.
  const keepScreenOn = followMode === 'follow' || target !== null;
  useEffect(() => {
    void callNative('setKeepScreenOn', { on: keepScreenOn });
  }, [keepScreenOn]);
```
- Remplacer `<CompassWarnings heading={heading} active={followMode === 'follow'} />` par :
```tsx
        <CompassWarnings heading={heading} active={keepScreenOn} />
        {map && fix && target && <TargetArrow map={map} fix={fix} target={target} />}
        {target && <TargetBanner target={target} distance={fix ? distanceMeters(fix, target) : null} onStop={() => setTargetId(null)} />}
```
- Remplacer l'élément `<WaypointSheet … />` par :
```tsx
          <WaypointSheet
            key={selected.id}
            waypoint={selected}
            distance={fix ? distanceMeters(fix, selected) : null}
            isTarget={targetId === selected.id}
            onToggleTarget={() => {
              setTargetId(targetId === selected.id ? null : selected.id);
              setSheet(null);
            }}
            onClose={() => setSheet(null)}
          />
```

- [ ] **Step 7: Vérifier types et build**

```bash
cd web && npm run typecheck && npm run build
```
Expected: aucune erreur.

- [ ] **Step 8: Contrôle sur le téléphone** (après accord de l'utilisateur, procédure « lancer en debug »)

Captures `android/build/screens/phase7-task2-<n>.png` :
1. Créer (ou utiliser) un waypoint à 100–500 m, dans une direction connue. Tap dessus → [Cibler] : la feuille se ferme, le bandeau « 🎯 Nom · N m » apparaît en bas à gauche, et une flèche verte orbite autour du point bleu vers le waypoint.
2. Dézoomer/déplacer la carte pour que le waypoint sorte de l'écran : la flèche pointe toujours vers lui.
3. Suivi ◉ : la carte tourne avec le téléphone, et la flèche reste orientée vers le waypoint réel. **L'utilisateur** confirme en regardant dans la direction indiquée.
4. Écran : `timeout 30 adb shell dumpsys window | grep -i KEEP_SCREEN_ON` actif, même après être sorti du Suivi (glisser la carte), tant que la cible est active.
5. Créer un waypoint « Ici » sur sa propre position (tap point bleu → Créer), le cibler : bandeau vert « ✅ Arrivé · Ici » (distance < 10 m). La cible n'est pas arrêtée automatiquement.
6. ✕ sur le bandeau : bandeau et flèche disparaissent. Hors Suivi, le flag KEEP_SCREEN_ON disparaît.
7. Cibler un waypoint, relancer l'app : la cible est toujours active. Supprimer ce waypoint : la cible disparaît.

- [ ] **Step 9: Commit**

```bash
git add web/src
git commit -m "feat(web): cible, flèche en orbite et bandeau de distance"
```
