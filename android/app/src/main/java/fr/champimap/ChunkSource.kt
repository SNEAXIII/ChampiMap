package fr.champimap

import android.util.Log
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Semaphore

/** Résultat d'une requête IGN pour un chunk. */
sealed interface Fetch {
    class Data(val bytes: ByteArray) : Fetch

    /** 404 : l'IGN n'a pas d'image ici (hors couverture : mer, étranger). Réessayer ne sert à rien. */
    data object Missing : Fetch

    /** Erreur réseau, délai dépassé, 429/5xx, réponse inattendue : peut réussir plus tard. */
    data object Failed : Fetch
}

/** Plan IGN v2 (Géoplateforme, WMTS sans clé). */
object ChunkSource {
    private const val TAG = "ChunkSource"
    private const val USER_AGENT = "ChampiMap/0.1 (carte hors ligne, usage personnel)"
    private const val CONNECT_TIMEOUT_MS = 5_000
    private const val READ_TIMEOUT_MS = 8_000

    // Plafonds séparés pour que les téléchargements de fond (ChunkDownloader, pré-téléchargement puis claims) ne
    // puissent jamais affamer les tuiles à l'écran (ChunkPathHandler, threads WebView non bornés) : 8 + 8 = 16
    // requêtes IGN au total. Le WMTS de la Géoplateforme n'a pas de limite de débit ; mesuré, le débit croît
    // linéairement jusqu'à 8 requêtes simultanées (≈ 50 chunks/s). À l'écran, 2 ne suffisaient pas : un zoom
    // demande une vingtaine de chunks par niveau traversé, et la carte restait floue plusieurs secondes.
    private val interactiveLimit = Semaphore(8)
    const val BACKGROUND_PARALLEL = 8
    private val backgroundLimit = Semaphore(BACKGROUND_PARALLEL)

    private fun url(id: ChunkId) =
        "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
            "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM" +
            "&TILEMATRIX=${id.z}&TILEROW=${id.y}&TILECOL=${id.x}&FORMAT=image/png"

    /** Octets PNG du chunk, ou null (hors couverture, erreur réseau, réponse inattendue). */
    fun download(id: ChunkId, interactive: Boolean = true): ByteArray? = (fetch(id, interactive) as? Fetch.Data)?.bytes

    fun fetch(id: ChunkId, interactive: Boolean = true): Fetch {
        val limit = if (interactive) interactiveLimit else backgroundLimit
        limit.acquire()
        try {
            var connection: HttpURLConnection? = null
            return try {
                connection = URL(url(id)).openConnection() as HttpURLConnection
                connection.connectTimeout = CONNECT_TIMEOUT_MS
                connection.readTimeout = READ_TIMEOUT_MS
                connection.setRequestProperty("User-Agent", USER_AGENT)
                val code = connection.responseCode
                if (code == 200 && connection.contentType?.startsWith("image/") == true) {
                    Fetch.Data(connection.inputStream.use { it.readBytes() })
                } else {
                    // Corps d'erreur lu jusqu'au bout : la connexion peut alors resservir (keep-alive).
                    connection.errorStream?.use { it.readBytes() }
                    if (code == 404) {
                        Fetch.Missing
                    } else {
                        Log.w(TAG, "Chunk $id : HTTP $code ${connection.contentType}")
                        Fetch.Failed
                    }
                }
            } catch (e: IOException) {
                Log.w(TAG, "Chunk $id : ${e.javaClass.simpleName} ${e.message}")
                // Connexion dans un état inconnu : on la ferme plutôt que de la remettre dans le pool.
                connection?.disconnect()
                Fetch.Failed
            }
        } finally {
            limit.release()
        }
    }
}
