# Champi Map — Phase 3 : position — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher sa position GPS précise (cercle de précision, satellites), se recentrer ou être suivi avec le bouton ◎, sans Internet, et créer un waypoint « Ma position ».

**Architecture:**
- **Kotlin** : un service au premier plan (`LocationService`) possède `FusedLocationProviderClient` en haute précision : toutes les 5 s quand l'app est visible, toutes les 30 s sinon. Il compte aussi les satellites via `GnssStatus`.
- **`LocationHub`** : un `object` Kotlin qui relie service et activité. L'activité relaie positions et états à la page via `NativeBridge` (phase 2).
- **Navigateur du PC** : le faux bridge utilise `navigator.geolocation`.
- **Web** : la carte (cercle de précision GeoJSON + marqueur HTML), le cycle ◎ Libre / Centré / Suivi (sans rotation, qui arrive en phase 7) et le maintien de l'écran allumé en Suivi.

**Tech Stack:** Phases 1–2 + `com.google.android.gms:play-services-location` 21.4.0.

**Spec:** `docs/mvp.md` (sections Position, Waypoints), glossaire `CONTEXT.md` (Position, Suivi).

**Prérequis:** phase 2 terminée (fichiers `NativeBridge.kt`, `MainActivity.kt` en `ComponentActivity`, `web/src/bridge/*`, `App.tsx` avec `Sheet`/`Panel`).

## Global Constraints

