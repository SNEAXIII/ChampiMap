# Champi Map — Phase 5 : zones hors ligne (claims) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dessiner un rectangle de cases, voir le nombre de cases et la taille estimée, puis télécharger la zone en arrière-plan avec reprise automatique. Les zones se gèrent dans une liste, et un brouillard montre ce qui n'est pas disponible.

**Architecture:**
- **Kotlin (stockage)** : la base `chunks.db` passe en version 2 avec une table `claims` (coins en régions z13 + nom + statut). « Claimé » reste calculé en SQL à partir des rectangles : aucun compteur par chunk. Le nettoyage du cache épargne les chunks claimés, et la cible du cache devient `min(500 MB, 1 GB − taille des claims)`.
- **Kotlin (téléchargement)** : un service au premier plan dédié, `DownloadService` (type `dataSync`), télécharge les claims en cours via `ChunkDownloader` (phase 4). Il attend le retour du réseau, reprend au lancement de l'app et publie la progression (`DownloadHub` → page + notification).
- **Web** : mode sélection (grille, un doigt trace, deux doigts déplacent via `cooperativeGestures`), estimation (moyenne réelle par zoom), liste des zones, brouillard.

**Tech Stack:** Phases 1–4, aucune nouvelle dépendance.

**Spec:** `docs/mvp.md` (Chunks, cache, claims ; Création d'une zone hors ligne ; Liste ; Brouillard), glossaire `CONTEXT.md` (Région, Claim, Chunk claimé, Cache, Brouillard), ADR 0001.

**Prérequis:**
- Phase 4 terminée : `ChunkStore` v1, `ChunkMath`, `ChunkDownloader`, `Network`, `getStorageStats`, `SettingsPanel`, `BottomBar` avec 2 boutons, `Panel = 'waypoints' | 'settings' | null`.
- **Action utilisateur avant la phase** : sauvegarder `C:\Users\miste\.android\debug.keystore` hors du PC. Toute build est signée avec cette clé ; si elle est perdue, réinstaller l'app efface les zones hors ligne et les waypoints non synchronisés.

## Global Constraints

- `fr.champimap`, `minSdk 26`, `compileSdk 36`, `targetSdk 36`. Pas de Leaflet/Compose/AppCompat. AGP 9 sans plugin kotlin-android.
- **Termes Minecraft jamais dans l'UI** : Claim → « zone hors ligne », Région → « case », Chunk → jamais affiché.
- Région = emprise d'un chunk au **zoom 13**. Claim = coin haut-gauche + coin bas-droite (en régions, bornes incluses) + nom. Il couvre z0 → **z17**.
- Cache : vise 500 MB. **Seuil global 1 GB** (cache + claims) :
  - avertissement avant de créer un claim qui fait dépasser ;
  - au-delà, le cache se vide pour se rapprocher de 1 GB ;
  - **les claims ne sont jamais supprimés automatiquement.**
- Estimation : moyenne réelle des chunks stockés pour chaque zoom, **70 KB** par défaut.
- Téléchargement en Kotlin via `ChunkDownloader` (2 requêtes en parallèle, `ChunkSource.download(interactive = false)` — moitié du plafond IGN de 4, l'autre moitié restant réservée à la navigation), continue en arrière-plan (progression dans la notification), reprise automatique après arrêt ou crash en recalculant les chunks manquants. Pas de pause manuelle : « en pause » = attente du réseau.
- Création : menu → « Nouvelle zone hors ligne » → grille ; un doigt trace un rectangle aligné sur les cases, deux doigts déplacent/zooment ; en direct « N cases · ≈ X Mo » + avertissement 1 GB ; [Télécharger] → nom prérempli « Zone du JJ/MM ». Pas de viseur ni de création de waypoint dans ce mode.
- Liste : nom, taille, date, état (complète / X % / en pause). Actions : renommer, supprimer, voir sur la carte.
- Brouillard :
  - voile gris sur les claims en cours de téléchargement ;
  - contour discret autour des claims complets ;
  - **sans réseau**, voile sur les régions ni claimées ni présentes dans le cache.
- Pas de tests automatisés. npm uniquement. Gradle : `export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11";`. `adb` préfixé par `timeout 30`.
- **Téléphone : prévenir l'utilisateur et attendre son accord explicite avant toute commande qui installe, lance ou modifie l'état du téléphone.** Un sous-agent s'arrête après le build et rend la main (NEEDS_CONTEXT).

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
Captures : `mkdir -p android/build/screens && timeout 30 adb exec-out screencap -p > android/build/screens/<nom>.png`. Glisser à un doigt : `timeout 30 adb shell input swipe X1 Y1 X2 Y2 800`. Notification : `timeout 30 adb shell dumpsys notification --noredact | grep -i -A5 champi`. Mode avion : `cmd connectivity airplane-mode enable|disable`, **toujours** désactiver à la fin et vérifier `settings get global airplane_mode_on` = `0`. Arrêter Vite avant le rapport.

## File Structure

```
android/app/src/main/
├── AndroidManifest.xml                       + FOREGROUND_SERVICE_DATA_SYNC, service DownloadService
└── java/fr/champimap/
    ├── ChunkStore.kt                         v2 : table claims, SQL « couvert par un claim », cibles 500 MB / 1 GB, moyennes, régions disponibles
    ├── DownloadHub.kt                        progression des téléchargements (service → activité)
    ├── DownloadService.kt                    service dataSync : télécharge les claims en cours, attend le réseau
    └── MainActivity.kt                       + méthodes claims, reprise au lancement, relais de progression
web/src/
├── claims/regions.ts                         maths des cases côté TS : case sous un point, emprises, comptage, estimation
├── claims/useClaims.ts                       liste des claims + progression
├── bridge/bridge.ts, bridge/fakeNative.ts    + méthodes/événements claims
├── index.css                                 + masque le message des gestes coopératifs
├── components/ClaimSelection.tsx             mode sélection : grille, rectangle, estimation, nom
├── components/ClaimsPanel.tsx                liste des zones hors ligne
├── components/ClaimOverlays.tsx              brouillard + contours sur la carte
├── components/BottomBar.tsx                  + bouton Zones hors ligne
└── App.tsx                                   + mode sélection, panneau claims, overlays
docs/mvp.md, docs/adr/0001-…                  téléchargement des claims dans DownloadService
```

---

### Task 1: Claims côté Kotlin et création d'une zone depuis la carte

**Files:**
- Create: `android/app/src/main/java/fr/champimap/DownloadHub.kt`, `android/app/src/main/java/fr/champimap/DownloadService.kt`, `web/src/claims/regions.ts`, `web/src/components/ClaimSelection.tsx`
- Modify: `android/app/src/main/java/fr/champimap/ChunkStore.kt`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/java/fr/champimap/MainActivity.kt`, `web/src/bridge/bridge.ts`, `web/src/bridge/fakeNative.ts`, `web/src/index.css`, `web/src/components/BottomBar.tsx`, `web/src/App.tsx`, `docs/mvp.md`, `docs/adr/0001-cache-chunks-interception-kotlin-sqlite.md`

**Interfaces:**
- Consumes: `ChunkMath`, `ChunkDownloader.downloadMissing`, `Network.isOnline`, `ChunkSource` (phase 4), `NativeBridge.handle/emit` (phase 2), `MAX_DETAIL_ZOOM` (`ign.ts`), `formatBytes`, `callNative`, `onNative`, `emitFake`, `isAndroid`.
- Produces:
  - Kotlin `data class Claim(val id: String, val name: String, val xMin: Int, val yMin: Int, val xMax: Int, val yMax: Int, val createdAt: Long, val status: String)` avec les constantes `Claim.DOWNLOADING = "downloading"` et `Claim.COMPLETE = "complete"`.
  - `ChunkStore` :
    - claims : `insertClaim(claim)`, `listClaims(): List<Claim>`, `claimExists(id): Boolean`, `renameClaim(id, name)`, `deleteClaim(id)`, `setClaimStatus(id, status)`, `firstClaimWithStatus(status): Claim?` ;
    - tailles : `claimBytes(): Long`, `claimBytes(id): Long`, `cacheBytes(): Long` ;
    - estimation et brouillard : `averageChunkBytesByZoom(): Map<Int, Long>`, `availableRegions(xMin, yMin, xMax, yMax): List<Pair<Int, Int>>` ;
    - constante `GLOBAL_LIMIT_BYTES`. `cacheTargetBytes()` devient `min(500 MB, max(0, 1 GB − claimBytes()))`.
  - `object DownloadHub` : `data class Progress(val claimId: String, val done: Long, val total: Long, val waitingForNetwork: Boolean)`, `interface Listener { onProgress(p: Progress); onClaimsChanged() }`, `addListener/removeListener`, `publishProgress(p)`, `publishClaimsChanged()`, `latest(): Collection<Progress>`.
  - `DownloadService.start(context)`.
  - TS `type Claim = { id: string; name: string; xMin: number; yMin: number; xMax: number; yMax: number; createdAt: number; status: 'downloading' | 'complete'; bytes: number }`, `type ClaimProgress = { claimId: string; done: number; total: number; waitingForNetwork: boolean }`.
  - `BridgeMethods` : `listClaims`, `createClaim`, `renameClaim`, `deleteClaim`, `getChunkSizeAverages`, `getAvailableRegions` (signatures exactes en Step 7).
  - `BridgeEvents` : `claimProgress: ClaimProgress`, `claimsChanged: null`.
  - `regions.ts` :
    - constantes : `REGION_ZOOM`, `DEFAULT_CHUNK_BYTES`, `GLOBAL_WARNING_BYTES` ;
    - type : `type RegionRect = { xMin; yMin; xMax; yMax }` ;
    - fonctions : `regionAt(lng, lat): { x; y }`, `rectFromRegions(a, b): RegionRect`, `regionCount(rect): number`, `rectBounds(rect): [[number, number], [number, number]]`, `rectRing(rect): number[][][]`, `chunkCount(rect): number`, `estimateBytes(rect, averages): number`, `regionsInView(bounds): RegionRect`, `regionSquare(x, y): number[][][]`.
  - `ClaimSelection` props `{ map: MapLibreMap; onDone: () => void }`.

- [ ] **Step 1: Remplacer `android/app/src/main/java/fr/champimap/ChunkStore.kt`**

```kotlin
package fr.champimap

import android.content.ContentValues
import android.content.Context
import android.database.DatabaseUtils
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteException
import android.database.sqlite.SQLiteOpenHelper
import android.util.Log
import java.util.concurrent.atomic.AtomicInteger

data class Claim(
    val id: String,
    val name: String,
    val xMin: Int,
    val yMin: Int,
    val xMax: Int,
    val yMax: Int,
    val createdAt: Long,
    val status: String,
) {
    companion object {
        const val DOWNLOADING = "downloading"
        const val COMPLETE = "complete"
    }
}

/** Base SQLite unique : chunks + claims (ADR 0001). « Claimé » est calculé, jamais stocké par chunk. */
class ChunkStore private constructor(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {

    private val writesSinceTrimCheck = AtomicInteger()

    init {
        setWriteAheadLoggingEnabled(true)
    }

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        // Doit précéder la création des tables ; sans effet sur une base déjà en version 1 (auto_vacuum ne se
        // change qu'à la création, une base existante resterait en NONE — sans incidence ici, la phase 4 n'a
        // jamais publié de version sans auto_vacuum).
        db.execSQL("PRAGMA auto_vacuum = INCREMENTAL")
        // Un peu moins durable que FULL en cas de coupure brutale, contre moins d'E/S à chaque écriture ; le WAL
        // (activé ci-dessus) protège déjà des corruptions liées à un crash pendant une transaction.
        db.execSQL("PRAGMA synchronous = NORMAL")
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            // `data` en dernier : sinon SQLite pousse `size`/`last_access` sur les pages de débordement
            // du BLOB, et SUM(size)/le tri par last_access doivent alors parcourir (quasi) tout le fichier.
            "CREATE TABLE chunks (" +
                "z INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, " +
                "size INTEGER NOT NULL, last_access INTEGER NOT NULL, data BLOB NOT NULL, " +
                "PRIMARY KEY (z, x, y))",
        )
        db.execSQL("CREATE INDEX chunks_last_access ON chunks (last_access)")
        createClaimsTable(db)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) createClaimsTable(db)
    }

    private fun createClaimsTable(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE claims (" +
                "id TEXT PRIMARY KEY, name TEXT NOT NULL, " +
                "x_min INTEGER NOT NULL, y_min INTEGER NOT NULL, x_max INTEGER NOT NULL, y_max INTEGER NOT NULL, " +
                "created_at INTEGER NOT NULL, status TEXT NOT NULL)",
        )
    }

    // ---- Chunks ----

    fun read(id: ChunkId): ByteArray? {
        readableDatabase.rawQuery(
            "SELECT data, last_access FROM chunks WHERE z = ? AND x = ? AND y = ?",
            id.args(),
        ).use { cursor ->
            if (!cursor.moveToFirst()) return null
            val now = System.currentTimeMillis()
            // Rafraîchir la date d'accès au plus une fois par minute : évite une écriture par tuile affichée.
            if (now - cursor.getLong(1) > TOUCH_INTERVAL_MS) {
                try {
                    writableDatabase.execSQL(
                        "UPDATE chunks SET last_access = ? WHERE z = ? AND x = ? AND y = ?",
                        arrayOf<Any>(now, id.z, id.x, id.y),
                    )
                } catch (e: SQLiteException) {
                    // Best-effort (ex. disque plein) : la tuile déjà lue est quand même servie, seule sa date
                    // d'accès n'est pas rafraîchie, elle sera juste un peu plus tôt candidate au nettoyage.
                    Log.w(TAG, "Rafraîchissement de last_access impossible pour $id", e)
                }
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
        // Le calcul des tailles parcourt la table : on ne vérifie qu'une écriture sur 50.
        if (writesSinceTrimCheck.incrementAndGet() % TRIM_CHECK_EVERY == 0) trimCache()
    }

    fun totalBytes(): Long =
        DatabaseUtils.longForQuery(readableDatabase, "SELECT COALESCE(SUM(size), 0) FROM chunks", null)

    fun claimBytes(): Long =
        DatabaseUtils.longForQuery(
            readableDatabase,
            "SELECT COALESCE(SUM(size), 0) FROM chunks WHERE EXISTS (SELECT 1 FROM claims c WHERE ${covers("c")})",
            null,
        )

    fun claimBytes(claimId: String): Long =
        DatabaseUtils.longForQuery(
            readableDatabase,
            "SELECT COALESCE(SUM(chunks.size), 0) FROM chunks, claims c WHERE c.id = ? AND ${covers("c")}",
            arrayOf(claimId),
        )

    fun cacheBytes(): Long = totalBytes() - claimBytes()

    /** Le cache vise 500 MB, et moins si les claims poussent le total au-delà de 1 GB. */
    fun cacheTargetBytes(): Long = minOf(CACHE_TARGET_BYTES, maxOf(0L, GLOBAL_LIMIT_BYTES - claimBytes()))

    /** Supprime les chunks non claimés les plus anciennement vus jusqu'à repasser sous 95 % de la cible. */
    @Synchronized
    fun trimCache() {
        val target = cacheTargetBytes()
        var total = cacheBytes()
        // Rien à faire tant qu'on n'a pas dépassé la cible elle-même : on évite ainsi le scan NOT EXISTS
        // (jointure contre claims) à chaque écriture, et on ne vise la marge de 95 % que lorsqu'il faut
        // réellement nettoyer.
        if (total <= target) return
        val floor = target * 95 / 100
        var deletedAny = false
        while (total > floor) {
            var batchBytes = 0L
            val rowids = ArrayList<Long>(TRIM_BATCH)
            writableDatabase.rawQuery(
                "SELECT rowid, size FROM chunks " +
                    "WHERE NOT EXISTS (SELECT 1 FROM claims c WHERE ${covers("c")}) " +
                    "ORDER BY last_access LIMIT $TRIM_BATCH",
                null,
            ).use { cursor ->
                while (cursor.moveToNext()) {
                    rowids += cursor.getLong(0)
                    batchBytes += cursor.getLong(1)
                }
            }
            if (rowids.isEmpty()) break
            writableDatabase.execSQL("DELETE FROM chunks WHERE rowid IN (${rowids.joinToString(",")})")
            total -= batchBytes
            deletedAny = true
        }
        // Rend au système de fichiers l'espace des pages supprimées (auto_vacuum = INCREMENTAL ne le fait pas
        // seul). Couvre aussi deleteClaim() ci-dessous, qui termine toujours par un appel à trimCache().
        if (deletedAny) {
            writableDatabase.rawQuery("PRAGMA incremental_vacuum", null).use { while (it.moveToNext()) { } }
        }
    }

    fun averageChunkBytesByZoom(): Map<Int, Long> {
        val averages = HashMap<Int, Long>()
        readableDatabase.rawQuery("SELECT z, AVG(size) FROM chunks GROUP BY z", null).use { cursor ->
            while (cursor.moveToNext()) averages[cursor.getInt(0)] = cursor.getDouble(1).toLong()
        }
        return averages
    }

    /** Régions (z13) du rectangle qui ont au moins un chunk de zoom ≥ 13 dans la base. */
    fun availableRegions(xMin: Int, yMin: Int, xMax: Int, yMax: Int): List<Pair<Int, Int>> {
        val shift = "(z - ${ChunkMath.REGION_ZOOM})"
        val regions = ArrayList<Pair<Int, Int>>()
        readableDatabase.rawQuery(
            "SELECT DISTINCT x >> $shift, y >> $shift FROM chunks " +
                "WHERE z >= ${ChunkMath.REGION_ZOOM} AND (x >> $shift) BETWEEN ? AND ? AND (y >> $shift) BETWEEN ? AND ?",
            arrayOf(xMin.toString(), xMax.toString(), yMin.toString(), yMax.toString()),
        ).use { cursor ->
            while (cursor.moveToNext()) regions += cursor.getInt(0) to cursor.getInt(1)
        }
        return regions
    }

    // ---- Claims ----

    fun insertClaim(claim: Claim) {
        writableDatabase.insertOrThrow("claims", null, ContentValues().apply {
            put("id", claim.id)
            put("name", claim.name)
            put("x_min", claim.xMin)
            put("y_min", claim.yMin)
            put("x_max", claim.xMax)
            put("y_max", claim.yMax)
            put("created_at", claim.createdAt)
            put("status", claim.status)
        })
    }

    fun listClaims(): List<Claim> = queryClaims("SELECT * FROM claims ORDER BY created_at DESC", null)

    fun firstClaimWithStatus(status: String): Claim? =
        queryClaims("SELECT * FROM claims WHERE status = ? ORDER BY created_at LIMIT 1", arrayOf(status)).firstOrNull()

    fun claimExists(id: String): Boolean =
        DatabaseUtils.longForQuery(readableDatabase, "SELECT COUNT(*) FROM claims WHERE id = ?", arrayOf(id)) > 0

    fun renameClaim(id: String, name: String) {
        writableDatabase.execSQL("UPDATE claims SET name = ? WHERE id = ?", arrayOf(name, id))
    }

    fun setClaimStatus(id: String, status: String) {
        writableDatabase.execSQL("UPDATE claims SET status = ? WHERE id = ?", arrayOf(status, id))
    }

    /** Les chunks de la zone redeviennent du cache ordinaire, nettoyé ensuite si besoin. */
    fun deleteClaim(id: String) {
        writableDatabase.execSQL("DELETE FROM claims WHERE id = ?", arrayOf(id))
        trimCache()
    }

    private fun queryClaims(sql: String, args: Array<String>?): List<Claim> {
        val claims = ArrayList<Claim>()
        readableDatabase.rawQuery(sql, args).use { cursor ->
            while (cursor.moveToNext()) {
                claims += Claim(
                    id = cursor.getString(cursor.getColumnIndexOrThrow("id")),
                    name = cursor.getString(cursor.getColumnIndexOrThrow("name")),
                    xMin = cursor.getInt(cursor.getColumnIndexOrThrow("x_min")),
                    yMin = cursor.getInt(cursor.getColumnIndexOrThrow("y_min")),
                    xMax = cursor.getInt(cursor.getColumnIndexOrThrow("x_max")),
                    yMax = cursor.getInt(cursor.getColumnIndexOrThrow("y_max")),
                    createdAt = cursor.getLong(cursor.getColumnIndexOrThrow("created_at")),
                    status = cursor.getString(cursor.getColumnIndexOrThrow("status")),
                )
            }
        }
        return claims
    }

    private fun ChunkId.args(): Array<String> = arrayOf(z.toString(), x.toString(), y.toString())

    companion object {
        const val CACHE_TARGET_BYTES = 500L * 1024 * 1024
        const val GLOBAL_LIMIT_BYTES = 1024L * 1024 * 1024
        private const val TAG = "ChunkStore"
        private const val DB_NAME = "chunks.db"
        private const val DB_VERSION = 2
        private const val TOUCH_INTERVAL_MS = 60_000L
        private const val TRIM_BATCH = 200
        private const val TRIM_CHECK_EVERY = 50

        /** SQL : le chunk courant (`chunks.z/x/y`) est dans le rectangle de régions du claim `alias` (même règle que ChunkMath.rangeAtZoom). */
        private fun covers(alias: String): String {
            val r = ChunkMath.REGION_ZOOM
            fun low(column: String) =
                "(CASE WHEN chunks.z <= $r THEN $alias.$column >> ($r - chunks.z) ELSE $alias.$column << (chunks.z - $r) END)"
            fun high(column: String) =
                "(CASE WHEN chunks.z <= $r THEN $alias.$column >> ($r - chunks.z) ELSE (($alias.$column + 1) << (chunks.z - $r)) - 1 END)"
            return "chunks.x BETWEEN ${low("x_min")} AND ${high("x_max")} AND chunks.y BETWEEN ${low("y_min")} AND ${high("y_max")}"
        }

        @Volatile
        private var instance: ChunkStore? = null

        fun get(context: Context): ChunkStore =
            instance ?: synchronized(this) {
                instance ?: ChunkStore(context.applicationContext).also { instance = it }
            }
    }
}
```

- [ ] **Step 2: Créer `android/app/src/main/java/fr/champimap/DownloadHub.kt`**

```kotlin
package fr.champimap

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet

/** Progression des téléchargements de claims, du service vers l'activité. */
object DownloadHub {

    data class Progress(val claimId: String, val done: Long, val total: Long, val waitingForNetwork: Boolean)

    interface Listener {
        fun onProgress(progress: Progress) {}
        fun onClaimsChanged() {}
    }

    private val listeners = CopyOnWriteArraySet<Listener>()
    private val latest = ConcurrentHashMap<String, Progress>()

    fun addListener(listener: Listener) {
        listeners.add(listener)
    }

    fun removeListener(listener: Listener) {
        listeners.remove(listener)
    }

    fun latest(): Collection<Progress> = latest.values

    fun publishProgress(progress: Progress) {
        latest[progress.claimId] = progress
        listeners.forEach { it.onProgress(progress) }
    }

    fun publishClaimsChanged() {
        listeners.forEach { it.onClaimsChanged() }
    }

    fun forget(claimId: String) {
        latest.remove(claimId)
    }
}
```

- [ ] **Step 3: Créer `android/app/src/main/java/fr/champimap/DownloadService.kt`**

```kotlin
package fr.champimap

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.concurrent.thread

/**
 * Télécharge les claims « downloading » un par un, en arrière-plan.
 * Réseau perdu → attend. Reprise = on recalcule les chunks manquants.
 */
class DownloadService : Service() {

    private val working = AtomicBoolean(false)
    private val store by lazy { ChunkStore.get(this) }

    @Volatile
    private var lastNotificationAt = 0L

    // Mis à vrai par onTimeout/onDestroy, lu depuis le thread de téléchargement (shouldContinue, boucles de
    // download/waitForNetwork) : arrête la passe en cours sans attendre la fin du claim ou du réseau.
    @Volatile
    private var stopped = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startInForeground(notification("Préparation…", 0, 0))
        if (working.compareAndSet(false, true)) {
            thread(name = "claims-download") {
                try {
                    while (!stopped) {
                        val claim = store.firstClaimWithStatus(Claim.DOWNLOADING) ?: break
                        download(claim)
                    }
                } catch (e: Exception) {
                    // Le thread tourne sans UI pour rattraper une exception : une exception non gérée ici tuerait
                    // le processus, y compris avec l'app en arrière-plan.
                    Log.w(TAG, "Téléchargement des zones hors ligne interrompu par une erreur inattendue", e)
                } finally {
                    working.set(false)
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
            }
        }
        return START_NOT_STICKY
    }

    // Android 15 limite la durée des services dataSync : on s'arrête proprement, la reprise se fera au prochain lancement.
    override fun onTimeout(startId: Int, fgsType: Int) {
        stopped = true
        stopSelf()
    }

    override fun onDestroy() {
        stopped = true
        super.onDestroy()
    }

    private fun download(claim: Claim) {
        val total = ChunkMath.countChunksOfRegions(claim.xMin, claim.yMin, claim.xMax, claim.yMax)
        var failedPasses = 0
        while (!stopped && store.claimExists(claim.id)) {
            waitForNetwork(claim, total)
            if (stopped || !store.claimExists(claim.id)) break
            val done = AtomicLong()
            val result = ChunkDownloader.downloadMissing(
                this,
                ChunkMath.chunksOfRegions(claim.xMin, claim.yMin, claim.xMax, claim.yMax),
                shouldContinue = { !stopped && Network.isOnline(this) && store.claimExists(claim.id) },
                onChunk = { publish(claim, done.incrementAndGet(), total, waitingForNetwork = false) },
            )
            if (result.cancelled) continue // passe interrompue (réseau perdu, zone supprimée ou service arrêté)
            // Des chunks hors couverture IGN échouent toujours : on n'insiste pas au-delà de 3 passes.
            if (result.failures == 0 || ++failedPasses >= MAX_FAILED_PASSES) {
                store.setClaimStatus(claim.id, Claim.COMPLETE)
                break
            }
        }
        DownloadHub.forget(claim.id)
        DownloadHub.publishClaimsChanged()
    }

    private fun waitForNetwork(claim: Claim, total: Long) {
        while (!stopped && !Network.isOnline(this) && store.claimExists(claim.id)) {
            publish(claim, 0, total, waitingForNetwork = true)
            Thread.sleep(NETWORK_POLL_MS)
        }
    }

    private fun publish(claim: Claim, done: Long, total: Long, waitingForNetwork: Boolean) {
        DownloadHub.publishProgress(DownloadHub.Progress(claim.id, done, total, waitingForNetwork))
        val now = System.currentTimeMillis()
        if (now - lastNotificationAt < 1_000) return
        lastNotificationAt = now
        val text = if (waitingForNetwork) "${claim.name} · en attente du réseau" else "${claim.name} · ${done * 100 / total} %"
        getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID, notification(text, done, total))
    }

    private fun notification(text: String, done: Long, total: Long): Notification {
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Zones hors ligne", NotificationManager.IMPORTANCE_LOW),
        )
        val openApp = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Téléchargement des zones hors ligne")
            .setContentText(text)
            .setContentIntent(openApp)
            .setOngoing(true)
            .setProgress(if (total > 0) 1000 else 0, if (total > 0) (done * 1000 / total).toInt() else 0, total == 0L)
            .build()
    }

    private fun startInForeground(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    companion object {
        private const val TAG = "DownloadService"
        private const val CHANNEL_ID = "downloads"
        private const val NOTIFICATION_ID = 2
        private const val NETWORK_POLL_MS = 5_000L
        private const val MAX_FAILED_PASSES = 3

        fun start(context: Context) {
            context.startForegroundService(Intent(context, DownloadService::class.java))
        }
    }
}
```

- [ ] **Step 4: Modifier `android/app/src/main/AndroidManifest.xml`**

- Ajouter après `<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />` :
```xml
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />
```
- Ajouter après la déclaration `<service android:name=".LocationService" … />` :
```xml
        <service
            android:name=".DownloadService"
            android:exported="false"
            android:foregroundServiceType="dataSync" />
```

- [ ] **Step 5: Modifier `MainActivity.kt`**

5a. Ajouter l'import `import org.json.JSONArray` (en plus de `org.json.JSONObject` déjà présent).

5b. Ajouter ce champ juste après le champ `locationListener` :
```kotlin
    private val downloadListener = object : DownloadHub.Listener {
        override fun onProgress(progress: DownloadHub.Progress) = bridge.emit("claimProgress", progress.toJson())
        override fun onClaimsChanged() = bridge.emit("claimsChanged", null)
    }
```

5c. Remplacer le handler `getStorageStats` de la phase 4 par :
```kotlin
        bridge.handle("getStorageStats") {
            val store = ChunkStore.get(this)
            // Un seul calcul de claimBytes() (jointure contre claims) : cacheBytes()/cacheTargetBytes() en
            // dérivent chacun un, l'appeler trois fois répéterait la même requête coûteuse.
            val claimBytes = store.claimBytes()
            JSONObject()
                .put("cacheBytes", store.totalBytes() - claimBytes)
                .put("cacheTargetBytes", minOf(ChunkStore.CACHE_TARGET_BYTES, maxOf(0L, ChunkStore.GLOBAL_LIMIT_BYTES - claimBytes)))
                .put("claimBytes", claimBytes)
        }
```

5d. Juste avant `bridge.install()`, ajouter :
```kotlin
        bridge.handle("listClaims") {
            val store = ChunkStore.get(this)
            JSONArray(store.listClaims().map { claim ->
                JSONObject()
                    .put("id", claim.id)
                    .put("name", claim.name)
                    .put("xMin", claim.xMin)
                    .put("yMin", claim.yMin)
                    .put("xMax", claim.xMax)
                    .put("yMax", claim.yMax)
                    .put("createdAt", claim.createdAt)
                    .put("status", claim.status)
                    .put("bytes", store.claimBytes(claim.id))
            })
        }
        bridge.handle("createClaim") { params ->
            val claim = Claim(
                id = params.getString("id"),
                name = params.getString("name"),
                xMin = params.getInt("xMin"),
                yMin = params.getInt("yMin"),
                xMax = params.getInt("xMax"),
                yMax = params.getInt("yMax"),
                createdAt = System.currentTimeMillis(),
                status = Claim.DOWNLOADING,
            )
            require(claim.xMax >= claim.xMin && claim.yMax >= claim.yMin) { "Rectangle de zone invalide" }
            ChunkStore.get(this).insertClaim(claim)
            runOnUiThread { DownloadService.start(this) }
            DownloadHub.publishClaimsChanged()
            null
        }
        bridge.handle("renameClaim") { params ->
            ChunkStore.get(this).renameClaim(params.getString("id"), params.getString("name"))
            DownloadHub.publishClaimsChanged()
            null
        }
        bridge.handle("deleteClaim") { params ->
            ChunkStore.get(this).deleteClaim(params.getString("id"))
            DownloadHub.publishClaimsChanged()
            null
        }
        bridge.handle("getChunkSizeAverages") {
            JSONObject().apply {
                ChunkStore.get(this@MainActivity).averageChunkBytesByZoom().forEach { (z, bytes) -> put(z.toString(), bytes) }
            }
        }
        bridge.handle("getAvailableRegions") { params ->
            JSONArray(
                ChunkStore.get(this)
                    .availableRegions(params.getInt("xMin"), params.getInt("yMin"), params.getInt("xMax"), params.getInt("yMax"))
                    .map { (x, y) -> JSONArray().put(x).put(y) },
            )
        }
```

5e. À la fin de `onCreate`, après `webView.loadUrl(BuildConfig.WEB_URL)`, ajouter la reprise des téléchargements interrompus :
```kotlin
        // Reprise après arrêt ou crash : un claim encore « downloading » relance le service.
        Thread {
            if (ChunkStore.get(this).firstClaimWithStatus(Claim.DOWNLOADING) != null) runOnUiThread { DownloadService.start(this) }
        }.start()
```

5f. Dans `onStart()`, après `LocationHub.setAppVisible(true)`, ajouter :
```kotlin
        DownloadHub.addListener(downloadListener)
        DownloadHub.latest().forEach { downloadListener.onProgress(it) }
```
Dans `onStop()`, avant `super.onStop()`, ajouter :
```kotlin
        DownloadHub.removeListener(downloadListener)
```

5g. Ajouter cette fonction d'extension juste après `Location.toJson()` :
```kotlin
    private fun DownloadHub.Progress.toJson(): JSONObject = JSONObject()
        .put("claimId", claimId)
        .put("done", done)
        .put("total", total)
        .put("waitingForNetwork", waitingForNetwork)
```

- [ ] **Step 6: Créer `web/src/claims/regions.ts`**

```ts
import type { LngLatBounds } from 'maplibre-gl';
import { MAX_DETAIL_ZOOM } from '../map/ign';

/** Une case (région) = l'emprise d'un chunk au zoom 13. Doit rester égal à ChunkMath.REGION_ZOOM. */
export const REGION_ZOOM = 13;
export const DEFAULT_CHUNK_BYTES = 70_000;
export const GLOBAL_WARNING_BYTES = 1024 ** 3;

export type RegionRect = { xMin: number; yMin: number; xMax: number; yMax: number };

const tilesAt = (zoom: number) => 2 ** zoom;
const clampIndex = (value: number, zoom: number) => Math.min(tilesAt(zoom) - 1, Math.max(0, value));

export function regionAt(lng: number, lat: number): { x: number; y: number } {
  const n = tilesAt(REGION_ZOOM);
  const rad = (lat * Math.PI) / 180;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return { x: clampIndex(x, REGION_ZOOM), y: clampIndex(y, REGION_ZOOM) };
}

export function rectFromRegions(a: { x: number; y: number }, b: { x: number; y: number }): RegionRect {
  return { xMin: Math.min(a.x, b.x), yMin: Math.min(a.y, b.y), xMax: Math.max(a.x, b.x), yMax: Math.max(a.y, b.y) };
}

export const regionCount = (rect: RegionRect) => (rect.xMax - rect.xMin + 1) * (rect.yMax - rect.yMin + 1);

const lonOf = (x: number) => (x / tilesAt(REGION_ZOOM)) * 360 - 180;
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / tilesAt(REGION_ZOOM)))) * 180) / Math.PI;

