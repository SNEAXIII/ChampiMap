# Champi Map — Phase 4 : cache de chunks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chaque chunk vu est gardé dans un cache SQLite de 500 MB (les plus anciens sont supprimés d'abord) et resservi sans réseau. La région autour de soi est pré-téléchargée : en Wi-Fi par défaut, en données mobiles si l'utilisateur l'active.

**Architecture:**
- **Service des chunks** : la carte demande `https://appassets.androidplatform.net/chunks/{z}/{x}/{y}`. `WebViewAssetLoader` passe ces requêtes à `ChunkPathHandler` (Kotlin), qui lit la base `chunks.db`. Si le chunk manque et que le réseau est là, il le télécharge chez l'IGN, l'enregistre et le renvoie, avec l'en-tête `Access-Control-Allow-Origin: *` (MapLibre charge les tuiles en cross-origin).
- **Pré-téléchargement** : `Prefetcher`, en Kotlin dans `LocationService`, télécharge la région courante et ses 8 voisines quand on change de région.
- **Côté web** : l'URL des tuiles est choisie à l'exécution (IGN direct dans le navigateur du PC). Un panneau Paramètres affiche le stockage et l'interrupteur « données mobiles ».

**Tech Stack:** Phases 1–3 (aucune nouvelle dépendance ; SQLite et `HttpURLConnection` natifs Android).

**Spec:** `docs/mvp.md` (section Chunks, cache, claims), `docs/adr/0001-cache-chunks-interception-kotlin-sqlite.md`, glossaire `CONTEXT.md` (Chunk, Région, Cache).

**Prérequis:** phase 3 terminée (`LocationService.kt`, `LocationHub.kt`, `NativeBridge.kt`, `MainActivity.kt` avec handlers `setBackEnabled`/`startLocation`/`setKeepScreenOn`, `web/src/bridge/*`, `App.tsx` avec `Panel = 'waypoints' | null`).

> Anchors vérifiées après la revue finale de la phase 3 (2026-09-16) : `Panel`/`BottomBar` (App.tsx), `fakeNative.ts`
> `setKeepScreenOn: () => null,`, `LocationService.onLocationResult`, et la déclaration `LocationFix` de `bridge.ts` sont
> inchangés, ces anchors restent valables telles quelles. Seul `Prefetcher.allowed()` (Task 2 Step 3) a été ajusté
> pour dépendre de `LocationHub.running` (voir M5 de la revue finale) : le pré-téléchargement s'arrête avec le
> service de localisation.

## Global Constraints

- `fr.champimap`, `minSdk 26`, `compileSdk 36`, `targetSdk 36`. Pas de Leaflet/Compose/AppCompat. AGP 9 sans plugin kotlin-android.
- Termes Minecraft (Chunk, Région) **jamais dans l'UI** : l'UI dit « cartes vues récemment », « zones hors ligne ».
- Source : Plan IGN v2 WMTS `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png`. User-Agent identifiable. 4 requêtes en parallèle maximum.
- Région = emprise d'un chunk au **zoom 13**. Détail max = **zoom 17**.
- Cache : vise **500 MB** (non réglable), les chunks les plus anciennement vus sont supprimés d'abord. Le seuil global de 1 GB et les claims arrivent en phase 5.
- Pré-téléchargement : région de la position + 8 voisines. **Wi-Fi uniquement par défaut**, interrupteur « aussi en données mobiles » dans Paramètres. Ces chunks vont dans le cache.
- URL de chunk servie par Kotlin : `https://appassets.androidplatform.net/chunks/{z}/{x}/{y}`. Jamais un domaine inventé.
- Sauvegarde Android désactivée (`allowBackup="false"`) : la base dépasse le quota de sauvegarde.
- Mention « © IGN – Plan IGN » minime.
- Pas de tests automatisés. npm uniquement. Gradle : `export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11";`. `adb` préfixé par `timeout 30`.
- **Téléphone : prévenir l'utilisateur et attendre son accord explicite avant toute commande qui installe, lance ou modifie l'état du téléphone** (install, am start, adb reverse, mode avion, input). Un sous-agent s'arrête après le build et rend la main (NEEDS_CONTEXT).

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
Captures : `mkdir -p android/build/screens && timeout 30 adb exec-out screencap -p > android/build/screens/<nom>.png`, lues avec Read. Taille de la base : `timeout 30 adb shell run-as fr.champimap ls -la databases/`. Mode avion : `timeout 30 adb shell cmd connectivity airplane-mode enable|disable`, puis **toujours** désactiver à la fin et vérifier `timeout 30 adb shell settings get global airplane_mode_on` = `0`. Arrêter Vite avant le rapport.

**Attention mode avion en debug :** la page vient du serveur Vite du PC via `adb reverse`, qui passe par l'USB et continue de marcher en mode avion. Les tuiles, elles, vont vers l'IGN, donc la coupure réseau les concerne bien.

## File Structure