- Nom affiché `Champi Map`, `fr.champimap`, `minSdk 26`, `compileSdk 36`, `targetSdk 36`, portrait. Pas de Leaflet/Compose/AppCompat. AGP 9 sans plugin kotlin-android.
- Termes Minecraft jamais visibles dans l'UI.
- Position : FusedLocationProvider `PRIORITY_HIGH_ACCURACY` + `GnssStatus` (nombre de satellites), cercle de précision sur la carte.
- Fréquence : **5 s** app à l'écran, **30 s** en arrière-plan, toujours en haute précision.
- Service au premier plan avec notification permanente. Il s'arrête quand l'app est balayée des récents (`onTaskRemoved`) ou via le bouton « Stop » de la notification.
- Écran maintenu allumé uniquement en Suivi (la Cible s'ajoute en phase 7). Sinon veille normale.
- Bouton ◎ : Libre → tap → Centré (recentre une fois, nord en haut, zoom conservé) → tap → Suivi ◉ (suit la position, sans rotation en phase 3) → tap → Centré. Déplacer la carte au doigt → Libre.
- Tap sur sa position → feuille : coordonnées, précision (± N m), [Créer un waypoint ici] avec nom prérempli « Ma position ».
- Liste des waypoints triée par distance **à la position GPS** quand elle est connue (sinon au centre de la carte). Feuille d'un waypoint : distance affichée quand la position est connue.
- Le GPS ne demande pas Internet : tout doit marcher en mode avion.
- Pas de tests automatisés. npm uniquement. Gradle : `export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11";`. `adb` toujours préfixé par `timeout 30`.
- **Téléphone : prévenir l'utilisateur et attendre son accord explicite avant toute commande qui installe, lance ou modifie l'état du téléphone** (`adb install`, `am start`, `adb reverse`, `pm grant/revoke`, mode avion, `input`). Un sous-agent s'arrête après le build et rend la main (NEEDS_CONTEXT).

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
Captures : `mkdir -p android/build/screens && timeout 30 adb exec-out screencap -p > android/build/screens/<nom>.png`, lues avec Read. Taille d'écran : `timeout 30 adb shell wm size`. Tap : `timeout 30 adb shell input tap X Y`. Glisser : `timeout 30 adb shell input swipe X1 Y1 X2 Y2 300`. Arrêter Vite avant le rapport.

## File Structure

```
android/app/
├── build.gradle.kts                           + play-services-location
└── src/main/
    ├── AndroidManifest.xml                    + permissions localisation/notification, service, singleTop
    └── java/fr/champimap/
        ├── LocationHub.kt                     état partagé service ↔ activité (dernière position, satellites, visibilité)
        ├── LocationService.kt                 service au premier plan : Fused + GnssStatus + notification
        └── MainActivity.kt                    + permissions, startLocation, setKeepScreenOn, relais des événements
web/src/
├── bridge/bridge.ts                           + méthodes startLocation/setKeepScreenOn, événements location/satellites/locationState
├── bridge/fakeNative.ts                       + navigator.geolocation
├── location/useLocation.ts                    hook : position, satellites, état du GPS
├── geo/geo.ts                                 + circlePolygon
├── components/
│   ├── GpsBadge.tsx                           « ± 8 m · 12 sat. » ou état du GPS
│   ├── PositionLayer.tsx                      cercle de précision + point bleu cliquable
│   ├── LocateButton.tsx                       bouton ◎ / ◉
│   ├── PositionSheet.tsx                      feuille « Ma position »
│   └── WaypointSheet.tsx                      + distance
└── App.tsx                                    + cycle Libre/Centré/Suivi, écran allumé, distances
```

---

### Task 1: Position GPS de bout en bout (service Kotlin → page)

**Files:**
- Create: `android/app/src/main/java/fr/champimap/LocationHub.kt`, `android/app/src/main/java/fr/champimap/LocationService.kt`, `web/src/location/useLocation.ts`, `web/src/components/GpsBadge.tsx`
- Modify: `android/app/build.gradle.kts`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/fr/champimap/MainActivity.kt`, `web/src/bridge/bridge.ts`, `web/src/bridge/fakeNative.ts`, `web/src/App.tsx`

**Interfaces:**
- Consumes: `NativeBridge.handle/emit/install` (phase 2), `callNative`, `onNative`, `emitFake`.
- Produces:
  - Kotlin `object LocationHub` : `lastFix: Location?`, `satellites: Int`, `running: Boolean`, `appVisible: Boolean`, `addListener(Listener)`, `removeListener(Listener)`, `addVisibilityListener((Boolean) -> Unit)`, `removeVisibilityListener(...)`, `publishFix(Location)`, `publishSatellites(Int)`, `setRunning(Boolean)`, `setAppVisible(Boolean)`. `interface LocationHub.Listener { onFix(fix: Location); onSatellites(count: Int); onRunningChanged(running: Boolean) }` (méthodes par défaut vides). La phase 4 (pré-téléchargement) et la phase 7 (déclinaison) liront `lastFix`.
  - `LocationService.hasLocationPermission(context): Boolean`, `LocationService.ACTION_STOP`.
  - TS `BridgeMethods` + `startLocation: { params: Record<string, never>; result: null }`, `setKeepScreenOn: { params: { on: boolean }; result: null }`.
  - TS `BridgeEvents` + `location: LocationFix`, `satellites: { count: number }`, `locationState: { running: boolean; permissionDenied: boolean }`. `type LocationFix = { latitude: number; longitude: number; accuracy: number | null; time: number }` exporté par `bridge.ts`.
  - `useLocation(): { fix: LocationFix | null; satellites: number | null; running: boolean; permissionDenied: boolean; start: () => void }`.

- [ ] **Step 1: Ajouter la dépendance dans `android/app/build.gradle.kts`**

Dans le bloc `dependencies`, ajouter :
```kotlin
    implementation("com.google.android.gms:play-services-location:21.4.0")
```

- [ ] **Step 2: Remplacer `android/app/src/main/AndroidManifest.xml`**

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application
        android:label="Champi Map"
        android:theme="@android:style/Theme.DeviceDefault.Light.NoActionBar">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:screenOrientation="portrait"
            android:configChanges="orientation|screenSize|smallestScreenSize|screenLayout|keyboard|keyboardHidden|density|fontScale|locale|layoutDirection|uiMode">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <service
            android:name=".LocationService"
            android:exported="false"
            android:foregroundServiceType="location" />
    </application>
</manifest>
```

- [ ] **Step 3: Créer `android/app/src/main/java/fr/champimap/LocationHub.kt`**

```kotlin
package fr.champimap

import android.location.Location
import java.util.concurrent.CopyOnWriteArraySet

/** État de localisation partagé entre le service et l'activité (même processus). */
object LocationHub {

    interface Listener {
        fun onFix(fix: Location) {}
        fun onSatellites(count: Int) {}
        fun onRunningChanged(running: Boolean) {}
    }

    private val listeners = CopyOnWriteArraySet<Listener>()
    private val visibilityListeners = CopyOnWriteArraySet<(Boolean) -> Unit>()

    @Volatile var lastFix: Location? = null
        private set

    @Volatile var satellites: Int = 0
        private set

    @Volatile var running: Boolean = false
        private set

    @Volatile var appVisible: Boolean = false
        private set

    fun addListener(listener: Listener) {
        listeners.add(listener)
    }

    fun removeListener(listener: Listener) {
        listeners.remove(listener)
    }

    fun addVisibilityListener(listener: (Boolean) -> Unit) {
        visibilityListeners.add(listener)
    }

    fun removeVisibilityListener(listener: (Boolean) -> Unit) {
        visibilityListeners.remove(listener)
    }

    fun publishFix(fix: Location) {
        lastFix = fix
        listeners.forEach { it.onFix(fix) }
    }

    fun publishSatellites(count: Int) {
        satellites = count
        listeners.forEach { it.onSatellites(count) }
    }

    fun setRunning(value: Boolean) {
        running = value
        listeners.forEach { it.onRunningChanged(value) }
    }

    fun setAppVisible(visible: Boolean) {
        appVisible = visible
        visibilityListeners.forEach { it(visible) }
    }
}
```

- [ ] **Step 4: Créer `android/app/src/main/java/fr/champimap/LocationService.kt`**

```kotlin
package fr.champimap

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.location.GnssStatus
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/**
 * Garde le GPS actif, app visible ou non : haute précision, toutes les 5 s à l'écran, 30 s sinon.
 * S'arrête quand l'app est balayée des récents ou via « Stop » dans la notification.
 */
class LocationService : Service() {

    private lateinit var fused: FusedLocationProviderClient
    private lateinit var locationManager: LocationManager
    private var started = false

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let(LocationHub::publishFix)
        }
    }

    private val gnssCallback = object : GnssStatus.Callback() {
        override fun onSatelliteStatusChanged(status: GnssStatus) {
            LocationHub.publishSatellites((0 until status.satelliteCount).count { status.usedInFix(it) })
        }
    }

    private val onVisibilityChanged: (Boolean) -> Unit = { requestUpdates() }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        fused = LocationServices.getFusedLocationProviderClient(this)
        locationManager = getSystemService(LocationManager::class.java)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP || !hasLocationPermission(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        startInForeground()
        if (!started) {
            started = true
            LocationHub.addVisibilityListener(onVisibilityChanged)
            requestUpdates()
            registerGnssStatus()
            LocationHub.setRunning(true)
        }
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        stopSelf()
    }

    override fun onDestroy() {
        if (started) {
            fused.removeLocationUpdates(locationCallback)
            locationManager.unregisterGnssStatusCallback(gnssCallback)
            LocationHub.removeVisibilityListener(onVisibilityChanged)
            LocationHub.setRunning(false)
        }
        super.onDestroy()
    }

    @SuppressLint("MissingPermission")
    private fun requestUpdates() {
        val intervalMs = if (LocationHub.appVisible) VISIBLE_INTERVAL_MS else BACKGROUND_INTERVAL_MS
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
            .setMinUpdateIntervalMillis(intervalMs)
            .build()
        fused.removeLocationUpdates(locationCallback)
        fused.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
    }

    @SuppressLint("MissingPermission")
    private fun registerGnssStatus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            locationManager.registerGnssStatusCallback(mainExecutor, gnssCallback)
        } else {
            locationManager.registerGnssStatusCallback(gnssCallback, Handler(Looper.getMainLooper()))
        }
    }

    private fun startInForeground() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Position", NotificationManager.IMPORTANCE_LOW),
        )
        val openApp = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            this, 1,
            Intent(this, LocationService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Champi Map utilise ta position")
            .setContentIntent(openApp)
            .setOngoing(true)
            .addAction(
                Notification.Action.Builder(
                    Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel), "Stop", stop,
                ).build(),
            )
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    companion object {
        const val ACTION_STOP = "fr.champimap.action.STOP_LOCATION"
        private const val CHANNEL_ID = "location"
        private const val NOTIFICATION_ID = 1
        private const val VISIBLE_INTERVAL_MS = 5_000L
        private const val BACKGROUND_INTERVAL_MS = 30_000L

        fun hasLocationPermission(context: Context): Boolean =
            context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }
}
```

- [ ] **Step 5: Remplacer `android/app/src/main/java/fr/champimap/MainActivity.kt`**

```kotlin
package fr.champimap

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.location.Location
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var bridge: NativeBridge
    private var locationPermissionDenied = false

    // Activé par la page quand une feuille ou un panneau est ouvert : retour = fermer, pas quitter.
    private val backCallback = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            bridge.emit("back", null)
        }
    }

    private val locationListener = object : LocationHub.Listener {
        override fun onFix(fix: Location) = bridge.emit("location", fix.toJson())
        override fun onSatellites(count: Int) = bridge.emit("satellites", JSONObject().put("count", count))
        override fun onRunningChanged(running: Boolean) = emitLocationState()
    }

    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        val located = granted[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            granted[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        locationPermissionDenied = !located
        if (located) startLocationService()
        emitLocationState()
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
                ): Boolean = !isSameOrigin(request.url)
            }
        }

        bridge = NativeBridge(this, webView)
        bridge.handle("setBackEnabled") { params ->
            val enabled = params.getBoolean("enabled")
            runOnUiThread { backCallback.isEnabled = enabled }
            null
        }
        bridge.handle("startLocation") {
            runOnUiThread { startLocation() }
            null
        }
        bridge.handle("setKeepScreenOn") { params ->
            val on = params.getBoolean("on")
            runOnUiThread {
                if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
            null
        }
        bridge.install()
        onBackPressedDispatcher.addCallback(this, backCallback)

        setContentView(wrapInsideSystemBars(webView))
        // Fond blanc sous les barres système : sans ça, les icônes système restent blanches et disparaissent.
        // Le DecorView doit exister (donc après setContentView) pour que window.insetsController soit non nul.
        setLightSystemBarIcons()
        webView.loadUrl(BuildConfig.WEB_URL)
    }

    override fun onStart() {
        super.onStart()
        LocationHub.addListener(locationListener)
        LocationHub.setAppVisible(true)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onStop() {
        LocationHub.setAppVisible(false)
        LocationHub.removeListener(locationListener)
        super.onStop()
    }

    override fun onDestroy() {
        bridge.shutdown()
        webView.destroy()
        super.onDestroy()
    }

    private fun startLocation() {
        if (LocationService.hasLocationPermission(this)) {
            locationPermissionDenied = false
            startLocationService()
        } else {
            val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) permissions += Manifest.permission.POST_NOTIFICATIONS
            permissionLauncher.launch(permissions.toTypedArray())
        }
        // La page vient peut-être de (re)charger : on lui renvoie ce qu'on sait déjà.
        LocationHub.lastFix?.let { bridge.emit("location", it.toJson()) }
        emitLocationState()
    }

    private fun startLocationService() {
        startForegroundService(Intent(this, LocationService::class.java))
    }

    private fun emitLocationState() {
        bridge.emit(
            "locationState",
            JSONObject().put("running", LocationHub.running).put("permissionDenied", locationPermissionDenied),
        )
    }

    private fun Location.toJson(): JSONObject = JSONObject()
        .put("latitude", latitude)
        .put("longitude", longitude)
        .put("accuracy", if (hasAccuracy()) accuracy.toDouble() else JSONObject.NULL)
        .put("time", time)

    private fun setLightSystemBarIcons() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.setSystemBarsAppearance(
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
            )
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility =
                window.decorView.systemUiVisibility or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        }
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

    // Comparaison stricte scheme+host+port (pas de préfixe texte : évite les contournements du type
    // "http://localhost:5173.evil.com/" ou "http://localhost:51730/").
    private fun isSameOrigin(url: Uri): Boolean =
        url.scheme == webOriginUri.scheme && url.host == webOriginUri.host && url.port == webOriginUri.port

    companion object {
        // Parsée une seule fois : réutilisée à chaque navigation.
        private val webOriginUri: Uri = Uri.parse(BuildConfig.WEB_ORIGIN)
    }
}
```

- [ ] **Step 6: Remplacer `web/src/bridge/bridge.ts`**

```ts
import { createFakeNative } from './fakeNative';

export type LocationFix = { latitude: number; longitude: number; accuracy: number | null; time: number };

/** Méthodes exposées par Kotlin : paramètres et résultat. */
export type BridgeMethods = {
  setBackEnabled: { params: { enabled: boolean }; result: null };
  startLocation: { params: Record<string, never>; result: null };
  setKeepScreenOn: { params: { on: boolean }; result: null };
};

/** Événements poussés par Kotlin. */
export type BridgeEvents = {
  back: null;
  location: LocationFix;
  satellites: { count: number };
  locationState: { running: boolean; permissionDenied: boolean };
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

- [ ] **Step 7: Remplacer `web/src/bridge/fakeNative.ts`**

```ts
type Receive = (raw: string) => void;
type FakeHandler = (params: Record<string, unknown>) => unknown;

let receiveRef: Receive | null = null;
let watchId: number | null = null;

/** Pousse un événement comme le ferait Kotlin (navigateur du PC uniquement). */
export function emitFake(event: string, payload: unknown): void {
  receiveRef?.(JSON.stringify({ event, payload }));
}

const handlers: Record<string, FakeHandler> = {
  setBackEnabled: () => null,
  setKeepScreenOn: () => null,
  startLocation: () => {
    if (watchId !== null || !('geolocation' in navigator)) return null;
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        emitFake('location', {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          time: position.timestamp,
        });
        emitFake('locationState', { running: true, permissionDenied: false });
      },
      (error) => {
        emitFake('locationState', { running: false, permissionDenied: error.code === error.PERMISSION_DENIED });
      },
      { enableHighAccuracy: true },
    );
    return null;
  },
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

