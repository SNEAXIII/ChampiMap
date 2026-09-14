# Champi Map — Phase 2 : waypoints locaux — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer, voir, renommer, supprimer et retrouver des waypoints stockés sur le téléphone. Le bouton retour Android ferme feuilles et panneaux.

**Architecture:**
- **Coquille Android durcie** : `ComponentActivity`, marges système appliquées par Kotlin, navigation verrouillée sur l'origine de l'app.
- **Canal page ↔ Kotlin minimal** (`NativeBridge`, via `WebViewCompat.addWebMessageListener` limité à l'origine de l'app), avec son équivalent factice dans le navigateur. Premier usage : le bouton retour.
- **Waypoints** : 100 % TypeScript, stockés en IndexedDB (`idb`), affichés en marqueurs HTML MapLibre. Création par appui long avec viseur.

**Tech Stack:** Phase 1 (Vite 8.3, React 19.3, TS 7.0, Tailwind 4.3, MapLibre 6.9, AGP 9.4, Gradle 9.7.1) + `idb` 8.0.3, `androidx.activity:activity` 1.13.0.

**Spec:** `docs/mvp.md` (sections Waypoints, Développement), glossaire `CONTEXT.md`.

**Prérequis:** phase 1 fusionnée dans `main` (y compris la vérification du rechargement à chaud demandée par la revue finale de la phase 1).

## Global Constraints

- Nom affiché : `Champi Map`. `applicationId`/`namespace` : `fr.champimap`. Android `minSdk 26`, `compileSdk 36`, `targetSdk 36`, portrait.
- Pas de Leaflet, pas de Compose, pas d'AppCompat. `androidx.activity` (ComponentActivity) est autorisé.
- AGP 9 : pas de plugin `org.jetbrains.kotlin.android`, pas de `kotlinOptions`.
- MapLibre 6 : imports nommés uniquement (`import { Map as MapLibreMap, Marker } from 'maplibre-gl'`).
- Termes Minecraft jamais visibles dans l'UI. Libellés : 📱 « Sur l'appareil » / ☁️ « Sauvegardé ».
- Waypoint = nom, latitude, longitude, `id` UUID généré côté client, `created_at`, `updated_at`, `deleted_at` (suppression logique), état local/synchronisé. Noms en double autorisés.
- Appui long ~0,5 s → vibration + viseur ~60 px au-dessus du doigt, la carte ne glisse plus ; relâcher = feuille [Créer] [Annuler], nom prérempli avec la date ; pas de défilement au bord.
- Tap sur un waypoint → feuille : nom, coordonnées, [Renommer] [Supprimer]. [Cibler] et la distance arrivent en phases 3 et 7.
- Liste : triée par distance, recherche par nom, ligne = nom + distance + 📱/☁️, tap = carte centrée + feuille.
- Origines figées : `http://localhost:5173` (debug) et `https://appassets.androidplatform.net` (release). IndexedDB est rangé par origine : les waypoints créés en debug n'apparaissent pas en release, c'est attendu.
- Pas de tests automatisés (spec). Vérification = `npm run typecheck`, build, puis contrôle sur le téléphone.
- npm uniquement (pnpm cassé). Gradle : préfixer par `export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11";`. Chaque commande `adb` préfixée par `timeout 30`.
- **Téléphone : prévenir l'utilisateur et attendre son accord explicite avant toute commande qui installe, lance ou modifie l'état du téléphone** (`adb install`, `adb shell am start`, `adb reverse`, mode avion, `adb shell input`). Les lectures (`adb devices`, captures d'écran d'une app déjà lancée par accord) sont permises. Un sous-agent s'arrête après le build et rend la main avec le statut NEEDS_CONTEXT.

## Procédure « lancer en debug sur le téléphone » (référencée par les tâches)

Après accord de l'utilisateur :
```bash
cd web && npm run dev                      # en arrière-plan, depuis X:/Dev/Perso/champibheu/web
cd X:/Dev/Perso/champibheu
export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11"; (cd android && ./gradlew assembleDebug)
timeout 30 adb reverse tcp:5173 tcp:5173
timeout 60 adb install -r android/app/build/outputs/apk/debug/app-debug.apk
timeout 30 adb shell am force-stop fr.champimap
timeout 30 adb shell am start -n fr.champimap/.MainActivity
```
Captures : `timeout 30 adb exec-out screencap -p > android/build/screens/<nom>.png` (créer le dossier ; `android/build/` est ignoré par git), puis les lire avec l'outil Read. Taille d'écran pour calculer des coordonnées de tap : `timeout 30 adb shell wm size`. Appui long simulé : `timeout 30 adb shell input swipe X Y X Y 900`. Tap : `timeout 30 adb shell input tap X Y`. Texte : `timeout 30 adb shell input text "Mot"`. Retour : `timeout 30 adb shell input keyevent 4`. Arrêter le serveur Vite avant de rendre le rapport.

## File Structure