```
android/app/src/main/
├── AndroidManifest.xml                        + ACCESS_NETWORK_STATE, allowBackup=false
└── java/fr/champimap/
    ├── ChunkMath.kt                           coordonnées de chunks, régions, énumération z0→z17
    ├── ChunkStore.kt                          SQLite chunks.db : lire, écrire, taille, nettoyage du cache
    ├── ChunkSource.kt                         téléchargement d'un chunk chez l'IGN
    ├── Network.kt                             en ligne ? réseau non facturé ?
    ├── ChunkPathHandler.kt                    /chunks/{z}/{x}/{y} → cache ou IGN, avec CORS
    ├── ChunkDownloader.kt                     télécharge une suite de chunks manquants, 2 en parallèle
    ├── AppSettings.kt                         préférences (pré-téléchargement en données mobiles)
    ├── Prefetcher.kt                          pré-téléchargement 3×3 régions autour de la position
    ├── LocationService.kt                     + appelle Prefetcher à chaque position
    └── MainActivity.kt                        + handler /chunks/, méthodes stockage/paramètres
web/src/
├── map/ign.ts                                 createIgnStyle(tileUrl), CHUNK_TILE_URL
├── components/MapView.tsx                     style selon Android / navigateur
├── bridge/bridge.ts, bridge/fakeNative.ts     + getStorageStats, getSettings, setPrefetchOnMobileData
├── format/formatBytes.ts                      « 123 Mo »
├── components/SettingsPanel.tsx               stockage + interrupteur + mention IGN
├── components/BottomBar.tsx                   + bouton Paramètres
└── App.tsx                                    + panneau settings
docs/adr/0001-cache-chunks-interception-kotlin-sqlite.md   + URL /chunks/ sur appassets, CORS, URL à l'exécution
```

---

### Task 1: Cache SQLite servi à la carte, lecture hors ligne

**Files:**
- Create: `android/app/src/main/java/fr/champimap/ChunkMath.kt`, `ChunkStore.kt`, `ChunkSource.kt`, `Network.kt`, `ChunkPathHandler.kt`
- Modify: `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/fr/champimap/MainActivity.kt`, `web/src/map/ign.ts`, `web/src/components/MapView.tsx`, `docs/adr/0001-cache-chunks-interception-kotlin-sqlite.md`

