package fr.champimap

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Semaphore

/** Plan IGN v2 (Géoplateforme, WMTS sans clé). */
object ChunkSource {
    private const val USER_AGENT = "ChampiMap/0.1 (carte hors ligne, usage personnel)"
    private const val CONNECT_TIMEOUT_MS = 5_000
    private const val READ_TIMEOUT_MS = 8_000

    // Plafond global de requêtes IGN simultanées (contrainte du plan) : partagé par la navigation
    // (ChunkPathHandler, threads WebView non bornés) et les futurs téléchargements en lot (ChunkDownloader).
    private val concurrencyLimit = Semaphore(4)

    private fun url(id: ChunkId) =
        "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
            "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM" +
            "&TILEMATRIX=${id.z}&TILEROW=${id.y}&TILECOL=${id.x}&FORMAT=image/png"

    /** Octets PNG du chunk, ou null (hors couverture, erreur réseau, réponse inattendue). */
    fun download(id: ChunkId): ByteArray? {
        concurrencyLimit.acquire()
        try {
            var connection: HttpURLConnection? = null
            return try {
                connection = URL(url(id)).openConnection() as HttpURLConnection
                connection.connectTimeout = CONNECT_TIMEOUT_MS
                connection.readTimeout = READ_TIMEOUT_MS
                connection.setRequestProperty("User-Agent", USER_AGENT)
                if (connection.responseCode == 200 && connection.contentType?.startsWith("image/") == true) {
                    connection.inputStream.use { it.readBytes() }
                } else {
                    null
                }
            } catch (e: IOException) {
                null
            } finally {
                connection?.disconnect()
            }
        } finally {
            concurrencyLimit.release()
        }
    }
}