```
android/
├── gradle/wrapper/gradle-wrapper.properties     + distributionSha256Sum
└── app/
    ├── build.gradle.kts                         + WEB_ORIGIN, androidx.activity, garde release
    └── src/main/
        ├── AndroidManifest.xml                  thème clair, VIBRATE, configChanges étendus
        └── java/fr/champimap/
            ├── MainActivity.kt                  ComponentActivity, marges, retour, garde navigation
            └── NativeBridge.kt                  canal page ↔ Kotlin (requêtes + événements)
web/src/
├── index.css                                    + pas de sélection de texte hors champs
├── bridge/
│   ├── bridge.ts                                callNative / onNative, typés
│   └── fakeNative.ts                            équivalent navigateur (Échap = retour)
├── geo/geo.ts                                   distance, formats
├── waypoints/
│   ├── waypointStore.ts                         IndexedDB + cache mémoire + abonnement
│   └── useWaypoints.ts                          hook React
├── map/useLongPressViseur.ts                    appui long → viseur → coordonnées
├── components/
│   ├── MapView.tsx                              + onMapReady, maxPitch 0, attribution repliée
│   ├── BottomSheet.tsx                          feuille générique
│   ├── Viseur.tsx                               réticule + coordonnées
│   ├── CreateWaypointSheet.tsx
│   ├── WaypointSheet.tsx                        détails, renommer, supprimer
│   ├── WaypointMarkers.tsx                      synchronise les marqueurs MapLibre
│   ├── WaypointList.tsx                         liste, recherche, tri par distance
│   └── BottomBar.tsx                            barre du bas
└── App.tsx                                      orchestration des couches
docs/mvp.md                                      + origines figées
```

---

### Task 1: Coquille Android durcie et canal page ↔ Kotlin

**Files:**
- Modify: `android/gradle/wrapper/gradle-wrapper.properties`, `android/app/build.gradle.kts`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/fr/champimap/MainActivity.kt`, `web/src/components/MapView.tsx`, `web/src/index.css`, `docs/mvp.md`
- Create: `android/app/src/main/java/fr/champimap/NativeBridge.kt`, `web/src/bridge/bridge.ts`, `web/src/bridge/fakeNative.ts`

**Interfaces:**
- Consumes: phase 1 (`ign.ts` : `ignStyle`, `START_CENTER`, `START_ZOOM`).
- Produces:
  - Kotlin : `class NativeBridge(activity: Activity, webView: WebView)` avec `fun handle(method: String, handler: (JSONObject) -> Any?)` (exécuté hors thread UI), `fun install()`, `fun emit(event: String, payload: Any?)`, `fun shutdown()`. `BuildConfig.WEB_ORIGIN: String`. Méthode `setBackEnabled {enabled: Boolean}`, événement `back` (payload null).
  - TS : `callNative<M extends keyof BridgeMethods>(method, params): Promise<result>`, `onNative<E extends keyof BridgeEvents>(event, listener): () => void`, `isAndroid: boolean`, types `BridgeMethods`, `BridgeEvents`. `createFakeNative(receive)` retourne `{ postMessage(message: string): void }` et expose `emitFake(event, payload)`.
  - `MapView` : prop `onMapReady: (map: MapLibreMap) => void`.

- [ ] **Step 1: Vérifier le wrapper Gradle**

Dans `android/gradle/wrapper/gradle-wrapper.properties`, ajouter la ligne suivante après `distributionUrl=…` (SHA-256 officiel de `gradle-9.7.1-bin.zip`) :
```properties
distributionSha256Sum=acd53f1edaf02f1a8ff99879f8a34b302661a057d9b063ae9e35b552f804d20a
```

- [ ] **Step 2: Remplacer `android/app/build.gradle.kts`**

```kotlin
plugins {
    // AGP 9 : Kotlin intégré, ne pas ajouter org.jetbrains.kotlin.android.
    id("com.android.application")
}