/** [[ouest, sud], [est, nord]] du rectangle de cases. */
export function rectBounds(rect: RegionRect): [[number, number], [number, number]] {
  return [
    [lonOf(rect.xMin), latOf(rect.yMax + 1)],
    [lonOf(rect.xMax + 1), latOf(rect.yMin)],
  ];
}

/** Anneau GeoJSON du rectangle de cases. */
export function rectRing(rect: RegionRect): number[][][] {
  const [[west, south], [east, north]] = rectBounds(rect);
  return [[[west, north], [east, north], [east, south], [west, south], [west, north]]];
}

export const regionSquare = (x: number, y: number) => rectRing({ xMin: x, yMin: y, xMax: x, yMax: y });

/** Même règle que ChunkMath.rangeAtZoom (Kotlin). */
function rangeAtZoom(min: number, max: number, zoom: number): [number, number] {
  if (zoom <= REGION_ZOOM) return [min >> (REGION_ZOOM - zoom), max >> (REGION_ZOOM - zoom)];
  const factor = 2 ** (zoom - REGION_ZOOM);
  return [min * factor, (max + 1) * factor - 1];
}

function chunksAtZoom(rect: RegionRect, zoom: number): number {
  const [x0, x1] = rangeAtZoom(rect.xMin, rect.xMax, zoom);
  const [y0, y1] = rangeAtZoom(rect.yMin, rect.yMax, zoom);
  return (x1 - x0 + 1) * (y1 - y0 + 1);
}