- [ ] **Step 8: Créer `web/src/location/useLocation.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';
import { callNative, onNative, type LocationFix } from '../bridge/bridge';

export type LocationState = {
  fix: LocationFix | null;
  satellites: number | null;
  running: boolean;
  permissionDenied: boolean;
  start: () => void;
};

/** Position GPS fournie par Android (ou par le navigateur du PC). Démarre le GPS au montage. */
export function useLocation(): LocationState {
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [satellites, setSatellites] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const start = useCallback(() => {
    void callNative('startLocation', {});
  }, []);

  useEffect(() => {
    const unsubscribers = [
      onNative('location', setFix),
      onNative('satellites', ({ count }) => setSatellites(count)),
      onNative('locationState', (state) => {
        setRunning(state.running);
        setPermissionDenied(state.permissionDenied);
      }),
    ];
    start();
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [start]);

  return { fix, satellites, running, permissionDenied, start };
}
```

- [ ] **Step 9: Créer `web/src/components/GpsBadge.tsx`**

```tsx
import type { LocationState } from '../location/useLocation';

export function GpsBadge({ location }: { location: LocationState }) {
  let text: string;
  if (location.permissionDenied) text = 'Position refusée · touche ◎';
  else if (!location.running) text = 'GPS arrêté · touche ◎';
  else if (!location.fix) text = 'Recherche GPS…';
  else {
    const accuracy = location.fix.accuracy === null ? '± ?' : `± ${Math.round(location.fix.accuracy)} m`;
    text = location.satellites === null ? accuracy : `${accuracy} · ${location.satellites} sat.`;
  }
  return (
    <div className="pointer-events-none absolute top-2 left-2 z-10 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-700 shadow">
      {text}
    </div>
  );
}
```

