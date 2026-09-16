package fr.champimap

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Plan IGN v2 (Géoplateforme, WMTS sans clé). */
object ChunkSource {
    private const val USER_AGENT = "ChampiMap/0.1 (carte hors ligne, usage personnel)"

    private fun url(id: ChunkId) =
        "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
            "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM" +
            "&TILEMATRIX=${id.z}&TILEROW=${id.y}&TILECOL=${id.x}&FORMAT=image/png"

    /** Octets PNG du chunk, ou null (hors couverture, erreur réseau, réponse inattendue). */
    fun download(id: ChunkId): ByteArray? {
        val connection = URL(url(id)).openConnection() as HttpURLConnection
        connection.connectTimeout = 10_000
        connection.readTimeout = 15_000
        connection.setRequestProperty("User-Agent", USER_AGENT)
        return try {
            if (connection.responseCode == 200 && connection.contentType?.startsWith("image/") == true) {
                connection.inputStream.use { it.readBytes() }
            } else {
                null
            }
        } catch (e: IOException) {
            null
        } finally {
            connection.disconnect()
        }
    }
}