android {
    namespace = "fr.champimap"
    compileSdk = 36

    defaultConfig {
        applicationId = "fr.champimap"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            // Serveur Vite du PC, exposé sur le téléphone par `adb reverse tcp:5173 tcp:5173`.
            buildConfigField("String", "WEB_URL", "\"http://localhost:5173/\"")
            // Origine figée : elle porte les données locales (IndexedDB) de la build debug.
            buildConfigField("String", "WEB_ORIGIN", "\"http://localhost:5173\"")
        }
        release {
            isMinifyEnabled = false
            // App perso installée à la main : signée avec la clé debug.
            signingConfig = signingConfigs.getByName("debug")
            buildConfigField("String", "WEB_URL", "\"https://appassets.androidplatform.net/assets/web/index.html\"")
            buildConfigField("String", "WEB_ORIGIN", "\"https://appassets.androidplatform.net\"")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.17.0")
    implementation("androidx.activity:activity:1.13.0")
}

// Une release sans app web embarquée afficherait une page blanche.
val embeddedWebIndex = file("src/main/assets/web/index.html")
tasks.configureEach {
    if (name == "mergeReleaseAssets") {
        doFirst {
            check(embeddedWebIndex.exists()) { "App web absente : lancer `npm run build:android` dans web/ avant la release." }
        }
    }
}
```

- [ ] **Step 3: Remplacer `android/app/src/main/AndroidManifest.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.VIBRATE" />

    <application
        android:label="Champi Map"
        android:theme="@android:style/Theme.DeviceDefault.Light.NoActionBar">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="portrait"
            android:configChanges="orientation|screenSize|smallestScreenSize|screenLayout|keyboard|keyboardHidden|density|fontScale|locale|layoutDirection|uiMode">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

- [ ] **Step 4: Créer `android/app/src/main/java/fr/champimap/NativeBridge.kt`**

```kotlin
package fr.champimap

import android.app.Activity
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Canal page ↔ Kotlin.
 * - La page envoie `{id, method, params}` ; Kotlin répond `{id, result}` ou `{id, error}`.
 * - Kotlin pousse des événements `{event, payload}`.
 * Seule l'origine de l'app (BuildConfig.WEB_ORIGIN) peut parler au canal.
 */
class NativeBridge(private val activity: Activity, private val webView: WebView) {

    private val handlers = HashMap<String, (JSONObject) -> Any?>()
    private val worker = Executors.newSingleThreadExecutor()

    @Volatile
    private var replyProxy: JavaScriptReplyProxy? = null

    /** À appeler avant [install]. Le handler s'exécute hors du thread UI. */
    fun handle(method: String, handler: (JSONObject) -> Any?) {
        handlers[method] = handler
    }

    fun install() {
        check(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            "WebView trop ancienne : WEB_MESSAGE_LISTENER indisponible"
        }
        WebViewCompat.addWebMessageListener(webView, JS_OBJECT_NAME, setOf(BuildConfig.WEB_ORIGIN)) { _, message, _, isMainFrame, proxy ->
            val data = message.data
            if (isMainFrame && data != null) {
                replyProxy = proxy
                worker.execute { dispatch(JSONObject(data), proxy) }
            }
        }
    }

    fun emit(event: String, payload: Any?) {
        val message = JSONObject()
            .put("event", event)
            .put("payload", payload ?: JSONObject.NULL)
            .toString()
        activity.runOnUiThread { replyProxy?.postMessage(message) }
    }

    fun shutdown() {
        worker.shutdown()
    }

    private fun dispatch(request: JSONObject, proxy: JavaScriptReplyProxy) {
        val method = request.getString("method")
        val reply = JSONObject().put("id", request.getInt("id"))
        val handler = handlers[method]
        try {
            if (handler == null) {
                reply.put("error", "Méthode inconnue : $method")
            } else {
                reply.put("result", handler(request.optJSONObject("params") ?: JSONObject()) ?: JSONObject.NULL)
            }
        } catch (e: Exception) {
            reply.put("error", e.message ?: e.javaClass.simpleName)
        }
        activity.runOnUiThread { proxy.postMessage(reply.toString()) }
    }

    companion object {
        const val JS_OBJECT_NAME = "champiNative"
    }
}
```

- [ ] **Step 5: Remplacer `android/app/src/main/java/fr/champimap/MainActivity.kt`**

```kotlin
package fr.champimap

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.view.WindowInsets
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.webkit.WebViewAssetLoader

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var bridge: NativeBridge

    // Activé par la page quand une feuille ou un panneau est ouvert : retour = fermer, pas quitter.
    private val backCallback = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            bridge.emit("back", null)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // chrome://inspect sur le PC en debug.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        // Release : sert assets/web/ sur https://appassets.androidplatform.net/assets/web/.
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowContentAccess = false
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

                // La WebView ne quitte jamais la page de l'app.
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean = !request.url.toString().startsWith(BuildConfig.WEB_ORIGIN)
            }
        }

        bridge = NativeBridge(this, webView)
        bridge.handle("setBackEnabled") { params ->
            val enabled = params.getBoolean("enabled")
            runOnUiThread { backCallback.isEnabled = enabled }
            null
        }
        bridge.install()
        onBackPressedDispatcher.addCallback(this, backCallback)

        setContentView(wrapInsideSystemBars(webView))
        webView.loadUrl(BuildConfig.WEB_URL)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        bridge.shutdown()
        webView.destroy()
        super.onDestroy()
    }

    // targetSdk 36 impose l'edge-to-edge : la page reste entre la barre d'état, la barre de navigation et le clavier.
    private fun wrapInsideSystemBars(content: WebView): FrameLayout {
        val root = FrameLayout(this)
        root.setBackgroundColor(Color.WHITE)
        root.addView(
            content,
            ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )
        root.setOnApplyWindowInsetsListener { view, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            } else {
                @Suppress("DEPRECATION")
                view.setPadding(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom,
                )
            }
            insets
        }
        return root
    }
}
```

- [ ] **Step 6: Créer `web/src/bridge/fakeNative.ts`**

```ts
type Receive = (raw: string) => void;
type FakeHandler = (params: Record<string, unknown>) => unknown;

let receiveRef: Receive | null = null;

/** Pousse un événement comme le ferait Kotlin (navigateur du PC uniquement). */
export function emitFake(event: string, payload: unknown): void {
  receiveRef?.(JSON.stringify({ event, payload }));
}

const handlers: Record<string, FakeHandler> = {
  setBackEnabled: () => null,
};

/** Remplace le Kotlin quand l'app tourne dans le navigateur du PC. */
export function createFakeNative(receive: Receive): { postMessage(message: string): void } {
  receiveRef = receive;
  // Échap joue le rôle du bouton retour Android.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') emitFake('back', null);
  });
  return {
    postMessage(message: string) {
      const { id, method, params } = JSON.parse(message) as {
        id: number;
        method: string;
        params: Record<string, unknown>;
      };
      const handler = handlers[method];
      const reply = handler ? { id, result: handler(params) ?? null } : { id, error: `Méthode inconnue : ${method}` };
      setTimeout(() => receive(JSON.stringify(reply)), 0);
    },
  };
}
```

- [ ] **Step 7: Créer `web/src/bridge/bridge.ts`**

```ts
import { createFakeNative } from './fakeNative';

/** Méthodes exposées par Kotlin : paramètres et résultat. */
export type BridgeMethods = {
  setBackEnabled: { params: { enabled: boolean }; result: null };
};

/** Événements poussés par Kotlin. */
export type BridgeEvents = {
  back: null;
};

type NativePort = {
  postMessage(message: string): void;
  addEventListener(type: 'message', listener: (event: { data: string }) => void): void;
};

declare global {
  interface Window {
    champiNative?: NativePort;
  }
}

type IncomingMessage = { id?: number; result?: unknown; error?: string; event?: string; payload?: unknown };

const listeners = new Map<string, Set<(payload: unknown) => void>>();
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
let nextId = 1;

function receive(raw: string): void {
  const message = JSON.parse(raw) as IncomingMessage;
  if (message.event !== undefined) {
    listeners.get(message.event)?.forEach((listener) => listener(message.payload));
    return;
  }
  if (message.id === undefined) return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.error !== undefined) request.reject(new Error(message.error));
  else request.resolve(message.result);
}

export const isAndroid = window.champiNative !== undefined;

const port: { postMessage(message: string): void } = window.champiNative ?? createFakeNative(receive);
window.champiNative?.addEventListener('message', (event) => receive(event.data));

export function callNative<M extends keyof BridgeMethods>(
  method: M,
  params: BridgeMethods[M]['params'],
): Promise<BridgeMethods[M]['result']> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    port.postMessage(JSON.stringify({ id, method, params }));
  });
}

export function onNative<E extends keyof BridgeEvents>(
  event: E,
  listener: (payload: BridgeEvents[E]) => void,
): () => void {
  const set = listeners.get(event) ?? new Set();
  listeners.set(event, set);
  const wrapped = listener as (payload: unknown) => void;
  set.add(wrapped);
  return () => {
    set.delete(wrapped);
  };
}
```

- [ ] **Step 8: Remplacer `web/src/components/MapView.tsx`**

```tsx
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
```

- [ ] **Step 9: Remplacer `web/src/index.css`**

```css
@import "tailwindcss";

html,
body,
#root {
  height: 100%;
  margin: 0;
}

/* Un appui long sur la carte ne doit pas sélectionner de texte ni ouvrir de menu système. */
body {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

input,
textarea {
  user-select: text;
  -webkit-user-select: text;
}
```

- [ ] **Step 10: Brancher `onMapReady` dans `web/src/App.tsx`** (temporaire, remplacé en Task 2)

```tsx
import { MapView } from './components/MapView';

const ignoreMap = () => {};

export function App() {
  return (
    <main className="relative h-full w-full overflow-hidden">
      <MapView onMapReady={ignoreMap} />
    </main>
  );
}
```

- [ ] **Step 11: Documenter les origines figées dans `docs/mvp.md`**

Dans la section `## Développement`, ajouter en dernière puce :
```markdown
- Origines figées : `http://localhost:5173` (debug) et `https://appassets.androidplatform.net` (release). IndexedDB est rangé par origine : changer l'une d'elles rend invisibles les waypoints locaux non synchronisés. Les waypoints créés en debug n'apparaissent pas en release.
```

- [ ] **Step 12: Vérifier types et builds**

```bash
cd web && npm run typecheck && npm run build
cd ../android && export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11" && ./gradlew assembleDebug
```
Expected: pas d'erreur TypeScript, `✓ built`, `BUILD SUCCESSFUL`. Vérifier aussi la garde release : `rm -rf app/src/main/assets/web && ./gradlew assembleRelease` doit échouer avec « App web absente ».

- [ ] **Step 13: Contrôle sur le téléphone** (après accord de l'utilisateur, procédure « lancer en debug »)

Expected sur la capture `android/build/screens/phase2-task1.png` :
- la carte commence **sous** la barre d'état, avec des icônes système sombres sur fond blanc ;
- elle s'arrête **au-dessus** de la barre de navigation ;
- l'attribution est repliée (bouton ⓘ seul).

`timeout 20 adb logcat -d | grep -i -E "chromium|console" | tail -30` : aucune erreur `Uncaught`.

- [ ] **Step 14: Commit**

```bash
git add android/gradle/wrapper/gradle-wrapper.properties android/app/build.gradle.kts android/app/src/main web/src/bridge web/src/components/MapView.tsx web/src/index.css web/src/App.tsx docs/mvp.md
git commit -m "feat: coquille Android durcie et canal page-Kotlin"
```

---

### Task 2: Waypoints sur la carte (créer, voir, renommer, supprimer)

**Files:**
- Create: `web/src/geo/geo.ts`, `web/src/waypoints/waypointStore.ts`, `web/src/waypoints/useWaypoints.ts`, `web/src/map/useLongPressViseur.ts`, `web/src/components/BottomSheet.tsx`, `web/src/components/Viseur.tsx`, `web/src/components/CreateWaypointSheet.tsx`, `web/src/components/WaypointSheet.tsx`, `web/src/components/WaypointMarkers.tsx`
- Modify: `web/src/App.tsx`, `web/src/main.tsx`, `web/package.json` (+ `idb`)

**Interfaces:**
- Consumes: `callNative('setBackEnabled', {enabled})`, `onNative('back', …)`, `MapView.onMapReady` (Task 1).
- Produces:
  - `geo.ts` : `type LatLon = { latitude: number; longitude: number }`, `distanceMeters(a: LatLon, b: LatLon): number`, `formatDistance(meters: number): string`, `formatCoords(p: LatLon): string`.
  - `waypointStore.ts` : `type Waypoint = { id: string; name: string; latitude: number; longitude: number; createdAt: number; updatedAt: number; deletedAt: number | null; dirty: boolean }`, `loadWaypoints(): Promise<void>`, `subscribeWaypoints(listener: () => void): () => void`, `getVisibleWaypoints(): Waypoint[]`, `getAllWaypoints(): Waypoint[]`, `saveWaypoints(changed: Waypoint[]): Promise<void>`, `createWaypoint(name, latitude, longitude): Promise<Waypoint>`, `renameWaypoint(id, name): Promise<void>`, `deleteWaypoint(id): Promise<void>`, `defaultWaypointName(date?: Date): string`. La phase 6 utilisera `getAllWaypoints` et `saveWaypoints`.
  - `useWaypoints(): Waypoint[]` (waypoints non supprimés).
  - `BottomSheet` props `{ title: string; onClose: () => void; children: ReactNode }`.
  - `App.tsx` : état `sheet` de type `Sheet` et `map: MapLibreMap | null`. Les phases suivantes ajoutent des variantes à `Sheet`.

- [ ] **Step 1: Installer `idb`**

```bash
cd web && npm install idb@8.0.3
```

- [ ] **Step 2: Créer `web/src/geo/geo.ts`**

```ts
export type LatLon = { latitude: number; longitude: number };

const EARTH_RADIUS_M = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Distance à vol d'oiseau (haversine), en mètres. */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
}

