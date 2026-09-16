package fr.champimap

import android.content.Context
import android.location.Location
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/** Pré-télécharge la région de la position et ses 8 voisines quand on change de région. */
class Prefetcher(context: Context) {

    private val appContext = context.applicationContext

    fun onFix(fix: Location) {
        val region = ChunkMath.tileX(fix.longitude, ChunkMath.REGION_ZOOM) to ChunkMath.tileY(fix.latitude, ChunkMath.REGION_ZOOM)
        // `shouldAttempt` (en mémoire, pas d'I/O) et le CAS de `busy` d'abord, sur le thread appelant (thread
        // principal de localisation) : `allowed()` (réseau, préférences) attend d'être dans le thread de fond
        // ci-dessous pour ne rien lire de coûteux sur ce thread.
        if (!shouldAttempt(region) || !busy.compareAndSet(false, true)) return
        thread(name = "prefetch", isDaemon = true) {
            try {
                if (!allowed()) return@thread
                val (x, y) = region
                val result = ChunkDownloader.downloadMissing(
                    appContext,
                    ChunkMath.chunksOfRegions(x - 1, y - 1, x + 1, y + 1),
                    shouldContinue = ::allowed,
                    onChunk = {},
                )
                // Une passe interrompue (réseau perdu, service arrêté) est retentée dès le prochain fix : on ne
                // retient donc la région que si elle est allée à son terme, avec ou sans échecs.
                if (!result.cancelled) {
                    lastRegion = region
                    lastRegionAt = System.currentTimeMillis()
                    lastRegionHadFailures = result.failures > 0
                }
            } catch (e: Exception) {
                // Le prefetch tourne sans UI pour rattraper une exception : une exception non gérée ici tuerait
                // le processus, y compris avec l'app en arrière-plan.
                Log.w(TAG, "Pré-téléchargement interrompu par une erreur inattendue", e)
            } finally {
                busy.set(false)
            }
        }
    }

    /** Même région déjà entièrement téléchargée (sans échec) : rien à refaire. Avec échecs : nouvel essai après [RETRY_AFTER_FAILURE_MS]. */
    private fun shouldAttempt(region: Pair<Int, Int>): Boolean {
        if (region != lastRegion) return true
        if (!lastRegionHadFailures) return false
        return System.currentTimeMillis() - lastRegionAt > RETRY_AFTER_FAILURE_MS
    }

    private fun allowed(): Boolean =
        // S'arrête avec le service de localisation (ex. « Stop » depuis la notification, phase 3) :
        // pas de sens à continuer de télécharger des chunks autour d'une position qu'on ne suit plus.
        LocationHub.running &&
            Network.isOnline(appContext) &&
            (Network.isUnmetered(appContext) || AppSettings.prefetchOnMobileData(appContext))

    private companion object {
        const val TAG = "Prefetcher"
        const val RETRY_AFTER_FAILURE_MS = 15 * 60 * 1000L

        // Partagés entre toutes les instances (pas seulement `this` object : LocationService recrée un
        // Prefetcher à chaque (re)démarrage du service via `by lazy`, alors qu'un thread de pré-téléchargement
        // de l'instance précédente peut encore tourner) : sinon deux passes pourraient tourner en même temps.
        val busy = AtomicBoolean(false)

        @Volatile
        var lastRegion: Pair<Int, Int>? = null

        @Volatile
        var lastRegionAt: Long = 0L

        @Volatile
        var lastRegionHadFailures: Boolean = false
    }
}
