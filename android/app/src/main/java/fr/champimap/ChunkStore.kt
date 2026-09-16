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