export function formatCoords({ latitude, longitude }: LatLon): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}
```

- [ ] **Step 3: Créer `web/src/waypoints/waypointStore.ts`**

```ts
import { openDB } from 'idb';

export type Waypoint = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  createdAt: number; // ms depuis epoch
  updatedAt: number;
  deletedAt: number | null; // suppression logique : la sync doit propager la suppression
  dirty: boolean; // true = waypoint local (dernière version pas encore envoyée au cloud)
};

const dbPromise = openDB('champi-map', 1, {
  upgrade(db) {
    db.createObjectStore('waypoints', { keyPath: 'id' });
  },
});

let all: Waypoint[] = [];
let visible: Waypoint[] = [];
const listeners = new Set<() => void>();

function replaceAll(next: Waypoint[]): void {
  all = next;
  visible = next.filter((waypoint) => waypoint.deletedAt === null);
  listeners.forEach((listener) => listener());
}

export async function loadWaypoints(): Promise<void> {
  const db = await dbPromise;
  replaceAll(await db.getAll('waypoints'));
}

export function subscribeWaypoints(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getVisibleWaypoints = (): Waypoint[] => visible;
export const getAllWaypoints = (): Waypoint[] => all;

export async function saveWaypoints(changed: Waypoint[]): Promise<void> {
  const db = await dbPromise;
  const tx = db.transaction('waypoints', 'readwrite');
  await Promise.all([...changed.map((waypoint) => tx.store.put(waypoint)), tx.done]);
  const byId = new Map(all.map((waypoint) => [waypoint.id, waypoint]));
  changed.forEach((waypoint) => byId.set(waypoint.id, waypoint));
  replaceAll([...byId.values()]);
}

export async function createWaypoint(name: string, latitude: number, longitude: number): Promise<Waypoint> {
  const now = Date.now();
  const waypoint: Waypoint = {
    id: crypto.randomUUID(),
    name,
    latitude,
    longitude,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    dirty: true,
  };
  await saveWaypoints([waypoint]);
  return waypoint;
}

async function updateWaypoint(id: string, change: Partial<Pick<Waypoint, 'name' | 'deletedAt'>>): Promise<void> {
  const current = all.find((waypoint) => waypoint.id === id);
  if (!current) return;
  await saveWaypoints([{ ...current, ...change, updatedAt: Date.now(), dirty: true }]);
}

export const renameWaypoint = (id: string, name: string) => updateWaypoint(id, { name });
export const deleteWaypoint = (id: string) => updateWaypoint(id, { deletedAt: Date.now() });

export function defaultWaypointName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Waypoint ${pad(date.getDate())}/${pad(date.getMonth() + 1)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
```

- [ ] **Step 4: Créer `web/src/waypoints/useWaypoints.ts`**

```ts
import { useSyncExternalStore } from 'react';
import { getVisibleWaypoints, subscribeWaypoints, type Waypoint } from './waypointStore';

/** Waypoints non supprimés, mis à jour à chaque modification. */
export function useWaypoints(): Waypoint[] {
  return useSyncExternalStore(subscribeWaypoints, getVisibleWaypoints);
}
```

- [ ] **Step 5: Créer `web/src/map/useLongPressViseur.ts`**

```ts
import { useEffect, useRef, useState } from 'react';
import type { LngLat, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';

const HOLD_MS = 500;
const MOVE_TOLERANCE_PX = 10;
const VISEUR_OFFSET_PX = 60;
const TOUCH_CONTEXTMENU_GUARD_MS = 1500;

export type ViseurState = { x: number; y: number; lngLat: LngLat } | null;

/**
 * Appui long sur la carte : un viseur apparaît au-dessus du doigt et suit ses mouvements,
 * la carte ne glisse plus. Relâcher appelle `onRelease` avec la position du viseur.
 * Sur PC, le clic droit fait la même chose.
 */
export function useLongPressViseur(map: MapLibreMap | null, onRelease: (lngLat: LngLat) => void): ViseurState {
  const [viseur, setViseur] = useState<ViseurState>(null);
  const onReleaseRef = useRef(onRelease);

  useEffect(() => {
    onReleaseRef.current = onRelease;
  });

  useEffect(() => {
    if (!map) return;
    const container = map.getCanvasContainer();
    let timer: number | undefined;
    let start: { x: number; y: number } | null = null;
    let active = false;
    let current: ViseurState = null;
    let lastTouchAt = 0;

    const toLocal = (touch: Touch) => {
      const rect = container.getBoundingClientRect();
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    };

    const place = (point: { x: number; y: number }) => {
      const y = point.y - VISEUR_OFFSET_PX;
      current = { x: point.x, y, lngLat: map.unproject([point.x, y]) };
      setViseur(current);
    };

    const reset = () => {
      window.clearTimeout(timer);
      start = null;
      if (active) {
        active = false;
        map.dragPan.enable();
        map.touchZoomRotate.enable();
      }
      current = null;
      setViseur(null);
    };

    const onTouchStart = (event: TouchEvent) => {
      lastTouchAt = Date.now();
      if (event.touches.length !== 1) {
        reset();
        return;
      }
      start = toLocal(event.touches[0]);
      timer = window.setTimeout(() => {
        if (!start) return;
        active = true;
        map.dragPan.disable();
        map.touchZoomRotate.disable();
        navigator.vibrate?.(30);
        place(start);
      }, HOLD_MS);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!start) return;
      const point = toLocal(event.touches[0]);
      if (active) {
        event.preventDefault();
        place(point);
      } else if (Math.hypot(point.x - start.x, point.y - start.y) > MOVE_TOLERANCE_PX) {
        reset();
      }
    };

    const onTouchEnd = () => {
      const picked = active ? current : null;
      reset();
      if (picked) onReleaseRef.current(picked.lngLat);
    };

    // Clic droit sur PC. Sur Android, un appui long déclenche aussi `contextmenu` : on l'ignore.
    const onContextMenu = (event: MapMouseEvent) => {
      if (Date.now() - lastTouchAt < TOUCH_CONTEXTMENU_GUARD_MS) return;
      onReleaseRef.current(event.lngLat);
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('touchcancel', reset);
    map.on('contextmenu', onContextMenu);

    return () => {
      reset();
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('touchcancel', reset);
      map.off('contextmenu', onContextMenu);
    };
  }, [map]);

  return viseur;
}
```

- [ ] **Step 6: Créer `web/src/components/Viseur.tsx`**

```tsx
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
```

- [ ] **Step 7: Créer `web/src/components/BottomSheet.tsx`**

```tsx
import type { ReactNode } from 'react';

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function BottomSheet({ title, onClose, children }: Props) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-2xl bg-white p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.2)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="truncate text-lg font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-full px-3 py-1 text-xl text-gray-500">
          ✕
        </button>
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 8: Créer `web/src/components/CreateWaypointSheet.tsx`**

```tsx
import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { formatCoords, type LatLon } from '../geo/geo';

type Props = {
  position: LatLon;
  defaultName: string;
  onCreate: (name: string) => void;
  onCancel: () => void;
};

export function CreateWaypointSheet({ position, defaultName, onCreate, onCancel }: Props) {
  const [name, setName] = useState(defaultName);

  return (
    <BottomSheet title="Nouveau waypoint" onClose={onCancel}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(name.trim() || defaultName);
        }}
      >
        <input
          aria-label="Nom du waypoint"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-base"
        />
        <p className="text-sm text-gray-500">{formatCoords(position)}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-lg bg-gray-100 py-3 font-medium">
            Annuler
          </button>
          <button type="submit" className="flex-1 rounded-lg bg-emerald-700 py-3 font-medium text-white">
            Créer
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
```

- [ ] **Step 9: Créer `web/src/components/WaypointSheet.tsx`**

```tsx
import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { formatCoords } from '../geo/geo';
import { deleteWaypoint, renameWaypoint, type Waypoint } from '../waypoints/waypointStore';

type Props = {
  waypoint: Waypoint;
  onClose: () => void;
};

export function WaypointSheet({ waypoint, onClose }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(waypoint.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <BottomSheet title={waypoint.name} onClose={onClose}>
      <p className="mb-3 text-sm text-gray-500">{formatCoords(waypoint)}</p>
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

- [ ] **Step 10: Créer `web/src/components/WaypointMarkers.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { Waypoint } from '../waypoints/waypointStore';

type Props = {
  map: MapLibreMap;
  waypoints: Waypoint[];
  onSelect: (id: string) => void;
};

type Entry = { marker: Marker; label: HTMLElement };

/** Garde un marqueur MapLibre par waypoint visible. */
export function WaypointMarkers({ map, waypoints, onSelect }: Props) {
  const entries = useRef(new Map<string, Entry>());
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const current = entries.current;
    const seen = new Set<string>();
    for (const waypoint of waypoints) {
      seen.add(waypoint.id);
      let entry = current.get(waypoint.id);
      if (!entry) {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'relative';
        element.innerHTML =
          '<span class="block text-3xl leading-none">📍</span>' +
          '<span data-label class="absolute top-full left-1/2 max-w-32 -translate-x-1/2 truncate rounded bg-white/90 px-1 text-xs font-medium shadow"></span>';
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          onSelectRef.current(waypoint.id);
        });
        const label = element.querySelector<HTMLElement>('[data-label]')!;
        const marker = new Marker({ element, anchor: 'bottom' }).setLngLat([waypoint.longitude, waypoint.latitude]).addTo(map);
        entry = { marker, label };
        current.set(waypoint.id, entry);
      }
      entry.label.textContent = waypoint.name;
      entry.marker.setLngLat([waypoint.longitude, waypoint.latitude]);
    }
    for (const [id, entry] of current) {
      if (!seen.has(id)) {
        entry.marker.remove();
        current.delete(id);
      }
    }
  }, [map, waypoints]);

  useEffect(() => {
    const current = entries.current;
    return () => {
      current.forEach((entry) => entry.marker.remove());
      current.clear();
    };
  }, [map]);

  return null;
}
```

- [ ] **Step 11: Remplacer `web/src/App.tsx`**

```tsx
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
```

- [ ] **Step 12: Charger les waypoints au démarrage dans `web/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { loadWaypoints } from './waypoints/waypointStore';