- [ ] **Step 10: Afficher le badge dans `web/src/App.tsx`**

Ajouter l'import et le hook, et rendre le badge dans la zone carte. Modifications exactes :
- en tête : `import { GpsBadge } from './components/GpsBadge';` et `import { useLocation } from './location/useLocation';`
- dans `App()`, juste après `const waypoints = useWaypoints();` : `const location = useLocation();`
- dans le JSX, juste après `<MapView onMapReady={setMap} />` : `<GpsBadge location={location} />`

- [ ] **Step 11: Vérifier types et builds**

```bash
cd web && npm run typecheck && npm run build
cd ../android && export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11" && ./gradlew assembleDebug
```
Expected: aucune erreur, `BUILD SUCCESSFUL`.

- [ ] **Step 12: Contrôle sur le téléphone** (après accord de l'utilisateur)

1. Retirer d'abord toute permission restante : `timeout 30 adb shell pm revoke fr.champimap android.permission.ACCESS_FINE_LOCATION` et `… ACCESS_COARSE_LOCATION` (ignorer les erreurs si l'app n'est pas installée), puis procédure « lancer en debug ».
2. Capture : la boîte de dialogue de permission de localisation est affichée. **Demander à l'utilisateur de choisir « Lorsque vous utilisez l'appli » + « Précise »** (ne pas taper à sa place), puis accepter les notifications.
3. Capture après ~20 s près d'une fenêtre : badge `± N m · K sat.` (ou `Recherche GPS…` si aucun fix en intérieur : le signaler, sans considérer ça comme un échec).
4. Notification « Champi Map utilise ta position » présente : `timeout 30 adb shell dumpsys notification --noredact | grep -i "champi"`.
5. Intervalle : `timeout 30 adb shell dumpsys location | grep -i -A3 fr.champimap` montre une requête `interval=5s` (ou `5000`). Presser Home (`input keyevent 3`), attendre 5 s, relancer la commande : `interval=30s`. Revenir dans l'app (`am start`).
6. Stop : `timeout 30 adb shell am startservice -a fr.champimap.action.STOP_LOCATION -n fr.champimap/.LocationService`. Capture : badge `GPS arrêté · touche ◎`, notification disparue.

- [ ] **Step 13: Commit**

```bash
git add android/app/build.gradle.kts android/app/src/main web/src
git commit -m "feat: position GPS via service Android au premier plan"
```

---

### Task 2: Position sur la carte, bouton ◎ et « Ma position »

**Files:**
- Create: `web/src/components/PositionLayer.tsx`, `web/src/components/LocateButton.tsx`, `web/src/components/PositionSheet.tsx`
- Modify: `web/src/geo/geo.ts`, `web/src/components/WaypointSheet.tsx`, `web/src/App.tsx`

**Interfaces:**
- Consumes: `useLocation()`, `LocationFix`, `callNative('setKeepScreenOn', {on})` (Task 1), `createWaypoint`, `distanceMeters`, `formatDistance`, `formatCoords`, `BottomSheet`, `Sheet`, `Panel` (phase 2).
- Produces:
  - `geo.ts` + `circlePolygon(center: LatLon, radiusMeters: number, steps?: number): number[][][]` (anneau GeoJSON `[lon, lat]`).
  - `type FollowMode = 'free' | 'centered' | 'follow'` exporté par `LocateButton.tsx`. Props `LocateButton { mode: FollowMode; onPress: () => void }`.
  - `PositionLayer` props `{ map: MapLibreMap; fix: LocationFix | null; onSelect: () => void }`. Il expose le marqueur via la prop optionnelle `onMarker?: (marker: Marker | null) => void`, que la phase 7 utilise pour la rotation.
  - `WaypointSheet` props `{ waypoint: Waypoint; distance: number | null; onClose: () => void }`. La phase 7 ajoute `onTarget`.
  - `Sheet` + variante `{ kind: 'position' }`.

- [ ] **Step 1: Ajouter `circlePolygon` à la fin de `web/src/geo/geo.ts`**

```ts
/** Anneau de polygone GeoJSON ([lon, lat]) approchant un cercle de `radiusMeters` autour de `center`. */
export function circlePolygon(center: LatLon, radiusMeters: number, steps = 48): number[][][] {
  const latRadius = radiusMeters / 111_320;
  const lonRadius = radiusMeters / (111_320 * Math.cos(toRadians(center.latitude)));
  const ring: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    ring.push([center.longitude + lonRadius * Math.cos(angle), center.latitude + latRadius * Math.sin(angle)]);
  }
  return [ring];
}
```

- [ ] **Step 2: Créer `web/src/components/PositionLayer.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { Marker, type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import type { LocationFix } from '../bridge/bridge';
import { circlePolygon } from '../geo/geo';

type Props = {
  map: MapLibreMap;
  fix: LocationFix | null;
  onSelect: () => void;
  onMarker?: (marker: Marker | null) => void;
};

const SOURCE_ID = 'position-accuracy';
const EMPTY = { type: 'FeatureCollection', features: [] } as const;

/** Point bleu cliquable + cercle de précision (en mètres, suit le zoom). */
export function PositionLayer({ map, fix, onSelect, onMarker }: Props) {
  const markerRef = useRef<Marker | null>(null);
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
    element.className = 'block h-5 w-5 rounded-full border-[3px] border-white bg-blue-600 shadow-[0_0_0_3px_rgba(37,99,235,0.3)]';
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      onSelectRef.current();
    });
    const marker = new Marker({ element });
    markerRef.current = marker;
    onMarker?.(marker);

    return () => {
      marker.remove();
      markerRef.current = null;
      onMarker?.(null);
      map.off('load', addLayers);
    };
    // onMarker est stable (setter d'état) dans App.
  }, [map, onMarker]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !fix) return;
    marker.setLngLat([fix.longitude, fix.latitude]).addTo(map);
    const source = map.getSource<GeoJSONSource>(SOURCE_ID);
    if (!source) return;
    source.setData(
      fix.accuracy === null
        ? EMPTY
        : { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: circlePolygon(fix, fix.accuracy) } },
    );
  }, [map, fix]);

  return null;
}
```

Si `map.getSource<GeoJSONSource>` n'accepte pas de paramètre de type dans MapLibre 6.9 (erreur TS « Expected 0 type arguments »), écrire `map.getSource(SOURCE_ID) as GeoJSONSource | undefined`.

- [ ] **Step 3: Créer `web/src/components/LocateButton.tsx`**

```tsx
export type FollowMode = 'free' | 'centered' | 'follow';

type Props = {
  mode: FollowMode;
  onPress: () => void;
};

const LABELS: Record<FollowMode, string> = {
  free: 'Me localiser',
  centered: 'Suivre ma position',
  follow: 'Arrêter le suivi',
};

export function LocateButton({ mode, onPress }: Props) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={LABELS[mode]}
      className={`absolute right-3 bottom-4 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-white text-3xl shadow-lg ${
        mode === 'free' ? 'text-gray-600' : 'text-blue-600'
      }`}
    >
      {mode === 'follow' ? '◉' : '◎'}
    </button>
  );
}
```

- [ ] **Step 4: Créer `web/src/components/PositionSheet.tsx`**

```tsx
import { BottomSheet } from './BottomSheet';
import type { LocationFix } from '../bridge/bridge';
import { formatCoords } from '../geo/geo';

type Props = {
  fix: LocationFix;
  onCreateWaypoint: () => void;
  onClose: () => void;
};

export function PositionSheet({ fix, onCreateWaypoint, onClose }: Props) {
  return (
    <BottomSheet title="Ma position" onClose={onClose}>
      <p className="text-sm text-gray-500">{formatCoords(fix)}</p>
      <p className="mb-3 text-sm text-gray-500">Précision : {fix.accuracy === null ? 'inconnue' : `± ${Math.round(fix.accuracy)} m`}</p>
      <button type="button" onClick={onCreateWaypoint} className="w-full rounded-lg bg-emerald-700 py-3 font-medium text-white">
        Créer un waypoint ici
      </button>
    </BottomSheet>
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
  onClose: () => void;
};

export function WaypointSheet({ waypoint, distance, onClose }: Props) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(waypoint.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  return (
    <BottomSheet title={waypoint.name} onClose={onClose}>
      <p className="text-sm text-gray-500">{formatCoords(waypoint)}</p>
      <p className="mb-3 text-sm text-gray-500">{distance === null ? 'Distance inconnue' : `À ${formatDistance(distance)}`}</p>
      {renaming ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            setBusy(true);
            setError(false);
            try {
              await renameWaypoint(waypoint.id, trimmed);
              setRenaming(false);
              setBusy(false);
            } catch (err) {
              console.error('Renommage du waypoint impossible', err);
              setError(true);
              setBusy(false);
            }
          }}
        >
          <div className="flex gap-2">
            <input
              aria-label="Nouveau nom"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base"
            />
            <button type="submit" disabled={busy} className="rounded-lg bg-emerald-700 px-4 font-medium text-white disabled:opacity-60">
              OK
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">Enregistrement impossible sur l'appareil.</p>}
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button type="button" onClick={() => setRenaming(true)} className="flex-1 rounded-lg bg-gray-100 py-3 font-medium">
              Renommer
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                setBusy(true);
                setError(false);
                try {
                  await deleteWaypoint(waypoint.id);
                  onClose();
                } catch (err) {
                  console.error('Suppression du waypoint impossible', err);
                  setError(true);
                  setBusy(false);
                }
              }}
              className={`flex-1 rounded-lg py-3 font-medium disabled:opacity-60 ${confirmDelete ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'}`}
            >
              {confirmDelete ? 'Confirmer' : 'Supprimer'}
            </button>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">Enregistrement impossible sur l'appareil.</p>}
        </div>
      )}
    </BottomSheet>
  );
}
```

- [ ] **Step 6: Remplacer `web/src/App.tsx`**

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
import { GpsBadge } from './components/GpsBadge';
import { PositionLayer } from './components/PositionLayer';
import { PositionSheet } from './components/PositionSheet';
import { LocateButton, type FollowMode } from './components/LocateButton';
import { useLongPressViseur } from './map/useLongPressViseur';
import { useWaypoints } from './waypoints/useWaypoints';
import { useLocation } from './location/useLocation';
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

  // Déplacer la carte au doigt quitte Centré/Suivi.
  useEffect(() => {
    if (!map) return;
    const onDragStart = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) setFollowMode('free');
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
    void callNative('setKeepScreenOn', { on: followMode === 'follow' });
  }, [followMode]);

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
        {map && <PositionLayer map={map} fix={fix} onSelect={() => setSheet({ kind: 'position' })} />}
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
```

