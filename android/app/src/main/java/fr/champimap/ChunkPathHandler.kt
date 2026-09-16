package fr.champimap

import android.content.Context
import android.database.sqlite.SQLiteException
import android.util.Log
import android.webkit.WebResourceResponse
import androidx.webkit.WebViewAssetLoader
import java.io.ByteArrayInputStream

/**
 * Sert `/chunks/{z}/{x}/{y}` : depuis le cache, sinon depuis l'IGN si le réseau est là (et on garde le chunk).
 * Appelé sur un thread de la WebView, jamais le thread UI : `WebViewAssetLoader` ne rattrape aucune exception
 * levée ici, une exception non gérée ferait donc planter l'app (ex. `SQLiteFullException` disque plein).
 */
class ChunkPathHandler(context: Context) : WebViewAssetLoader.PathHandler {

    private val appContext = context.applicationContext
    private val store = ChunkStore.get(appContext)

    override fun handle(path: String): WebResourceResponse {
        try {
            val id = parseId(path) ?: return response(404, "Not Found", EMPTY)

            val cached = try {
                store.read(id)
            } catch (e: SQLiteException) {
                Log.w(TAG, "Lecture du cache impossible pour $id, on retélécharge", e)
                null
            }

            val data = cached ?: if (Network.isOnline(appContext)) {
                ChunkSource.download(id)?.also { downloaded ->
                    // Écriture séparée : si elle échoue (ex. disque plein), la tuile déjà téléchargée
                    // est quand même servie, elle ne sera simplement pas gardée en cache.
                    try {
                        store.write(id, downloaded)
                    } catch (e: SQLiteException) {
                        Log.w(TAG, "Écriture du cache impossible pour $id (disque plein ?)", e)
                    }
                }
            } else {
                null
            }

            return if (data != null) response(200, "OK", data) else response(404, "Not Found", EMPTY)
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
    }
}
