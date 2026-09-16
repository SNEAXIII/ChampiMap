package fr.champimap

import android.content.Context
import android.location.Location
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/** Pré-télécharge la région de la position et ses 8 voisines quand on change de région. */
class Prefetcher(context: Context) {

    private val appContext = context.applicationContext
    private val busy = AtomicBoolean(false)

    @Volatile
    private var lastCompletedRegion: Pair<Int, Int>? = null

    fun onFix(fix: Location) {
        val region = ChunkMath.tileX(fix.longitude, ChunkMath.REGION_ZOOM) to ChunkMath.tileY(fix.latitude, ChunkMath.REGION_ZOOM)
        if (region == lastCompletedRegion || !allowed() || !busy.compareAndSet(false, true)) return
        thread(name = "prefetch", isDaemon = true) {
            try {
                val (x, y) = region
                val failures = ChunkDownloader.downloadMissing(
                    appContext,
                    ChunkMath.chunksOfRegions(x - 1, y - 1, x + 1, y + 1),
                    shouldContinue = ::allowed,
                    onChunk = {},
                )
                if (failures == 0 && allowed()) lastCompletedRegion = region
            } finally {
                busy.set(false)
            }
        }
    }

    private fun allowed(): Boolean =
        // S'arrête avec le service de localisation (ex. « Stop » depuis la notification, phase 3) :
        // pas de sens à continuer de télécharger des chunks autour d'une position qu'on ne suit plus.
        LocationHub.running &&
            Network.isOnline(appContext) &&
            (Network.isUnmetered(appContext) || AppSettings.prefetchOnMobileData(appContext))
}
