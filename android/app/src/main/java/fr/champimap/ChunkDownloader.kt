package fr.champimap

import android.content.Context
import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/** `cancelled` : `shouldContinue()` est devenu faux avant que tous les chunks n'aient été traités. */
data class DownloadResult(val failures: Int, val cancelled: Boolean)

object ChunkDownloader {
    /** Plafond de fond d'IGN (ChunkSource.backgroundLimit) : au-delà, les threads attendraient le sémaphore. */
    const val PARALLEL = ChunkSource.BACKGROUND_PARALLEL
    private const val BATCH = 64
    private const val TAG = "ChunkDownloader"

    /**
     * Télécharge les chunks absents de la base, PARALLEL à la fois. S'arrête entre deux lots, et aussi juste avant
     * chaque téléchargement réseau à l'intérieur d'un lot, si `shouldContinue()` devient faux (résultat
     * `cancelled = true`) : un lot peut mettre plusieurs secondes, le réseau ou le service peuvent partir
     * avant la fin. Un chunk ainsi sauté ne compte ni comme réussi ni comme échoué. `onChunk(ok)` est appelé
     * pour chaque chunk traité (déjà présent ou téléchargé = ok).
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
        val cancelled = AtomicBoolean(false)
        try {
            for (batch in chunks.chunked(BATCH)) {
                if (!shouldContinue()) {
                    cancelled.set(true)
                    break
                }
                batch.map { id ->
                    pool.submit {
                        // store.contains/write peut lever (SQLiteFullException, disque plein…) : rattrapé ici plutôt
                        // que de laisser it.get() (plus bas) relayer une ExecutionException hors de cette fonction,
                        // ce qui tuerait le thread appelant (le prefetch tourne sans UI pour la rattraper).
                        // `ok = null` : chunk sauté (shouldContinue devenu faux), ni compté ni signalé à onChunk.
                        val ok: Boolean? = try {
                            when {
                                store.contains(id) -> true
                                !shouldContinue() -> null
                                else -> ChunkSource.download(id, interactive = false)?.also { store.write(id, it) } != null
                            }
                        } catch (e: Exception) {
                            Log.w(TAG, "Échec du chunk $id", e)
                            false
                        }
                        if (ok == null) {
                            cancelled.set(true)
                        } else {
                            if (!ok) failures.incrementAndGet()
                            onChunk(ok)
                        }
                    }
                }.forEach { it.get() }
            }
        } finally {
            pool.shutdown()
        }
        return DownloadResult(failures.get(), cancelled.get())
    }
}
