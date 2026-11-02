package fr.champimap

import android.content.Context
import android.location.Location
import android.util.Log
import java.io.File
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Parcours : petits points posés derrière l'utilisateur pendant qu'il marche, pour retrouver son chemin.
 * Enregistré côté natif (depuis le service de localisation) pour continuer téléphone en poche, app en
 * arrière-plan : la page n'est alors plus à l'écoute des positions.
 *
 * Stockage : un fichier texte, une ligne « lat,lon,time » par point, ajoutée à la fin à chaque nouveau point.
 */
object TrackStore {

    data class Point(val latitude: Double, val longitude: Double, val time: Long)

    interface Listener {
        fun onPoint(point: Point)
        fun onCleared()
    }

    private const val TAG = "TrackStore"
    private const val FILE_NAME = "track.txt"

    // Écart minimal entre deux points : en dessous, le bruit GPS dessinerait une pelote autour de soi.
    private const val MIN_SPACING_M = 10f

    // Un fix moins précis que ça placerait un point à côté du vrai chemin (sous les arbres, au démarrage).
    private const val MAX_ACCURACY_M = 30f

    // Pas de point depuis plus longtemps : c'est une nouvelle sortie, l'ancien parcours est effacé.
    private const val NEW_TRACK_GAP_MS = 6 * 60 * 60 * 1000L

    // Au-delà (≈ 50 km à 10 m d'écart), les plus vieux points sont oubliés.
    private const val MAX_POINTS = 5000

    private val listeners = CopyOnWriteArraySet<Listener>()
    private var points: ArrayDeque<Point>? = null

    fun addListener(listener: Listener) {
        listeners.add(listener)
    }

    fun removeListener(listener: Listener) {
        listeners.remove(listener)
    }

    @Synchronized
    fun points(context: Context): List<Point> = load(context).toList()

    /** Ajoute la position au parcours si elle est assez précise et assez loin du dernier point. */
    fun onFix(context: Context, fix: Location) {
        if (!fix.hasAccuracy() || fix.accuracy > MAX_ACCURACY_M) return
        val point = Point(fix.latitude, fix.longitude, fix.time)
        val cleared: Boolean
        synchronized(this) {
            val points = load(context)
            val last = points.lastOrNull()
            cleared = last != null && point.time - last.time > NEW_TRACK_GAP_MS
            if (cleared) {
                points.clear()
                file(context).delete()
            } else if (last != null) {
                val distance = FloatArray(1)
                Location.distanceBetween(last.latitude, last.longitude, point.latitude, point.longitude, distance)
                if (distance[0] < MIN_SPACING_M) return
            }
            points.addLast(point)
            if (points.size > MAX_POINTS) {
                while (points.size > MAX_POINTS) points.removeFirst()
                rewrite(context, points)
            } else {
                append(context, point)
            }
        }
        if (cleared) listeners.forEach { it.onCleared() }
        listeners.forEach { it.onPoint(point) }
    }

    fun clear(context: Context) {
        synchronized(this) {
            load(context).clear()
            file(context).delete()
        }
        listeners.forEach { it.onCleared() }
    }

    private fun file(context: Context) = File(context.filesDir, FILE_NAME)

    private fun load(context: Context): ArrayDeque<Point> {
        points?.let { return it }
        val loaded = ArrayDeque<Point>()
        try {
            val file = file(context)
            if (file.exists()) {
                file.forEachLine { line ->
                    val parts = line.split(',')
                    if (parts.size != 3) return@forEachLine
                    val latitude = parts[0].toDoubleOrNull() ?: return@forEachLine
                    val longitude = parts[1].toDoubleOrNull() ?: return@forEachLine
                    val time = parts[2].toLongOrNull() ?: return@forEachLine
                    loaded.addLast(Point(latitude, longitude, time))
                }
            }
        } catch (e: Exception) {
            // Fichier illisible : on repart d'un parcours vide plutôt que de bloquer la localisation.
            Log.w(TAG, "Lecture du parcours impossible", e)
        }
        while (loaded.size > MAX_POINTS) loaded.removeFirst()
        points = loaded
        return loaded
    }

    private fun Point.toLine() = "$latitude,$longitude,$time\n"

    private fun append(context: Context, point: Point) {
        try {
            file(context).appendText(point.toLine())
        } catch (e: Exception) {
            Log.w(TAG, "Écriture du parcours impossible", e)
        }
    }

    private fun rewrite(context: Context, points: Collection<Point>) {
        try {
            file(context).writeText(points.joinToString("") { it.toLine() })
        } catch (e: Exception) {
            Log.w(TAG, "Écriture du parcours impossible", e)
        }
    }
}
