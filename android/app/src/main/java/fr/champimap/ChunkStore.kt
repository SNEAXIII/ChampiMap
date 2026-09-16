package fr.champimap

import android.content.ContentValues
import android.content.Context
import android.database.DatabaseUtils
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteException
import android.database.sqlite.SQLiteOpenHelper
import android.util.Log
import java.util.concurrent.atomic.AtomicInteger

/** Base SQLite unique des chunks (ADR 0001). */
class ChunkStore private constructor(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {

    private val writesSinceTrimCheck = AtomicInteger()

    init {
        setWriteAheadLoggingEnabled(true)
    }

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        // Doit précéder la création des tables (base en version 1, jamais publiée : pas de migration à écrire).
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
        val target = cacheTargetBytes()
        var total = totalBytes()
        // Rien à faire tant qu'on n'a pas dépassé la cible elle-même : on ne vise la marge de 95 % que
        // lorsqu'il faut réellement nettoyer, pour ne pas frotter contre le seuil à chaque écriture.
        if (total <= target) return
        val floor = target * 95 / 100
        var deletedAny = false
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
            deletedAny = true
        }
        // Rend au système de fichiers l'espace des pages supprimées (auto_vacuum = INCREMENTAL ne le fait pas
        // seul, il faut l'appeler explicitement), sinon chunks.db ne rétrécit jamais malgré le nettoyage.
        if (deletedAny) {
            writableDatabase.rawQuery("PRAGMA incremental_vacuum", null).use { while (it.moveToNext()) { } }
        }
    }

    private fun ChunkId.args(): Array<String> = arrayOf(z.toString(), x.toString(), y.toString())

    companion object {
        const val CACHE_TARGET_BYTES = 500L * 1024 * 1024
        private const val TAG = "ChunkStore"
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