**Interfaces:**
- Consumes: `isAndroid` (bridge.ts), `MainActivity.onCreate` et son `assetLoader` (phases 2–3).
- Produces:
  - `data class ChunkId(val z: Int, val x: Int, val y: Int)`.
  - `object ChunkMath` :
    - `REGION_ZOOM = 13`, `MAX_DETAIL_ZOOM = 17` ;
    - `tileX(longitude: Double, zoom: Int): Int`, `tileY(latitude: Double, zoom: Int): Int` ;
    - `rangeAtZoom(min: Int, max: Int, zoom: Int): IntRange` ;
    - `chunksOfRegions(xMin: Int, yMin: Int, xMax: Int, yMax: Int): Sequence<ChunkId>` (z0 → z17, zooms faibles d'abord) ;
    - `countChunksOfRegions(xMin, yMin, xMax, yMax): Long`.
  - `class ChunkStore` (singleton `ChunkStore.get(context)`, étend `SQLiteOpenHelper`, base `chunks.db` version 1) :
    - `read(id: ChunkId): ByteArray?`, `contains(id: ChunkId): Boolean`, `write(id: ChunkId, data: ByteArray)` ;
    - `totalBytes(): Long`, `trimCache()` ;
    - constante `CACHE_TARGET_BYTES = 500 * 1024 * 1024`.
    - La phase 5 passe la base en version 2 (table `claims`) et change la cible de nettoyage.
  - `object ChunkSource { fun download(id: ChunkId): ByteArray? }`.
  - `object Network { fun isOnline(context: Context): Boolean; fun isUnmetered(context: Context): Boolean }`.
  - `class ChunkPathHandler(context: Context) : WebViewAssetLoader.PathHandler`.
  - TS : `createIgnStyle(tileUrl: string): StyleSpecification`, `CHUNK_TILE_URL`, `PLAN_IGN_TILE_URL`, `MAX_DETAIL_ZOOM`, `START_CENTER`, `START_ZOOM` (plus d'export `ignStyle`).

- [ ] **Step 1: Créer `android/app/src/main/java/fr/champimap/ChunkMath.kt`**

```kotlin
package fr.champimap

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.tan

data class ChunkId(val z: Int, val x: Int, val y: Int)

object ChunkMath {
    /** Une région = l'emprise d'un chunk à ce zoom (≈ 3 km de côté en France). */
    const val REGION_ZOOM = 13

    /** Détail maximal gardé hors ligne. */
    const val MAX_DETAIL_ZOOM = 17

    fun tileX(longitude: Double, zoom: Int): Int {
        val n = 1 shl zoom
        return floor((longitude + 180.0) / 360.0 * n).toInt().coerceIn(0, n - 1)
    }

    fun tileY(latitude: Double, zoom: Int): Int {
        val n = 1 shl zoom
        val rad = Math.toRadians(latitude)
        return floor((1.0 - ln(tan(rad) + 1.0 / cos(rad)) / PI) / 2.0 * n).toInt().coerceIn(0, n - 1)
    }

    /** Indices de chunks, au zoom donné, couvrant les régions min..max (bornes incluses). */
    fun rangeAtZoom(min: Int, max: Int, zoom: Int): IntRange =
        if (zoom <= REGION_ZOOM) {
            (min shr (REGION_ZOOM - zoom))..(max shr (REGION_ZOOM - zoom))
        } else {
            (min shl (zoom - REGION_ZOOM))..(((max + 1) shl (zoom - REGION_ZOOM)) - 1)
        }

    /** Tous les chunks z0 → z17 d'un rectangle de régions, zooms faibles d'abord. */
    fun chunksOfRegions(xMin: Int, yMin: Int, xMax: Int, yMax: Int): Sequence<ChunkId> = sequence {
        for (z in 0..MAX_DETAIL_ZOOM) {
            val ys = rangeAtZoom(yMin, yMax, z)
            for (x in rangeAtZoom(xMin, xMax, z)) {
                for (y in ys) yield(ChunkId(z, x, y))
            }
        }
    }

    fun countChunksOfRegions(xMin: Int, yMin: Int, xMax: Int, yMax: Int): Long =
        (0..MAX_DETAIL_ZOOM).sumOf { z ->
            val xs = rangeAtZoom(xMin, xMax, z)
            val ys = rangeAtZoom(yMin, yMax, z)
            (xs.last - xs.first + 1).toLong() * (ys.last - ys.first + 1)
        }
}
```

- [ ] **Step 2: Créer `android/app/src/main/java/fr/champimap/ChunkStore.kt`**

```kotlin
package fr.champimap

import android.content.ContentValues
import android.content.Context
import android.database.DatabaseUtils
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.util.concurrent.atomic.AtomicInteger

/** Base SQLite unique des chunks (ADR 0001). */
class ChunkStore private constructor(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {

    private val writesSinceTrimCheck = AtomicInteger()

    init {
        setWriteAheadLoggingEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE chunks (" +
                "z INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, " +
                "data BLOB NOT NULL, size INTEGER NOT NULL, last_access INTEGER NOT NULL, " +
                "PRIMARY KEY (z, x, y))",
        )
        db.execSQL("CREATE INDEX chunks_last_access ON chunks (last_access)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

    fun read(id: ChunkId): ByteArray? {
        readableDatabase.rawQuery(
            "SELECT data, last_access FROM chunks WHERE z = ? AND x = ? AND y = ?",
            id.args(),
        ).use { cursor ->
            if (!cursor.moveToFirst()) return null
            val now = System.currentTimeMillis()
            // Rafraîchir la date d'accès au plus une fois par minute : évite une écriture par tuile affichée.
            if (now - cursor.getLong(1) > TOUCH_INTERVAL_MS) {
                writableDatabase.execSQL(
                    "UPDATE chunks SET last_access = ? WHERE z = ? AND x = ? AND y = ?",
                    arrayOf<Any>(now, id.z, id.x, id.y),
                )
            }
            return cursor.getBlob(0)
        }
    }

    fun contains(id: ChunkId): Boolean =
        DatabaseUtils.longForQuery(readableDatabase, "SELECT COUNT(*) FROM chunks WHERE z = ? AND x = ? AND y = ?", id.args()) > 0

    fun write(id: ChunkId, data: ByteArray) {
        val values = ContentValues().apply {
            put("z", id.z)
            put("x", id.x)
            put("y", id.y)
            put("data", data)
            put("size", data.size)
            put("last_access", System.currentTimeMillis())
        }
        writableDatabase.insertWithOnConflict("chunks", null, values, SQLiteDatabase.CONFLICT_REPLACE)
        // SUM(size) parcourt la table : on ne vérifie la taille qu'une écriture sur 50.
        if (writesSinceTrimCheck.incrementAndGet() % TRIM_CHECK_EVERY == 0) trimCache()
    }

    fun totalBytes(): Long =
        DatabaseUtils.longForQuery(readableDatabase, "SELECT COALESCE(SUM(size), 0) FROM chunks", null)

    /** Taille visée pour le cache. Phase 5 : dépendra des claims. */
    fun cacheTargetBytes(): Long = CACHE_TARGET_BYTES

    /** Supprime les chunks les plus anciennement vus jusqu'à repasser sous 95 % de la cible. */
    @Synchronized
    fun trimCache() {
        val floor = cacheTargetBytes() * 95 / 100
        while (totalBytes() > floor) {
            val deleted = writableDatabase.compileStatement(
                "DELETE FROM chunks WHERE rowid IN (SELECT rowid FROM chunks ORDER BY last_access LIMIT $TRIM_BATCH)",
            ).executeUpdateDelete()
            if (deleted == 0) break
        }
    }

    private fun ChunkId.args(): Array<String> = arrayOf(z.toString(), x.toString(), y.toString())

    companion object {
        const val CACHE_TARGET_BYTES = 500L * 1024 * 1024
        private const val DB_NAME = "chunks.db"
        private const val DB_VERSION = 1
        private const val TOUCH_INTERVAL_MS = 60_000L
        private const val TRIM_BATCH = 200
        private const val TRIM_CHECK_EVERY = 50

        @Volatile
        private var instance: ChunkStore? = null

        fun get(context: Context): ChunkStore =
            instance ?: synchronized(this) {
                instance ?: ChunkStore(context.applicationContext).also { instance = it }
            }
    }
}
```

- [ ] **Step 3: Créer `android/app/src/main/java/fr/champimap/ChunkSource.kt`**

```kotlin
package fr.champimap

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Plan IGN v2 (Géoplateforme, WMTS sans clé). */
object ChunkSource {
    private const val USER_AGENT = "ChampiMap/0.1 (carte hors ligne, usage personnel)"

    private fun url(id: ChunkId) =
        "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
            "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM" +
            "&TILEMATRIX=${id.z}&TILEROW=${id.y}&TILECOL=${id.x}&FORMAT=image/png"

    /** Octets PNG du chunk, ou null (hors couverture, erreur réseau, réponse inattendue). */
    fun download(id: ChunkId): ByteArray? {
        val connection = URL(url(id)).openConnection() as HttpURLConnection
        connection.connectTimeout = 10_000
        connection.readTimeout = 15_000
        connection.setRequestProperty("User-Agent", USER_AGENT)
        return try {
            if (connection.responseCode == 200 && connection.contentType?.startsWith("image/") == true) {
                connection.inputStream.use { it.readBytes() }
            } else {
                null
            }
        } catch (e: IOException) {
            null
        } finally {
            connection.disconnect()
        }
    }
}
```

- [ ] **Step 4: Créer `android/app/src/main/java/fr/champimap/Network.kt`**

```kotlin
package fr.champimap

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

object Network {
    private fun capabilities(context: Context): NetworkCapabilities? {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        return manager.getNetworkCapabilities(manager.activeNetwork)
    }

    fun isOnline(context: Context): Boolean =
        capabilities(context)?.let {
            it.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                it.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } == true

    /** Wi-Fi ou équivalent non facturé au volume. */
    fun isUnmetered(context: Context): Boolean =
        capabilities(context)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == true
}
```

- [ ] **Step 5: Créer `android/app/src/main/java/fr/champimap/ChunkPathHandler.kt`**

```kotlin
package fr.champimap

import android.content.Context
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream

/**
 * Sert `/chunks/{z}/{x}/{y}` : depuis le cache, sinon depuis l'IGN si le réseau est là (et on garde le chunk).
 * Appelé sur un thread de la WebView, jamais le thread UI.
 */
class ChunkPathHandler(context: Context) : WebViewAssetLoader.PathHandler {

    private val appContext = context.applicationContext
    private val store = ChunkStore.get(appContext)

    override fun handle(path: String): WebResourceResponse {
        val parts = path.split('/')
        val id = if (parts.size == 3) {
            val (z, x, y) = parts.map { it.toIntOrNull() }
            if (z != null && x != null && y != null) ChunkId(z, x, y) else null
        } else {
            null
        } ?: return response(404, "Not Found", EMPTY)

        val data = store.read(id)
            ?: if (Network.isOnline(appContext)) ChunkSource.download(id)?.also { store.write(id, it) } else null

        return if (data != null) response(200, "OK", data) else response(404, "Not Found", EMPTY)
    }

    private fun response(status: Int, reason: String, data: ByteArray) = WebResourceResponse(
        "image/png",
        null,
        status,
        reason,
        // MapLibre charge les tuiles en cross-origin (page sur localhost en debug) ; pas de cache HTTP : SQLite fait foi.
        mapOf("Access-Control-Allow-Origin" to "*", "Cache-Control" to "no-store"),
        ByteArrayInputStream(data),
    )

    private companion object {
        val EMPTY = ByteArray(0)
    }
}
```

- [ ] **Step 6: Modifier `android/app/src/main/AndroidManifest.xml`**

- Ajouter après `<uses-permission android:name="android.permission.INTERNET" />` :
```xml
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```
- Sur la balise `<application …>`, ajouter l'attribut `android:allowBackup="false"` :
```xml
    <application
        android:allowBackup="false"
        android:label="Champi Map"
        android:theme="@android:style/Theme.DeviceDefault.Light.NoActionBar">
```

- [ ] **Step 7: Brancher le handler dans `MainActivity.kt`**

Remplacer :
```kotlin
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
```
par :
```kotlin
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            // Chunks de carte : cache SQLite, sinon IGN (ADR 0001).
            .addPathHandler("/chunks/", ChunkPathHandler(this))
            .build()
```

- [ ] **Step 8: Remplacer `web/src/map/ign.ts`**

```ts
import type { StyleSpecification } from 'maplibre-gl';

// Géoplateforme IGN, WMTS sans clé. Tuiles « non soumises à limite d'usage » (CGU art. 3.2).
export const PLAN_IGN_TILE_URL =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/png';

// Sur Android, Kotlin sert les chunks depuis le cache SQLite (ou l'IGN) sur cette URL.
export const CHUNK_TILE_URL = 'https://appassets.androidplatform.net/chunks/{z}/{x}/{y}';

// Détail max imposé (docs/mvp.md). Au-delà, MapLibre agrandit le zoom 17 : flou mais jamais blanc.
export const MAX_DETAIL_ZOOM = 17;

// Forêt de Chaux, [longitude, latitude].
export const START_CENTER: [number, number] = [5.68, 47.08];
export const START_ZOOM = 12;

export function createIgnStyle(tileUrl: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      'plan-ign': {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        minzoom: 0,
        maxzoom: MAX_DETAIL_ZOOM,
        attribution: '© IGN – Plan IGN',
      },
    },
    layers: [
      // Fond visible là où aucune tuile n'est chargée.
      { id: 'background', type: 'background', paint: { 'background-color': '#ece9e1' } },
      { id: 'plan-ign', type: 'raster', source: 'plan-ign' },
    ],
  };
}
```

- [ ] **Step 9: Modifier `web/src/components/MapView.tsx`**

- Remplacer l'import `import { ignStyle, START_CENTER, START_ZOOM } from '../map/ign';` par :
```tsx
import { CHUNK_TILE_URL, createIgnStyle, PLAN_IGN_TILE_URL, START_CENTER, START_ZOOM } from '../map/ign';
import { isAndroid } from '../bridge/bridge';
```
- Dans le constructeur `new MapLibreMap({…})`, remplacer `style: ignStyle,` par :
```tsx
      style: createIgnStyle(isAndroid ? CHUNK_TILE_URL : PLAN_IGN_TILE_URL),
```

- [ ] **Step 10: Amender l'ADR 0001**

Dans `docs/adr/0001-cache-chunks-interception-kotlin-sqlite.md`, remplacer la première phrase du premier paragraphe (« La carte demande ses chunks à une URL fictive (`https://tiles.app/{z}/{x}/{y}`). `WebViewClient.shouldInterceptRequest` sert… ») par :
```markdown
La carte demande ses chunks à `https://appassets.androidplatform.net/chunks/{z}/{x}/{y}`, domaine réservé à `WebViewAssetLoader`. Aucun domaine réel ne risque donc de recevoir une requête non interceptée. Un `PathHandler` Kotlin sert le chunk depuis une base SQLite unique s'il existe, sinon le télécharge chez l'IGN, l'enregistre, puis le renvoie avec `Access-Control-Allow-Origin: *` (MapLibre charge les tuiles en cross-origin). L'URL des tuiles est choisie à l'exécution : IGN en direct dans le navigateur du PC, chunks Kotlin sur Android.
```

- [ ] **Step 11: Vérifier types et builds**

```bash
cd web && npm run typecheck && npm run build
cd ../android && export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11" && ./gradlew assembleDebug
```
Expected: aucune erreur, `BUILD SUCCESSFUL`.

- [ ] **Step 12: Contrôle sur le téléphone** (après accord de l'utilisateur, procédure « lancer en debug »)

1. En ligne, capture : carte Plan IGN affichée normalement (servie via `/chunks/`). `timeout 20 adb logcat -d | grep -i -E "chromium.*(cors|chunks)|Access-Control" | tail -20` : aucune erreur CORS.
2. Parcourir la carte : 3 glissements et 2 zooms (`input swipe`, double tap `input tap X Y` ×2). Puis `run-as fr.champimap ls -la databases/` montre `chunks.db` (+ `-wal`) de taille non nulle.
3. Mode avion activé (accord déjà donné pour ce contrôle), `am force-stop` + `am start`, puis capture : la zone parcourue s'affiche depuis le cache. Une zone jamais vue reste beige.
4. Désactiver le mode avion, vérifier `airplane_mode_on` = `0`.

- [ ] **Step 13: Commit**

```bash
git add android/app/src/main web/src/map/ign.ts web/src/components/MapView.tsx docs/adr/0001-cache-chunks-interception-kotlin-sqlite.md
git commit -m "feat: cache SQLite des chunks servi à la carte"
```

---

### Task 2: Pré-téléchargement autour de soi et panneau Paramètres

**Files:**
- Create: `android/app/src/main/java/fr/champimap/ChunkDownloader.kt`, `AppSettings.kt`, `Prefetcher.kt`, `web/src/format/formatBytes.ts`, `web/src/components/SettingsPanel.tsx`
- Modify: `android/app/src/main/java/fr/champimap/LocationService.kt`, `android/app/src/main/java/fr/champimap/MainActivity.kt`, `web/src/bridge/bridge.ts`, `web/src/bridge/fakeNative.ts`, `web/src/components/BottomBar.tsx`, `web/src/App.tsx`

**Interfaces:**
- Consumes: `ChunkStore.get/contains/write/totalBytes`, `ChunkSource.download`, `ChunkMath`, `Network` (Task 1), `LocationHub.publishFix`/`LocationHub.running` et le callback de `LocationService` (phase 3), `NativeBridge.handle` (phase 2), `callNative`, `emitFake`, `Panel`.
- Produces:
  - `data class DownloadResult(val failures: Int, val cancelled: Boolean)` (`cancelled` : `shouldContinue()` est devenu faux avant la fin).
  - `object ChunkDownloader { const val PARALLEL = 2; fun downloadMissing(context: Context, chunks: Sequence<ChunkId>, shouldContinue: () -> Boolean, onChunk: (ok: Boolean) -> Unit): DownloadResult }` : appelle `ChunkSource.download(id, interactive = false)`, rattrape les exceptions de `ChunkStore` (chunk compté en échec plutôt que de propager). La phase 5 l'utilise pour les claims.
  - `object AppSettings { fun prefetchOnMobileData(context): Boolean; fun setPrefetchOnMobileData(context, on: Boolean) }`.
  - `class Prefetcher(context: Context) { fun onFix(fix: Location) }`.
  - TS `BridgeMethods` + `getStorageStats: { params: Record<string, never>; result: StorageStats }` avec `type StorageStats = { cacheBytes: number; cacheTargetBytes: number; claimBytes: number }` (claimBytes = 0 en phase 4), `getSettings: { params: Record<string, never>; result: AppSettings }` avec `type AppSettings = { prefetchOnMobileData: boolean }`, `setPrefetchOnMobileData: { params: { on: boolean }; result: null }`.
  - `formatBytes(bytes: number): string`.
  - `BottomBar` props `{ onOpenWaypoints: () => void; onOpenSettings: () => void }`. `Panel = 'waypoints' | 'settings' | null`. La phase 6 ajoute la section compte dans `SettingsPanel`.

- [ ] **Step 1: Créer `android/app/src/main/java/fr/champimap/ChunkDownloader.kt`**

```kotlin
package fr.champimap

import android.content.Context
import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/** `cancelled` : `shouldContinue()` est devenu faux avant que tous les chunks n'aient été traités. */
data class DownloadResult(val failures: Int, val cancelled: Boolean)

object ChunkDownloader {
    /** Moitié du plafond IGN (ChunkSource.backgroundLimit) : ne dispute pas les threads pour rien au-delà. */
    const val PARALLEL = 2
    private const val BATCH = 64
    private const val TAG = "ChunkDownloader"

    /**
     * Télécharge les chunks absents de la base, 2 à la fois. S'arrête entre deux lots si `shouldContinue()` devient
     * faux (résultat `cancelled = true`). `onChunk(ok)` est appelé pour chaque chunk traité (déjà présent ou
     * téléchargé = ok).
     */
    fun downloadMissing(
        context: Context,
        chunks: Sequence<ChunkId>,
        shouldContinue: () -> Boolean,
        onChunk: (ok: Boolean) -> Unit,
    ): DownloadResult {
        val store = ChunkStore.get(context)
        val pool = Executors.newFixedThreadPool(PARALLEL)
        val failures = AtomicInteger()
        var cancelled = false
        try {
            for (batch in chunks.chunked(BATCH)) {
                if (!shouldContinue()) {
                    cancelled = true
                    break
                }
                batch.map { id ->
                    pool.submit {
                        // store.contains/write peut lever (SQLiteFullException, disque plein…) : rattrapé ici plutôt
                        // que de laisser it.get() (plus bas) relayer une ExecutionException hors de cette fonction,
                        // ce qui tuerait le thread appelant (le prefetch tourne sans UI pour la rattraper).
                        val ok = try {
                            store.contains(id) || ChunkSource.download(id, interactive = false)?.also { store.write(id, it) } != null
                        } catch (e: Exception) {
                            Log.w(TAG, "Échec du chunk $id", e)
                            false
                        }
                        if (!ok) failures.incrementAndGet()
                        onChunk(ok)
                    }
                }.forEach { it.get() }
            }
        } finally {
            pool.shutdown()
        }
        return DownloadResult(failures.get(), cancelled)
    }
}
```

- [ ] **Step 2: Créer `android/app/src/main/java/fr/champimap/AppSettings.kt`**

```kotlin
package fr.champimap

import android.content.Context

object AppSettings {
    private const val PREFS = "settings"
    private const val PREFETCH_ON_MOBILE_DATA = "prefetch_on_mobile_data"

    fun prefetchOnMobileData(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(PREFETCH_ON_MOBILE_DATA, false)

    fun setPrefetchOnMobileData(context: Context, on: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(PREFETCH_ON_MOBILE_DATA, on).apply()
    }
}
```

- [ ] **Step 3: Créer `android/app/src/main/java/fr/champimap/Prefetcher.kt`**

```kotlin
package fr.champimap

import android.content.Context
import android.location.Location
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/** Pré-télécharge la région de la position et ses 8 voisines quand on change de région. */
class Prefetcher(context: Context) {

    private val appContext = context.applicationContext

    fun onFix(fix: Location) {
        val region = ChunkMath.tileX(fix.longitude, ChunkMath.REGION_ZOOM) to ChunkMath.tileY(fix.latitude, ChunkMath.REGION_ZOOM)
        // `shouldAttempt` (en mémoire, pas d'I/O) et le CAS de `busy` d'abord, sur le thread appelant (thread
        // principal de localisation) : `allowed()` (réseau, préférences) attend d'être dans le thread de fond
        // ci-dessous pour ne rien lire de coûteux sur ce thread.
        if (!shouldAttempt(region) || !busy.compareAndSet(false, true)) return
        thread(name = "prefetch", isDaemon = true) {
            try {
                if (!allowed()) return@thread
                val (x, y) = region
                val result = ChunkDownloader.downloadMissing(
                    appContext,
                    ChunkMath.chunksOfRegions(x - 1, y - 1, x + 1, y + 1),
                    shouldContinue = ::allowed,
                    onChunk = {},
                )
                // Une passe interrompue (réseau perdu, service arrêté) est retentée dès le prochain fix : on ne
                // retient donc la région que si elle est allée à son terme, avec ou sans échecs.
                if (!result.cancelled) {
                    lastRegion = region
                    lastRegionAt = System.currentTimeMillis()
                    lastRegionHadFailures = result.failures > 0
                }
            } catch (e: Exception) {
                // Le prefetch tourne sans UI pour rattraper une exception : une exception non gérée ici tuerait
                // le processus, y compris avec l'app en arrière-plan.
                Log.w(TAG, "Pré-téléchargement interrompu par une erreur inattendue", e)
            } finally {
                busy.set(false)
            }
        }
    }

    /** Même région déjà entièrement téléchargée (sans échec) : rien à refaire. Avec échecs : nouvel essai après [RETRY_AFTER_FAILURE_MS]. */
    private fun shouldAttempt(region: Pair<Int, Int>): Boolean {
        if (region != lastRegion) return true
        if (!lastRegionHadFailures) return false
        return System.currentTimeMillis() - lastRegionAt > RETRY_AFTER_FAILURE_MS
    }

    private fun allowed(): Boolean =
        // S'arrête avec le service de localisation (ex. « Stop » depuis la notification, phase 3) :
        // pas de sens à continuer de télécharger des chunks autour d'une position qu'on ne suit plus.
        LocationHub.running &&
            Network.isOnline(appContext) &&
            (Network.isUnmetered(appContext) || AppSettings.prefetchOnMobileData(appContext))

    private companion object {
        const val TAG = "Prefetcher"
        const val RETRY_AFTER_FAILURE_MS = 15 * 60 * 1000L

        // Partagés entre toutes les instances (pas seulement `this` object : LocationService recrée un
        // Prefetcher à chaque (re)démarrage du service via `by lazy`, alors qu'un thread de pré-téléchargement
        // de l'instance précédente peut encore tourner) : sinon deux passes pourraient tourner en même temps.
        val busy = AtomicBoolean(false)

        @Volatile
        var lastRegion: Pair<Int, Int>? = null

        @Volatile
        var lastRegionAt: Long = 0L

        @Volatile
        var lastRegionHadFailures: Boolean = false
    }
}
```

- [ ] **Step 4: Appeler le pré-téléchargement dans `LocationService.kt`**

- Ajouter le champ, juste après `private var started = false` :
```kotlin
    private val prefetcher by lazy { Prefetcher(this) }
```
- Remplacer le corps de `onLocationResult` :
```kotlin
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let(LocationHub::publishFix)
        }
```
par :
```kotlin
        override fun onLocationResult(result: LocationResult) {
            val fix = result.lastLocation ?: return
            LocationHub.publishFix(fix)
            prefetcher.onFix(fix)
        }
```

- [ ] **Step 5: Ajouter les méthodes dans `MainActivity.kt`**

Juste avant la ligne `bridge.install()`, ajouter :
```kotlin
        bridge.handle("getStorageStats") {
            val store = ChunkStore.get(this)
            JSONObject()
                .put("cacheBytes", store.totalBytes())
                .put("cacheTargetBytes", store.cacheTargetBytes())
                .put("claimBytes", 0)
        }
        bridge.handle("getSettings") {
            JSONObject().put("prefetchOnMobileData", AppSettings.prefetchOnMobileData(this))
        }
        bridge.handle("setPrefetchOnMobileData") { params ->
            AppSettings.setPrefetchOnMobileData(this, params.getBoolean("on"))
            null
        }
```

- [ ] **Step 6: Modifier `web/src/bridge/bridge.ts`**

- Après la déclaration de `LocationFix`, ajouter :
```ts
export type StorageStats = { cacheBytes: number; cacheTargetBytes: number; claimBytes: number };
export type AppSettings = { prefetchOnMobileData: boolean };
```
- Dans `BridgeMethods`, ajouter après `setKeepScreenOn` :
```ts
  getStorageStats: { params: Record<string, never>; result: StorageStats };
  getSettings: { params: Record<string, never>; result: AppSettings };
  setPrefetchOnMobileData: { params: { on: boolean }; result: null };
```

- [ ] **Step 7: Modifier `web/src/bridge/fakeNative.ts`**

Dans l'objet `handlers`, ajouter après `setKeepScreenOn: () => null,` :
```ts
  getStorageStats: () => ({ cacheBytes: 0, cacheTargetBytes: 500 * 1024 * 1024, claimBytes: 0 }),
  getSettings: () => ({ prefetchOnMobileData: localStorage.getItem('prefetchOnMobileData') === 'true' }),
  setPrefetchOnMobileData: (params) => {
    localStorage.setItem('prefetchOnMobileData', String(params.on === true));
    return null;
  },
```

- [ ] **Step 8: Créer `web/src/format/formatBytes.ts`**

```ts
/** « 0 Mo », « 143 Mo », « 1,2 Go » (unités de 1024). */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${Math.round(mb)} Mo`;
  return `${(mb / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;
}
```

- [ ] **Step 9: Créer `web/src/components/SettingsPanel.tsx`**

> TODO (reporté, M11 de la revue finale phase 3) : ce panneau serait un emplacement naturel pour un bouton
> « Arrêter le GPS » in-app (arrêter `LocationService` sans passer par la notification). Pas fait ici, à
> reprendre dans une phase ultérieure si le besoin se confirme.

```tsx
import { useEffect, useState } from 'react';
import { callNative, type AppSettings, type StorageStats } from '../bridge/bridge';
import { formatBytes } from '../format/formatBytes';

type Props = {
  onClose: () => void;
};

export function SettingsPanel({ onClose }: Props) {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    void callNative('getStorageStats', {}).then(setStats);
    void callNative('getSettings', {}).then(setSettings);
  }, []);

  const togglePrefetch = async () => {
    if (!settings) return;
    const next = !settings.prefetchOnMobileData;
    await callNative('setPrefetchOnMobileData', { on: next });
    setSettings({ ...settings, prefetchOnMobileData: next });
  };

  return (
    <section className="absolute inset-0 z-30 flex flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 p-3">
        <h2 className="text-lg font-semibold">Paramètres</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="px-3 py-2 text-xl text-gray-500">
          ✕
        </button>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase">Stockage</h3>
          {stats ? (
            <ul className="space-y-1">
              <li>
                Cartes vues récemment : {formatBytes(stats.cacheBytes)} / {formatBytes(stats.cacheTargetBytes)}
              </li>
              <li>Zones hors ligne : {formatBytes(stats.claimBytes)}</li>
            </ul>
          ) : (
            <p className="text-gray-500">Calcul…</p>
          )}
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase">Autour de moi</h3>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={settings?.prefetchOnMobileData ?? false}
              disabled={!settings}
              onChange={togglePrefetch}
            />
            <span>
              Pré-télécharger la carte autour de moi aussi en données mobiles
              <span className="block text-sm text-gray-500">
                En Wi-Fi, c'est automatique. Compter 100 à 250 Mo à chaque nouveau secteur.
              </span>
            </span>
          </label>
        </section>
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase">À propos</h3>
          <p className="text-sm text-gray-600">Carte : © IGN – Plan IGN</p>
        </section>
      </div>
    </section>
  );
}
```

- [ ] **Step 10: Remplacer `web/src/components/BottomBar.tsx`**

```tsx
type Props = {
  onOpenWaypoints: () => void;
  onOpenSettings: () => void;
};

function BarButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium text-gray-700">
      <span className="text-xl leading-none">{icon}</span>
      {label}
    </button>
  );
}

