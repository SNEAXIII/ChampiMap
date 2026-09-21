package fr.champimap

import android.content.Context
import android.database.sqlite.SQLiteException
import android.util.Log
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.LinkedBlockingDeque
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

/**
 * Sert `/chunks/{z}/{x}/{y}` depuis le cache. Un chunk absent n'est jamais attendu ici : la réponse est un 404
 * immédiat, le chunk est téléchargé en arrière-plan puis signalé par [onChunksReady] (la page recharge alors ces
 * tuiles). Les threads de la WebView restent ainsi libres pour les chunks en cache : mesuré, un téléchargement
 * IGN (≈ 230 ms) bloquant un de ces threads faisait attendre des chunks en cache (≈ 6 ms) jusqu'à ≈ 5 s.
 *
 * Appelé sur un thread de la WebView, jamais le thread UI : `WebViewAssetLoader` ne rattrape aucune exception
 * levée ici, une exception non gérée ferait donc planter l'app (ex. `SQLiteFullException` disque plein).
 */
class ChunkPathHandler(context: Context) : WebViewAssetLoader.PathHandler {

    private val appContext = context.applicationContext
    private val store = ChunkStore.get(appContext)

    /** Chunks tout juste téléchargés pour l'écran, par lots ; appelé depuis un thread de fond. */
    @Volatile
    var onChunksReady: (List<ChunkId>) -> Unit = {}

    /** Chunks demandés et pas encore téléchargés (évite de lancer deux fois le même). */
    private val pending: MutableSet<ChunkId> = ConcurrentHashMap.newKeySet()

    // Pile (LIFO) bornée : pendant un zoom ou un glissé, les derniers chunks demandés sont ceux de la vue courante ;
    // les plus anciens, souvent déjà hors de l'écran, sont abandonnés quand la pile déborde.
    private val queue = object : LinkedBlockingDeque<Runnable>(MAX_QUEUED) {
        override fun offer(e: Runnable): Boolean {
            while (!offerFirst(e)) {
                (pollLast() as? Download)?.let { pending.remove(it.id) }
            }
            return true
        }

        override fun take(): Runnable = takeFirst()

        override fun poll(timeout: Long, unit: TimeUnit): Runnable? = pollFirst(timeout, unit)
    }

    private val downloads = ThreadPoolExecutor(PARALLEL, PARALLEL, 30, TimeUnit.SECONDS, queue).apply {
        allowCoreThreadTimeOut(true)
    }

    private inner class Download(val id: ChunkId) : Runnable {
        override fun run() {
            try {
                when (val fetched = ChunkSource.fetch(id)) {
                    is Fetch.Data -> {
                        store.write(id, fetched.bytes)
                        notifyReady(id)
                    }
                    Fetch.Missing -> if (missing.size < MAX_MISSING) missing.add(id)
                    Fetch.Failed -> Unit
                }
            } catch (e: Exception) {
                // Ex. SQLiteFullException (disque plein) : le chunk sera redemandé au prochain affichage.
                Log.w(TAG, "Téléchargement pour l'écran en échec pour $id", e)
            } finally {
                pending.remove(id)
            }
        }
    }

    // Regroupe les notifications : un zoom peut terminer des dizaines de chunks par seconde.
    private val ready = ArrayList<ChunkId>()
    private val notifier = Executors.newSingleThreadScheduledExecutor()

    private fun notifyReady(id: ChunkId) {
        synchronized(ready) {
            ready += id
            if (ready.size > 1) return
        }
        notifier.schedule({
            val batch = synchronized(ready) { ready.toList().also { ready.clear() } }
            onChunksReady(batch)
        }, NOTIFY_BATCH_MS, TimeUnit.MILLISECONDS)
    }

    override fun handle(path: String): WebResourceResponse {
        try {
            val id = parseId(path) ?: return response(404, "Not Found", EMPTY)

            val cached = try {
                store.read(id)
            } catch (e: SQLiteException) {
                Log.w(TAG, "Lecture du cache impossible pour $id, on retélécharge", e)
                null
            }
            if (cached != null) return response(200, "OK", cached)

            // Hors couverture IGN (404) déjà constaté, ou pas de réseau : rien à télécharger.
            if (id !in missing && Network.isOnline(appContext) && pending.add(id)) downloads.execute(Download(id))
            return response(404, "Not Found", EMPTY)
        } catch (e: Exception) {
            Log.w(TAG, "Échec inattendu pour /chunks/$path", e)
            return response(404, "Not Found", EMPTY)
        }
    }

    private fun parseId(path: String): ChunkId? {
        val parts = path.split('/')
        if (parts.size != 3) return null
        val z = parts[0].toIntOrNull() ?: return null
        val x = parts[1].toIntOrNull() ?: return null
        val y = parts[2].toIntOrNull() ?: return null
        if (z !in 0..ChunkMath.MAX_DETAIL_ZOOM) return null
        val tilesAtZoom = 1 shl z
        if (x !in 0 until tilesAtZoom || y !in 0 until tilesAtZoom) return null
        return ChunkId(z, x, y)
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
        const val TAG = "ChunkPathHandler"
        val EMPTY = ByteArray(0)

        /** Téléchargements simultanés pour l'écran (≤ ChunkSource.interactiveLimit, sinon ils attendraient). */
        const val PARALLEL = 8
        const val MAX_QUEUED = 256
        const val NOTIFY_BATCH_MS = 100L

        /** Chunks sans image chez l'IGN (404 : mer, étranger), pour la durée du processus. Borné par sécurité. */
        val missing: MutableSet<ChunkId> = ConcurrentHashMap.newKeySet()
        const val MAX_MISSING = 20_000
    }
}