void loadWaypoints();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 13: Vérifier types et build**

```bash
cd web && npm run typecheck && npm run build
```
Expected: aucune erreur, `✓ built`.

- [ ] **Step 14: Contrôle sur le téléphone** (après accord de l'utilisateur, procédure « lancer en debug », APK de Task 1 déjà compatible : pas de rebuild Gradle nécessaire)

Scénario, avec une capture après chaque étape dans `android/build/screens/phase2-task2-<n>.png` :
1. Appui long au centre de l'écran (`input swipe X Y X Y 900`). Pendant l'appui, lancer une capture en parallèle si possible. Au relâchement : feuille « Nouveau waypoint », nom `Waypoint JJ/MM HH:MM`, coordonnées affichées.
2. Tap sur [Créer] : la feuille se ferme, un 📍 avec son nom apparaît à l'endroit du viseur (≈ 60 px au-dessus du point d'appui).
3. Tap sur le 📍 : feuille avec nom, coordonnées, [Renommer] [Supprimer].
4. Retour Android (`input keyevent 4`) : la feuille se ferme, l'app reste au premier plan (`timeout 30 adb shell dumpsys activity activities | grep -i resumed` contient `fr.champimap`).
5. Rouvrir la feuille, [Renommer], taper `Maison`, OK : le libellé du marqueur devient « Maison ».
6. Relancer l'app (`am force-stop` + `am start`) : « Maison » est toujours là (persistance IndexedDB).
7. Rouvrir la feuille, [Supprimer] puis [Confirmer] : le marqueur disparaît.