export function chunkCount(rect: RegionRect): number {
  let total = 0;
  for (let zoom = 0; zoom <= MAX_DETAIL_ZOOM; zoom++) total += chunksAtZoom(rect, zoom);
  return total;
}

/** Octets estimés : moyenne réelle par zoom quand elle existe, sinon 70 KB. */
export function estimateBytes(rect: RegionRect, averages: Record<string, number>): number {
  let total = 0;
  for (let zoom = 0; zoom <= MAX_DETAIL_ZOOM; zoom++) {
    total += chunksAtZoom(rect, zoom) * (averages[String(zoom)] ?? DEFAULT_CHUNK_BYTES);
  }
  return total;
}

/** Rectangle des cases visibles dans l'emprise de la carte. */
export function regionsInView(bounds: LngLatBounds): RegionRect {
  return rectFromRegions(regionAt(bounds.getWest(), bounds.getNorth()), regionAt(bounds.getEast(), bounds.getSouth()));
}
```

- [ ] **Step 7: Modifier `web/src/bridge/bridge.ts`**

- Après `export type AppSettings = …`, ajouter :
```ts
export type Claim = {
  id: string;
  name: string;
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
  createdAt: number;
  status: 'downloading' | 'complete';
  bytes: number;
};
export type ClaimProgress = { claimId: string; done: number; total: number; waitingForNetwork: boolean };
type RegionRectParams = { xMin: number; yMin: number; xMax: number; yMax: number };
```
- Dans `BridgeMethods`, ajouter après `setPrefetchOnMobileData` :
```ts
  listClaims: { params: Record<string, never>; result: Claim[] };
  createClaim: { params: RegionRectParams & { id: string; name: string }; result: null };
  renameClaim: { params: { id: string; name: string }; result: null };
  deleteClaim: { params: { id: string }; result: null };
  getChunkSizeAverages: { params: Record<string, never>; result: Record<string, number> };
  getAvailableRegions: { params: RegionRectParams; result: [number, number][] };
