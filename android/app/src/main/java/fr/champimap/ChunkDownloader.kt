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