export function BottomBar({ onOpenWaypoints, onOpenSettings }: Props) {
  return (
    <nav className="flex border-t border-gray-200 bg-white">
      <BarButton icon="📍" label="Waypoints" onClick={onOpenWaypoints} />
      <BarButton icon="⚙️" label="Paramètres" onClick={onOpenSettings} />
    </nav>
  );
}
```

- [ ] **Step 11: Modifier `web/src/App.tsx`**

- Ajouter l'import : `import { SettingsPanel } from './components/SettingsPanel';`
- Remplacer `export type Panel = 'waypoints' | null;` par `export type Panel = 'waypoints' | 'settings' | null;`
- Juste après la ligne `{panel === 'waypoints' && (` … `)}` (le bloc `WaypointList`), ajouter :
```tsx
        {panel === 'settings' && <SettingsPanel onClose={() => setPanel(null)} />}
```
- Remplacer `<BottomBar onOpenWaypoints={openWaypointList} />` par :
```tsx
      <BottomBar
        onOpenWaypoints={openWaypointList}
        onOpenSettings={() => {
          setSheet(null);
          setPanel('settings');
        }}
      />
```

- [ ] **Step 12: Vérifier types et builds**

```bash
cd web && npm run typecheck && npm run build
cd ../android && export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11" && ./gradlew assembleDebug
```
Expected: aucune erreur, `BUILD SUCCESSFUL`.

- [ ] **Step 13: Contrôle sur le téléphone** (après accord de l'utilisateur, procédure « lancer en debug »)

1. Téléphone en Wi-Fi, GPS actif (badge avec précision). Ouvrir Paramètres : noter « Cartes vues récemment : N Mo ».
2. Attendre 2 minutes, fermer puis rouvrir Paramètres : la valeur a nettement augmenté (pré-téléchargement des 9 régions autour de la position).
3. Cocher « aussi en données mobiles », relancer l'app, rouvrir Paramètres : la case est toujours cochée. La décocher.
4. Mode avion (accord donné), relancer, recentrer sur la position avec ◎ et dézoomer/zoomer jusqu'au zoom 17 autour de soi sans avoir parcouru la zone avant : la carte s'affiche (chunks pré-téléchargés). Désactiver le mode avion, vérifier `airplane_mode_on` = `0`.

- [ ] **Step 14: Commit**

```bash
git add android/app/src/main web/src
git commit -m "feat: pré-téléchargement autour de soi et panneau Paramètres"
```