- [ ] **Step 15: Commit**

```bash
git add web/package.json web/package-lock.json web/src
git commit -m "feat(web): waypoints locaux sur la carte avec viseur"
```

---

### Task 3: Liste des waypoints, recherche et barre du bas

**Files:**
- Create: `web/src/components/WaypointList.tsx`, `web/src/components/BottomBar.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `useWaypoints`, `Waypoint`, `distanceMeters`, `formatDistance`, `callNative`/`onNative` (Tasks 1–2), `Sheet`.
- Produces:
  - `BottomBar` props `{ onOpenWaypoints: () => void }`. Les phases 4 et 5 ajoutent des boutons.
  - `WaypointList` props `{ waypoints: Waypoint[]; reference: LatLon; onPick: (waypoint: Waypoint) => void; onClose: () => void }`.
  - `App` : état `panel: Panel` avec `type Panel = 'waypoints' | null`. Les phases suivantes ajoutent `'settings'` et `'claims'`.

- [ ] **Step 1: Créer `web/src/components/BottomBar.tsx`**

```tsx
type Props = {
  onOpenWaypoints: () => void;
};

function BarButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium text-gray-700">
      <span className="text-xl leading-none">{icon}</span>
      {label}
    </button>
  );
}

export function BottomBar({ onOpenWaypoints }: Props) {
  return (
    <nav className="flex border-t border-gray-200 bg-white">
      <BarButton icon="📍" label="Waypoints" onClick={onOpenWaypoints} />
    </nav>
  );
}
```

- [ ] **Step 2: Créer `web/src/components/WaypointList.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { distanceMeters, formatDistance, type LatLon } from '../geo/geo';
import type { Waypoint } from '../waypoints/waypointStore';

