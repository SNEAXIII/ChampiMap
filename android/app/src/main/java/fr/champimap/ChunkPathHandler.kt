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