```
- Dans `BridgeEvents`, ajouter après `locationState` :
```ts
  claimProgress: ClaimProgress;
  claimsChanged: null;
```

- [ ] **Step 8: Modifier `web/src/bridge/fakeNative.ts`**

- Ajouter sous `let watchId: number | null = null;` :
```ts
type FakeClaim = { id: string; name: string; xMin: number; yMin: number; xMax: number; yMax: number; createdAt: number; status: 'complete'; bytes: number };
const fakeClaims: FakeClaim[] = [];
```
- Dans `handlers`, ajouter après `setPrefetchOnMobileData` :
```ts
  // Navigateur du PC : pas de téléchargement, une zone est « complète » dès sa création.
  listClaims: () => [...fakeClaims],
  createClaim: (params) => {
    fakeClaims.unshift({ ...(params as Omit<FakeClaim, 'createdAt' | 'status' | 'bytes'>), createdAt: Date.now(), status: 'complete', bytes: 0 });
    setTimeout(() => emitFake('claimsChanged', null), 0);
    return null;
  },
  renameClaim: (params) => {
    const claim = fakeClaims.find((c) => c.id === params.id);
    if (claim) claim.name = String(params.name);
    setTimeout(() => emitFake('claimsChanged', null), 0);
    return null;
  },
  deleteClaim: (params) => {
    const index = fakeClaims.findIndex((c) => c.id === params.id);
    if (index >= 0) fakeClaims.splice(index, 1);
    setTimeout(() => emitFake('claimsChanged', null), 0);
    return null;
  },
  getChunkSizeAverages: () => ({}),
  getAvailableRegions: () => [],
