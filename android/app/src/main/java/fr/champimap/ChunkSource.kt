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

    // Plafonds séparés pour que les téléchargements de fond (ChunkDownloader, pré-téléchargement puis claims) ne
    // puissent jamais affamer les tuiles à l'écran (ChunkPathHandler, threads WebView non bornés) : 2 + 8 = 10
    // requêtes IGN au total. Le WMTS de la Géoplateforme n'a pas de limite de débit ; mesuré, le débit croît
    // linéairement jusqu'à 8 requêtes simultanées (≈ 50 chunks/s).
    private val interactiveLimit = Semaphore(2)
    const val BACKGROUND_PARALLEL = 8
    private val backgroundLimit = Semaphore(BACKGROUND_PARALLEL)

    private fun url(id: ChunkId) =
        "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
            "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM" +
            "&TILEMATRIX=${id.z}&TILEROW=${id.y}&TILECOL=${id.x}&FORMAT=image/png"

    /** Octets PNG du chunk, ou null (hors couverture, erreur réseau, réponse inattendue). */
    fun download(id: ChunkId, interactive: Boolean = true): ByteArray? {
        val limit = if (interactive) interactiveLimit else backgroundLimit
        limit.acquire()
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
                    // Corps d'erreur lu jusqu'au bout : la connexion peut alors resservir (keep-alive).
                    connection.errorStream?.use { it.readBytes() }
                    null
                }
            } catch (e: IOException) {
                // Connexion dans un état inconnu : on la ferme plutôt que de la remettre dans le pool.
                connection?.disconnect()
                null
            }
        } finally {
            limit.release()
        }
    }
}
