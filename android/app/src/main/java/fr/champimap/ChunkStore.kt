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
            // `data` en dernier : sinon SQLite pousse `size`/`last_access` sur les pages de débordement
            // du BLOB, et SUM(size)/le tri par last_access doivent alors parcourir (quasi) tout le fichier.
            "CREATE TABLE chunks (" +
                "z INTEGER NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, " +
                "size INTEGER NOT NULL, last_access INTEGER NOT NULL, data BLOB NOT NULL, " +
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
        // Le total est calculé une fois, puis ajusté par lot : appeler totalBytes() (un SUM(size))
        // à chaque tour, potentiellement des centaines de fois pour vider un gros excédent, est inutile.
        var total = totalBytes()
        while (total > floor) {
            var batchBytes = 0L
            val rowids = ArrayList<Long>(TRIM_BATCH)
            writableDatabase.rawQuery(
                "SELECT rowid, size FROM chunks ORDER BY last_access LIMIT $TRIM_BATCH",
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