Note : `setSheet({ kind: 'create', position: fix, … })` passe un `LocationFix` là où `LatLon` est attendu. C'est valide par typage structurel, et la position est figée au moment du tap.

- [ ] **Step 7: Vérifier types et build**

```bash
cd web && npm run typecheck && npm run build
```
Expected: aucune erreur.

- [ ] **Step 8: Contrôle sur le téléphone** (après accord de l'utilisateur, procédure « lancer en debug »)

Captures `android/build/screens/phase3-task2-<n>.png` :
1. Point bleu + cercle de précision visibles si un fix est disponible.
2. Glisser la carte loin (`input swipe`), puis tap ◎ : la carte revient sur le point bleu, nord en haut, bouton bleu ◎.
3. Tap ◎ : bouton ◉. `timeout 30 adb shell dumpsys window | grep -i KEEP_SCREEN_ON` (ou `dumpsys power | grep -i "screen_bright\|FULL_WAKE"`) montre le flag actif.
4. Glisser la carte : le bouton redevient ◎ gris et le flag KEEP_SCREEN_ON disparaît.
5. Tap sur le point bleu : feuille « Ma position » avec précision. [Créer un waypoint ici] : feuille de création préremplie « Ma position ». [Créer] : un 📍 « Ma position » apparaît au point bleu.
6. Tap sur ce 📍 : la feuille affiche « À N m ».
7. **Mode avion** : demander à l'utilisateur de l'activer à la main (ou, avec son accord, `timeout 30 adb shell cmd connectivity airplane-mode enable`). Relancer l'app. Après ≤ 60 s près d'une fenêtre, le point bleu apparaît et ◎ recentre. Puis **désactiver le mode avion** et vérifier `settings get global airplane_mode_on` = `0`.

- [ ] **Step 9: Commit**

```bash
git add web/src
git commit -m "feat(web): position sur la carte, bouton ◎ et suivi"
```
