package fr.champimap

import android.content.Context
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

object ChunkDownloader {
    /** Moitié du plafond IGN (ChunkSource.backgroundLimit) : ne dispute pas les threads pour rien au-delà. */
    const val PARALLEL = 2
    private const val BATCH = 64

    /**
     * Télécharge les chunks absents de la base, 2 à la fois. S'arrête entre deux lots si `shouldContinue()` devient faux.
     * `onChunk(ok)` est appelé pour chaque chunk traité (déjà présent ou téléchargé = ok). Renvoie le nombre d'échecs.
     */
    fun downloadMissing(
        context: Context,
        chunks: Sequence<ChunkId>,
        shouldContinue: () -> Boolean,
        onChunk: (ok: Boolean) -> Unit,
    ): Int {
        val store = ChunkStore.get(context)
        val pool = Executors.newFixedThreadPool(PARALLEL)
        val failures = AtomicInteger()
        try {
            for (batch in chunks.chunked(BATCH)) {
                if (!shouldContinue()) break
                batch.map { id ->
                    pool.submit {
                        val ok = store.contains(id) || ChunkSource.download(id, interactive = false)?.also { store.write(id, it) } != null
                        if (!ok) failures.incrementAndGet()
                        onChunk(ok)
                    }
                }.forEach { it.get() }
            }
        } finally {
            pool.shutdown()
        }
        return failures.get()
    }
}
