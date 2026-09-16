package fr.champimap

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.tan

data class ChunkId(val z: Int, val x: Int, val y: Int)

object ChunkMath {
    /** Une région = l'emprise d'un chunk à ce zoom (≈ 3 km de côté en France). */
    const val REGION_ZOOM = 13

    /** Détail maximal gardé hors ligne. */
    const val MAX_DETAIL_ZOOM = 17

    fun tileX(longitude: Double, zoom: Int): Int {
        val n = 1 shl zoom
        return floor((longitude + 180.0) / 360.0 * n).toInt().coerceIn(0, n - 1)
    }

    fun tileY(latitude: Double, zoom: Int): Int {
        val n = 1 shl zoom
        val rad = Math.toRadians(latitude)
        return floor((1.0 - ln(tan(rad) + 1.0 / cos(rad)) / PI) / 2.0 * n).toInt().coerceIn(0, n - 1)
    }

    /** Indices de chunks, au zoom donné, couvrant les régions min..max (bornes incluses). */
    fun rangeAtZoom(min: Int, max: Int, zoom: Int): IntRange =
        if (zoom <= REGION_ZOOM) {
            (min shr (REGION_ZOOM - zoom))..(max shr (REGION_ZOOM - zoom))
        } else {
            (min shl (zoom - REGION_ZOOM))..(((max + 1) shl (zoom - REGION_ZOOM)) - 1)
        }

    /** Tous les chunks z0 → z17 d'un rectangle de régions, zooms faibles d'abord. */
    fun chunksOfRegions(xMin: Int, yMin: Int, xMax: Int, yMax: Int): Sequence<ChunkId> = sequence {
        for (z in 0..MAX_DETAIL_ZOOM) {
            val ys = rangeAtZoom(yMin, yMax, z)
            for (x in rangeAtZoom(xMin, xMax, z)) {
                for (y in ys) yield(ChunkId(z, x, y))
            }
        }
    }

    fun countChunksOfRegions(xMin: Int, yMin: Int, xMax: Int, yMax: Int): Long =
        (0..MAX_DETAIL_ZOOM).sumOf { z ->
            val xs = rangeAtZoom(xMin, xMax, z)
            val ys = rangeAtZoom(yMin, yMax, z)
            (xs.last - xs.first + 1).toLong() * (ys.last - ys.first + 1)
        }
}