```

- [ ] **Step 9: Masquer le message des gestes coopératifs dans `web/src/index.css`**

Ajouter à la fin :
```css
/* Mode sélection de zone : un doigt dessine, deux doigts déplacent. MapLibre afficherait « utilisez deux doigts ». */
.maplibregl-cooperative-gesture-screen {
  display: none !important;
}
```

- [ ] **Step 10: Créer `web/src/components/ClaimSelection.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { callNative, isAndroid, type StorageStats } from '../bridge/bridge';
import { formatBytes } from '../format/formatBytes';
import {
  estimateBytes,
  GLOBAL_WARNING_BYTES,
  rectFromRegions,
  rectRing,
  regionAt,
  regionCount,
  regionsInView,
  type RegionRect,
} from '../claims/regions';

type Props = {
  map: MapLibreMap;
  onDone: () => void;
};

const GRID_SOURCE = 'selection-grid';
const RECT_SOURCE = 'selection-rect';
const GRID_MIN_ZOOM = 9;
const EMPTY = { type: 'FeatureCollection', features: [] } as const;

function defaultClaimName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Zone du ${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

/** Mode sélection : grille de cases, un doigt (ou la souris sur PC) trace le rectangle. */
export function ClaimSelection({ map, onDone }: Props) {
  const [rect, setRect] = useState<RegionRect | null>(null);
  const [averages, setAverages] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(defaultClaimName);

  useEffect(() => {
    void callNative('getChunkSizeAverages', {}).then(setAverages);
    void callNative('getStorageStats', {}).then(setStats);
  }, []);

  // Gestes : sur Android, un doigt ne déplace plus la carte (deux doigts oui). Sur PC, la souris dessine.
  useEffect(() => {
    if (isAndroid) map.cooperativeGestures.enable();
    else map.dragPan.disable();
    map.boxZoom.disable();
    return () => {
      map.cooperativeGestures.disable();
      map.dragPan.enable();
      map.boxZoom.enable();
    };
  }, [map]);

  // Couches grille + rectangle.
  useEffect(() => {
    map.addSource(GRID_SOURCE, { type: 'geojson', data: EMPTY });
    map.addSource(RECT_SOURCE, { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'selection-grid', type: 'line', source: GRID_SOURCE, paint: { 'line-color': '#1f2937', 'line-width': 0.6, 'line-opacity': 0.5 } });
    map.addLayer({ id: 'selection-rect-fill', type: 'fill', source: RECT_SOURCE, paint: { 'fill-color': '#059669', 'fill-opacity': 0.25 } });
    map.addLayer({ id: 'selection-rect-line', type: 'line', source: RECT_SOURCE, paint: { 'line-color': '#047857', 'line-width': 2 } });

    const drawGrid = () => {
      const source = map.getSource(GRID_SOURCE) as GeoJSONSource | undefined;
      if (!source) return;
      if (map.getZoom() < GRID_MIN_ZOOM) {
        source.setData(EMPTY);
        return;
      }
      const view = regionsInView(map.getBounds());
      const lines: number[][][] = [];
      for (let x = view.xMin; x <= view.xMax + 1; x++) {
        const ring = rectRing({ xMin: x, yMin: view.yMin, xMax: x, yMax: view.yMax })[0];
        lines.push([ring[0], ring[3]]);
      }
      for (let y = view.yMin; y <= view.yMax + 1; y++) {
        const ring = rectRing({ xMin: view.xMin, yMin: y, xMax: view.xMax, yMax: y })[0];
        lines.push([ring[0], ring[1]]);
      }
      source.setData({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } });
    };
    drawGrid();
    map.on('moveend', drawGrid);

    return () => {
      map.off('moveend', drawGrid);
      for (const layer of ['selection-grid', 'selection-rect-fill', 'selection-rect-line']) if (map.getLayer(layer)) map.removeLayer(layer);
      for (const source of [GRID_SOURCE, RECT_SOURCE]) if (map.getSource(source)) map.removeSource(source);
    };
  }, [map]);

  // Dessin : ancre au premier contact, coin opposé en suivant le doigt ou la souris.
  useEffect(() => {
    const container = map.getCanvasContainer();
    let anchor: { x: number; y: number } | null = null;

    const regionUnder = (clientX: number, clientY: number) => {
      const box = container.getBoundingClientRect();
      const lngLat = map.unproject([clientX - box.left, clientY - box.top]);
      return regionAt(lngLat.lng, lngLat.lat);
    };
    const start = (clientX: number, clientY: number) => {
      anchor = regionUnder(clientX, clientY);
      setRect(rectFromRegions(anchor, anchor));
    };
    const extend = (clientX: number, clientY: number) => {
      if (anchor) setRect(rectFromRegions(anchor, regionUnder(clientX, clientY)));
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 1) start(event.touches[0].clientX, event.touches[0].clientY);
      else anchor = null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 1) extend(event.touches[0].clientX, event.touches[0].clientY);
    };
    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 0) start(event.clientX, event.clientY);
    };
    const onMouseMove = (event: MouseEvent) => {
      if (event.buttons & 1) extend(event.clientX, event.clientY);
    };
    const stop = () => {
      anchor = null;
    };

    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: true });
    container.addEventListener('touchend', stop);
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', stop);
    return () => {
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchmove', onTouchMove);
      container.removeEventListener('touchend', stop);
      container.removeEventListener('mousedown', onMouseDown);
      container.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stop);
    };
  }, [map]);

  useEffect(() => {
    const source = map.getSource(RECT_SOURCE) as GeoJSONSource | undefined;
    source?.setData(rect ? { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rectRing(rect) } } : EMPTY);
  }, [map, rect]);

  const estimate = useMemo(() => (rect ? estimateBytes(rect, averages) : 0), [rect, averages]);
  const projectedTotal = stats ? stats.cacheBytes + stats.claimBytes + estimate : 0;

  const confirm = async () => {
    if (!rect) return;
    await callNative('createClaim', { id: crypto.randomUUID(), name: name.trim() || defaultClaimName(), ...rect });
    onDone();
  };

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-2xl bg-white p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.2)]">
      {naming ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <h2 className="text-lg font-semibold">Nom de la zone</h2>
          <input aria-label="Nom de la zone" value={name} onChange={(event) => setName(event.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-base" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setNaming(false)} className="flex-1 rounded-lg bg-gray-100 py-3 font-medium">
              Retour
            </button>
            <button type="submit" className="flex-1 rounded-lg bg-emerald-700 py-3 font-medium text-white">
              Télécharger
            </button>
          </div>
        </form>
      ) : (
        <>
          <h2 className="text-lg font-semibold">Nouvelle zone hors ligne</h2>
          <p className="mt-1 text-sm text-gray-600">
            {rect
              ? `${regionCount(rect)} case${regionCount(rect) > 1 ? 's' : ''} · ≈ ${formatBytes(estimate)}`
              : isAndroid
                ? 'Trace un rectangle avec un doigt. Deux doigts pour déplacer la carte.'
                : 'Trace un rectangle à la souris. Molette pour zoomer.'}
          </p>
          {rect && projectedTotal > GLOBAL_WARNING_BYTES && (
            <p className="mt-2 rounded-lg bg-amber-100 p-2 text-sm font-medium text-amber-900">
              ⚠️ L'app occupera ≈ {formatBytes(projectedTotal)} (plus de 1 Go). Les cartes vues récemment seront réduites d'autant.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={onDone} className="flex-1 rounded-lg bg-gray-100 py-3 font-medium">
              Annuler
            </button>
            <button type="button" disabled={!rect} onClick={() => setNaming(true)} className="flex-1 rounded-lg bg-emerald-700 py-3 font-medium text-white disabled:opacity-40">
              Télécharger
            </button>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 11: Remplacer `web/src/components/BottomBar.tsx`**

```tsx
type Props = {
  onOpenWaypoints: () => void;
  onOpenClaims: () => void;
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

export function BottomBar({ onOpenWaypoints, onOpenClaims, onOpenSettings }: Props) {
  return (
    <nav className="flex border-t border-gray-200 bg-white">
      <BarButton icon="📍" label="Waypoints" onClick={onOpenWaypoints} />
      <BarButton icon="🗺️" label="Zones hors ligne" onClick={onOpenClaims} />
      <BarButton icon="⚙️" label="Paramètres" onClick={onOpenSettings} />
    </nav>
  );
}
```

- [ ] **Step 12: Modifier `web/src/App.tsx`**

- Import : `import { ClaimSelection } from './components/ClaimSelection';`
- Après `const [centerOnNextFix, setCenterOnNextFix] = useState(false);`, ajouter : `const [selecting, setSelecting] = useState(false);`
- Remplacer `const viseur = useLongPressViseur(map, openCreateSheet);` par :
```tsx
  // Pas de viseur ni de création de waypoint en mode sélection de zone.
  const viseur = useLongPressViseur(selecting ? null : map, openCreateSheet);
```
- Remplacer `const hasLayer = sheet !== null || panel !== null;` par `const hasLayer = sheet !== null || panel !== null || selecting;`
- Remplacer le bloc d'abonnement au retour :
```tsx
  useEffect(
    () =>
      onNative('back', () => {
        if (sheet) setSheet(null);
        else setPanel(null);
      }),
    [sheet],
  );
```
par :
```tsx
  useEffect(
    () =>
      onNative('back', () => {
        if (sheet) setSheet(null);
        else if (selecting) setSelecting(false);
        else setPanel(null);
      }),
    [sheet, selecting],
  );
```
- Dans le JSX, juste avant `{panel === 'waypoints' && (`, ajouter :
```tsx
        {selecting && map && <ClaimSelection map={map} onDone={() => setSelecting(false)} />}
```
- Remplacer tout l'élément `<BottomBar … />` par (provisoire : Task 2 ouvrira d'abord la liste) :
```tsx
      <BottomBar
        onOpenWaypoints={openWaypointList}
        onOpenClaims={() => {
          setSheet(null);
          setPanel(null);
          setSelecting(true);
        }}
        onOpenSettings={() => {
          setSheet(null);
          setPanel('settings');
        }}
      />
```

- [ ] **Step 13: Documenter le service dédié**

- `docs/mvp.md`, puce **Téléchargement** : remplacer « exécutés en Kotlin dans le service » par « exécutés en Kotlin dans des services au premier plan (pré-téléchargement dans le service de localisation, zones hors ligne dans un service de téléchargement dédié) ».
- `docs/adr/0001-cache-chunks-interception-kotlin-sqlite.md` : remplacer « tournent aussi en Kotlin, dans le service au premier plan » par « tournent aussi en Kotlin, dans des services au premier plan (`LocationService` pour le pré-téléchargement, `DownloadService` de type dataSync pour les claims) ».

- [ ] **Step 14: Vérifier types et builds**

```bash
cd web && npm run typecheck && npm run build
cd ../android && export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11" && ./gradlew assembleDebug
```
Expected: aucune erreur, `BUILD SUCCESSFUL`. Si `onTimeout(startId: Int, fgsType: Int)` ne compile pas (signature différente dans le SDK 36), utiliser la signature proposée par l'erreur du compilateur et le noter dans le rapport.

- [ ] **Step 15: Contrôle sur le téléphone** (après accord de l'utilisateur, procédure « lancer en debug »)

1. Mise à jour depuis la phase 4 : l'app démarre sans crash (migration `chunks.db` v1 → v2). `timeout 20 adb logcat -d | grep -i -E "AndroidRuntime|SQLite" | tail -20` : aucune exception.
2. Zoomer au niveau 11 sur une zone jamais vue. Tap « Zones hors ligne » : la grille apparaît.
3. Un doigt : `input swipe` sur environ 2 cases. Capture : rectangle vert aligné sur la grille, « 2 cases · ≈ N Mo ». La carte n'a pas bougé.
4. [Télécharger] → nom « Zone du JJ/MM » → [Télécharger]. Le mode sélection se ferme. La notification « Téléchargement des zones hors ligne » montre un pourcentage qui augmente.
5. Home (`input keyevent 3`), attendre 60 s : la notification progresse toujours. Revenir dans l'app.
6. Mode avion pendant le téléchargement (accord donné) : la notification passe à « en attente du réseau ». Désactiver le mode avion : la progression reprend.
7. `am force-stop fr.champimap` pendant le téléchargement, puis `am start` : la notification réapparaît et la progression continue sans repartir de zéro (les chunks déjà présents sont passés vite).
8. À la fin (notification disparue), mode avion, relancer, zoomer au niveau 17 dans la zone : carte nette. Désactiver le mode avion et vérifier `airplane_mode_on` = `0`.

- [ ] **Step 16: Commit**

```bash
git add android/app/src/main web/src docs/mvp.md docs/adr/0001-cache-chunks-interception-kotlin-sqlite.md
git commit -m "feat: zones hors ligne téléchargées en arrière-plan"
```

---

### Task 2: Liste des zones hors ligne

**Files:**
- Create: `web/src/claims/useClaims.ts`, `web/src/components/ClaimsPanel.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `callNative('listClaims'|'renameClaim'|'deleteClaim')`, `onNative('claimProgress'|'claimsChanged')`, `Claim`, `ClaimProgress` (Task 1), `rectBounds`, `formatBytes`, `ClaimSelection`.
- Produces:
  - `useClaims(): { claims: Claim[]; progress: Record<string, ClaimProgress> }`.
  - `ClaimsPanel` props `{ claims: Claim[]; progress: Record<string, ClaimProgress>; onNewClaim: () => void; onShow: (claim: Claim) => void; onClose: () => void }`.
  - `Panel = 'waypoints' | 'claims' | 'settings' | null`.

- [ ] **Step 1: Créer `web/src/claims/useClaims.ts`**

```ts
import { useEffect, useState } from 'react';
import { callNative, onNative, type Claim, type ClaimProgress } from '../bridge/bridge';

/** Zones hors ligne et progression des téléchargements, tenues à jour par les événements Kotlin. */
export function useClaims(): { claims: Claim[]; progress: Record<string, ClaimProgress> } {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [progress, setProgress] = useState<Record<string, ClaimProgress>>({});

  useEffect(() => {
    const refresh = () => {
      void callNative('listClaims', {}).then(setClaims);
    };
    refresh();
    const unsubscribers = [
      onNative('claimsChanged', () => {
        refresh();
        setProgress({});
      }),
      onNative('claimProgress', (update) => setProgress((current) => ({ ...current, [update.claimId]: update }))),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  return { claims, progress };
}
```

- [ ] **Step 2: Créer `web/src/components/ClaimsPanel.tsx`**

```tsx
import { useState } from 'react';
import { callNative, type Claim, type ClaimProgress } from '../bridge/bridge';
import { formatBytes } from '../format/formatBytes';

type Props = {
  claims: Claim[];
  progress: Record<string, ClaimProgress>;
  onNewClaim: () => void;
  onShow: (claim: Claim) => void;
  onClose: () => void;
};

function statusText(claim: Claim, progress: ClaimProgress | undefined): string {
  if (claim.status === 'complete') return 'Complète';
  if (!progress) return 'En attente';
  if (progress.waitingForNetwork) return 'En pause (pas de réseau)';
  return `${Math.floor((progress.done * 100) / Math.max(1, progress.total))} %`;
}

function ClaimRow({ claim, progress, onShow }: { claim: Claim; progress: ClaimProgress | undefined; onShow: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(claim.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className="border-b border-gray-100 px-4 py-3">
      {renaming ? (
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const trimmed = name.trim();
            if (trimmed) await callNative('renameClaim', { id: claim.id, name: trimmed });
            setRenaming(false);
          }}
        >
          <input aria-label="Nouveau nom" value={name} onChange={(event) => setName(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base" />
          <button type="submit" className="rounded-lg bg-emerald-700 px-4 font-medium text-white">
            OK
          </button>
        </form>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate font-medium">{claim.name}</span>
            <span className="text-sm whitespace-nowrap text-gray-500">{statusText(claim, progress)}</span>
          </div>
          <p className="text-sm text-gray-500">
            {formatBytes(claim.bytes)} · {new Date(claim.createdAt).toLocaleDateString('fr-FR')}
          </p>
          <div className="mt-2 flex gap-2 text-sm">
            <button type="button" onClick={onShow} className="rounded-lg bg-gray-100 px-3 py-2 font-medium">
              Voir sur la carte
            </button>
            <button type="button" onClick={() => setRenaming(true)} className="rounded-lg bg-gray-100 px-3 py-2 font-medium">
              Renommer
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                await callNative('deleteClaim', { id: claim.id });
              }}
              className={`rounded-lg px-3 py-2 font-medium ${confirmDelete ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'}`}
            >
              {confirmDelete ? 'Confirmer' : 'Supprimer'}
            </button>
          </div>
        </>
      )}
    </li>
  );
}

export function ClaimsPanel({ claims, progress, onNewClaim, onShow, onClose }: Props) {
  return (
    <section className="absolute inset-0 z-30 flex flex-col bg-white">
      <header className="flex items-center justify-between border-b border-gray-200 p-3">
        <h2 className="text-lg font-semibold">Zones hors ligne</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="px-3 py-2 text-xl text-gray-500">
          ✕
        </button>
      </header>
      <div className="p-3">
        <button type="button" onClick={onNewClaim} className="w-full rounded-lg bg-emerald-700 py-3 font-medium text-white">
          + Nouvelle zone hors ligne
        </button>
      </div>
      {claims.length === 0 ? (
        <p className="p-6 text-center text-gray-500">Aucune zone. Télécharge une zone avant de partir sans réseau.</p>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {claims.map((claim) => (
            <ClaimRow key={claim.id} claim={claim} progress={progress[claim.id]} onShow={() => onShow(claim)} />
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Modifier `web/src/App.tsx`**

- Imports : `import { ClaimsPanel } from './components/ClaimsPanel';`, `import { useClaims } from './claims/useClaims';`, `import { rectBounds } from './claims/regions';`
- Remplacer `export type Panel = 'waypoints' | 'settings' | null;` par `export type Panel = 'waypoints' | 'claims' | 'settings' | null;`
- Après `const location = useLocation();`, ajouter : `const { claims, progress } = useClaims();`
- Dans le JSX, juste après `{panel === 'settings' && <SettingsPanel onClose={() => setPanel(null)} />}`, ajouter :
```tsx
        {panel === 'claims' && (
          <ClaimsPanel
            claims={claims}
            progress={progress}
            onClose={() => setPanel(null)}
            onNewClaim={() => {
              setPanel(null);
              setSelecting(true);
            }}
            onShow={(claim) => {
              setPanel(null);
              setFollowMode('free');
              map?.fitBounds(rectBounds(claim), { padding: 40 });
            }}
          />
        )}
```
- Dans `<BottomBar …>`, remplacer le handler `onOpenClaims` par :
```tsx
        onOpenClaims={() => {
          setSheet(null);
          setSelecting(false);
          setPanel('claims');
        }}
```

- [ ] **Step 4: Vérifier types et build**

```bash
cd web && npm run typecheck && npm run build
```
Expected: aucune erreur.

- [ ] **Step 5: Contrôle sur le téléphone** (après accord de l'utilisateur, procédure « lancer en debug »)

1. Tap « Zones hors ligne » : la liste montre la zone de la Task 1, avec « Complète », sa taille (Mo) et sa date.
2. [+ Nouvelle zone hors ligne] : le mode sélection s'ouvre. Créer une zone d'une case. Rouvrir la liste : la nouvelle zone affiche un pourcentage qui augmente (rouvrir la liste après 10 s).
3. [Renommer] → `Forêt` → OK : le nom change.
4. [Voir sur la carte] : la liste se ferme et la carte cadre la zone.
5. [Supprimer] → [Confirmer] sur la zone d'une case : elle disparaît. Si elle était en cours, la notification s'arrête sous ~5 s.
6. Paramètres : « Zones hors ligne : N Mo » correspond à peu près à la somme des tailles affichées.
7. Retour Android depuis la liste : la liste se ferme.

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "feat(web): liste des zones hors ligne"
```

---

### Task 3: Brouillard et contours sur la carte

**Files:**
- Create: `web/src/components/ClaimOverlays.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `useClaims()` (Task 2), `callNative('getAvailableRegions')`, `rectRing`, `regionSquare`, `regionsInView`, `regionCount` (Task 1).
- Produces: `ClaimOverlays` props `{ map: MapLibreMap; claims: Claim[] }`.

- [ ] **Step 1: Créer `web/src/components/ClaimOverlays.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { callNative, type Claim } from '../bridge/bridge';
import { rectRing, regionCount, regionSquare, regionsInView } from '../claims/regions';

type Props = {
  map: MapLibreMap;
  claims: Claim[];
};

const CLAIMS_SOURCE = 'claims';
const OFFLINE_FOG_SOURCE = 'offline-fog';
const OFFLINE_FOG_MIN_ZOOM = 10;
const MAX_FOG_REGIONS = 1600;
const EMPTY = { type: 'FeatureCollection', features: [] } as const;

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/**
 * Brouillard :
 * - voile gris sur les zones en cours de téléchargement ;
 * - contour discret autour des zones complètes ;
 * - sans réseau, voile sur les cases ni en zone ni en cache.
 */
export function ClaimOverlays({ map, claims }: Props) {
  const online = useOnline();
  // Les sources n'existent qu'après le chargement du style : les effets suivants attendent `ready`.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const addLayers = () => {
      setReady(true);
      if (map.getSource(CLAIMS_SOURCE)) return;
      map.addSource(CLAIMS_SOURCE, { type: 'geojson', data: EMPTY });
      map.addSource(OFFLINE_FOG_SOURCE, { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'offline-fog', type: 'fill', source: OFFLINE_FOG_SOURCE, paint: { 'fill-color': '#6b7280', 'fill-opacity': 0.35 } });
      map.addLayer({
        id: 'claims-downloading',
        type: 'fill',
        source: CLAIMS_SOURCE,
        filter: ['==', ['get', 'status'], 'downloading'],
        paint: { 'fill-color': '#6b7280', 'fill-opacity': 0.45 },
      });
      map.addLayer({
        id: 'claims-complete',
        type: 'line',
        source: CLAIMS_SOURCE,
        filter: ['==', ['get', 'status'], 'complete'],
        paint: { 'line-color': '#047857', 'line-width': 1.5, 'line-opacity': 0.6, 'line-dasharray': [3, 2] },
      });
    };
    if (map.isStyleLoaded()) addLayers();
    else map.once('load', addLayers);
    return () => {
      map.off('load', addLayers);
    };
  }, [map]);

  useEffect(() => {
    if (!ready) return;
    const source = map.getSource(CLAIMS_SOURCE) as GeoJSONSource | undefined;
    source?.setData({
      type: 'FeatureCollection',
      features: claims.map((claim) => ({
        type: 'Feature',
        properties: { status: claim.status },
        geometry: { type: 'Polygon', coordinates: rectRing(claim) },
      })),
    });
  }, [map, claims, ready]);

  useEffect(() => {
    if (!ready) return;
    const fogSource = () => map.getSource(OFFLINE_FOG_SOURCE) as GeoJSONSource | undefined;
    if (online) {
      fogSource()?.setData(EMPTY);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const view = regionsInView(map.getBounds());
      if (map.getZoom() < OFFLINE_FOG_MIN_ZOOM || regionCount(view) > MAX_FOG_REGIONS) {
        fogSource()?.setData(EMPTY);
        return;
      }
      const available = new Set((await callNative('getAvailableRegions', view)).map(([x, y]) => `${x}:${y}`));
      if (cancelled) return;
      const covered = (x: number, y: number) =>
        available.has(`${x}:${y}`) ||
        claims.some((claim) => claim.status === 'complete' && x >= claim.xMin && x <= claim.xMax && y >= claim.yMin && y <= claim.yMax);
      const squares: number[][][][] = [];
      for (let x = view.xMin; x <= view.xMax; x++) {
        for (let y = view.yMin; y <= view.yMax; y++) if (!covered(x, y)) squares.push(regionSquare(x, y));
      }
      fogSource()?.setData({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: squares } });
    };
    void refresh();
    map.on('moveend', refresh);
    return () => {
      cancelled = true;
      map.off('moveend', refresh);
    };
  }, [map, claims, online, ready]);

  return null;
}
```

- [ ] **Step 2: Modifier `web/src/App.tsx`**

- Import : `import { ClaimOverlays } from './components/ClaimOverlays';`
- Dans le JSX, juste après `<GpsBadge location={location} stale={stale} />` (le prop `stale` vient du
  reliquat de la revue finale phase 3), ajouter :
```tsx
        {map && <ClaimOverlays map={map} claims={claims} />}
```

- [ ] **Step 3: Vérifier types et build**

```bash
cd web && npm run typecheck && npm run build
```
Expected: aucune erreur.

- [ ] **Step 4: Contrôle sur le téléphone** (après accord de l'utilisateur, procédure « lancer en debug »)

1. Créer une zone d'une case. Pendant son téléchargement, capture : la case est voilée de gris.
2. À la fin : voile retiré, contour vert pointillé autour de la zone. La zone de la Task 1 a aussi un contour.
3. Mode avion (accord donné), attendre 3 s, zoomer au niveau 11 autour d'une zone complète : les cases ni en zone ni déjà vues sont voilées, la zone complète et les secteurs parcourus ne le sont pas.
4. Dézoomer sous le niveau 10 : pas de voile hors ligne.
5. Désactiver le mode avion : le voile hors ligne disparaît sous ~3 s. Vérifier `airplane_mode_on` = `0`.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "feat(web): brouillard et contours des zones hors ligne"
```
