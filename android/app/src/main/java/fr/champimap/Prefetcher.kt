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
        // Fix trop imprécis (intérieur, cold start GPS) : la région calculée serait peu fiable.
        if (!fix.hasAccuracy() || fix.accuracy > MAX_ACCURACY_M) return
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
                if (!result.cancelled) recordFinished(region, hadFailures = result.failures > 0)
            } catch (e: Exception) {
                // Le prefetch tourne sans UI pour rattraper une exception : une exception non gérée ici tuerait
                // le processus, y compris avec l'app en arrière-plan.
                Log.w(TAG, "Pré-téléchargement interrompu par une erreur inattendue", e)
            } finally {
                busy.set(false)
            }
        }
    }

    /**
     * Région déjà entièrement téléchargée (sans échec) parmi les [REGION_HISTORY_SIZE] dernières régions menées
     * à leur terme : rien à refaire. Avec échecs : nouvel essai après [RETRY_AFTER_FAILURE_MS]. On garde un petit
     * historique (pas seulement la dernière région) pour qu'un aller-retour de la position à la frontière de deux
     * régions (bruit GPS) ne relance pas une passe à chaque fix.
     */
    private fun shouldAttempt(region: Pair<Int, Int>): Boolean {
        val state = synchronized(regionHistory) { regionHistory[region] } ?: return true
        if (!state.hadFailures) return false
        return System.currentTimeMillis() - state.at > RETRY_AFTER_FAILURE_MS
    }

    private fun recordFinished(region: Pair<Int, Int>, hadFailures: Boolean) {
        synchronized(regionHistory) { regionHistory[region] = RegionState(System.currentTimeMillis(), hadFailures) }
    }

    private fun allowed(): Boolean =
        // S'arrête avec le service de localisation (ex. « Stop » depuis la notification, phase 3) :
        // pas de sens à continuer de télécharger des chunks autour d'une position qu'on ne suit plus.
        LocationHub.running &&
            Network.isOnline(appContext) &&
            (Network.isUnmetered(appContext) || AppSettings.prefetchOnMobileData(appContext))

    private data class RegionState(val at: Long, val hadFailures: Boolean)

    private companion object {
        const val TAG = "Prefetcher"
        const val RETRY_AFTER_FAILURE_MS = 15 * 60 * 1000L
        const val MAX_ACCURACY_M = 300f
        const val REGION_HISTORY_SIZE = 9

        // Partagés entre toutes les instances (pas seulement `this` object : LocationService recrée un
        // Prefetcher à chaque (re)démarrage du service via `by lazy`, alors qu'un thread de pré-téléchargement
        // de l'instance précédente peut encore tourner) : sinon deux passes pourraient tourner en même temps.
        val busy = AtomicBoolean(false)

        // Bornée aux [REGION_HISTORY_SIZE] dernières régions terminées ; accès protégé par
        // `synchronized(regionHistory)` (lu depuis le thread de localisation, écrit depuis le thread de
        // pré-téléchargement, potentiellement en parallèle).
        val regionHistory = object : LinkedHashMap<Pair<Int, Int>, RegionState>() {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Pair<Int, Int>, RegionState>) =
                size > REGION_HISTORY_SIZE
        }
    }
}