type Props = {
  waypoints: Waypoint[];
  reference: LatLon;
  onPick: (waypoint: Waypoint) => void;
  onClose: () => void;
};

const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function WaypointList({ waypoints, reference, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const needle = normalize(query.trim());
    return waypoints
      .filter((waypoint) => normalize(waypoint.name).includes(needle))
      .map((waypoint) => ({ waypoint, distance: distanceMeters(reference, waypoint) }))
      .sort((a, b) => a.distance - b.distance);
  }, [waypoints, reference, query]);

  return (
    <section className="absolute inset-0 z-30 flex flex-col bg-white">
      <header className="flex items-center gap-2 border-b border-gray-200 p-3">
        <input
          type="search"
          aria-label="Rechercher un waypoint"
          placeholder="Rechercher un waypoint"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base"
        />
        <button type="button" onClick={onClose} aria-label="Fermer" className="px-3 py-2 text-xl text-gray-500">
          ✕
        </button>
      </header>
      {rows.length === 0 ? (
        <p className="p-6 text-center text-gray-500">
          {waypoints.length === 0 ? 'Aucun waypoint. Maintiens le doigt sur la carte pour en créer un.' : 'Aucun résultat.'}
        </p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {rows.map(({ waypoint, distance }) => (
            <li key={waypoint.id}>
              <button
                type="button"
                onClick={() => onPick(waypoint)}
                className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{waypoint.name}</span>
                <span className="text-sm text-gray-500">{formatDistance(distance)}</span>
                <span aria-label={waypoint.dirty ? "Sur l'appareil" : 'Sauvegardé'}>{waypoint.dirty ? '📱' : '☁️'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Remplacer `web/src/App.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import type { LngLat, Map as MapLibreMap } from 'maplibre-gl';
import { MapView } from './components/MapView';
import { WaypointMarkers } from './components/WaypointMarkers';
import { Viseur } from './components/Viseur';
import { CreateWaypointSheet } from './components/CreateWaypointSheet';
import { WaypointSheet } from './components/WaypointSheet';
import { WaypointList } from './components/WaypointList';
import { BottomBar } from './components/BottomBar';
import { useLongPressViseur } from './map/useLongPressViseur';
import { useWaypoints } from './waypoints/useWaypoints';
import { createWaypoint, defaultWaypointName, type Waypoint } from './waypoints/waypointStore';
import { callNative, onNative } from './bridge/bridge';
import type { LatLon } from './geo/geo';

export type Sheet =
  | { kind: 'create'; position: LatLon; defaultName: string }
  | { kind: 'waypoint'; id: string }
  | null;

export type Panel = 'waypoints' | null;

export function App() {
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [listReference, setListReference] = useState<LatLon>({ latitude: 0, longitude: 0 });
  const waypoints = useWaypoints();

  const openCreateSheet = useCallback((lngLat: LngLat) => {
    setSheet({ kind: 'create', position: { latitude: lngLat.lat, longitude: lngLat.lng }, defaultName: defaultWaypointName() });
  }, []);
  const viseur = useLongPressViseur(map, openCreateSheet);

  // Bouton retour Android : ferme la feuille, sinon le panneau.
  const hasLayer = sheet !== null || panel !== null;
  useEffect(() => {
    void callNative('setBackEnabled', { enabled: hasLayer });
  }, [hasLayer]);
  useEffect(
    () =>
      onNative('back', () => {
        if (sheet) setSheet(null);
        else setPanel(null);
      }),
    [sheet],
  );

  const openWaypointList = () => {
    // Phase 2 : tri par distance au centre de la carte (la position GPS arrive en phase 3).
    const center = map?.getCenter();
    if (center) setListReference({ latitude: center.lat, longitude: center.lng });
    setSheet(null);
    setPanel('waypoints');
  };

  const showWaypoint = (waypoint: Waypoint) => {
    setPanel(null);
    map?.flyTo({ center: [waypoint.longitude, waypoint.latitude], zoom: Math.max(map.getZoom(), 15) });
    setSheet({ kind: 'waypoint', id: waypoint.id });
  };

  const selected = sheet?.kind === 'waypoint' ? waypoints.find((waypoint) => waypoint.id === sheet.id) : undefined;

  return (
    <main className="flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden">
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
        {panel === 'waypoints' && (
          <WaypointList waypoints={waypoints} reference={listReference} onPick={showWaypoint} onClose={() => setPanel(null)} />
        )}
      </div>
      <BottomBar onOpenWaypoints={openWaypointList} />
    </main>
  );
}
```

- [ ] **Step 4: Vérifier types et build**

```bash
cd web && npm run typecheck && npm run build
```
Expected: aucune erreur, `✓ built`.

- [ ] **Step 5: Contrôle sur le téléphone** (après accord de l'utilisateur, procédure « lancer en debug »)

Captures `android/build/screens/phase2-task3-<n>.png` :
1. Créer 3 waypoints à des endroits différents (appuis longs + [Créer]), nommés `Alpha`, `Écluse`, `Bravo`.
2. Barre du bas visible sous la carte, au-dessus de la barre de navigation. Tap « Waypoints » : liste plein écran, triée par distance au centre de la carte, chaque ligne avec distance et 📱.
3. Taper `ecl` dans la recherche : seule « Écluse » reste (accents ignorés).
4. Retour Android : la liste se ferme, l'app reste au premier plan.
5. Rouvrir la liste, tap « Alpha » : la liste se ferme, la carte vole vers Alpha et la feuille d'Alpha s'ouvre.
6. **Rechargement à chaud** (sans réinstaller) : changer le libellé `Waypoints` en `Mes waypoints` dans `BottomBar.tsx`. Sous 3 s, la capture montre « Mes waypoints ». Puis remettre `Waypoints` et vérifier que `git diff web/src/components/BottomBar.tsx` est vide. Si le libellé ne change pas, ouvrir `chrome://inspect` (ou lire `adb logcat -d | grep -i vite`), rapporter l'erreur, et ajouter à `web/vite.config.ts` `hmr: { host: 'localhost', port: 5173, clientPort: 5173 }` dans `server`, puis revérifier.

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "feat(web): liste des waypoints avec recherche et barre du bas"
```
