package fr.champimap

import android.content.Context
import android.location.Location
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Deux pré-téléchargements autour de la position :
 * - la vue du bouton de localisation (zoom 16 de la carte = chunks z16/z17 autour de soi), à chaque fix, même en
 *   données mobiles (≈ 50 chunks, ≈ 400 Ko) : l'appui sur ◎ s'affiche alors depuis le cache ;
 * - la région de la position et ses 8 voisines (la sienne d'abord) quand on change de région, selon les réglages.
 */
class Prefetcher(context: Context) {

    private val appContext = context.applicationContext

    fun onFix(fix: Location) {
        // Fix trop imprécis (intérieur, cold start GPS) : la région calculée serait peu fiable.
        if (!fix.hasAccuracy() || fix.accuracy > MAX_ACCURACY_M) return
        prefetchLocateView(fix)
        val region = ChunkMath.tileX(fix.longitude, ChunkMath.REGION_ZOOM) to ChunkMath.tileY(fix.latitude, ChunkMath.REGION_ZOOM)
        // `shouldAttempt` (en mémoire, pas d'I/O) et le CAS de `busy` d'abord, sur le thread appelant (thread
        // principal de localisation) : `allowed()` (réseau, préférences) attend d'être dans le thread de fond
        // ci-dessous pour ne rien lire de coûteux sur ce thread.
        if (!shouldAttempt(region) || !busy.compareAndSet(false, true)) return
        thread(name = "prefetch", isDaemon = true) {
            try {
                if (!allowed()) return@thread
                val (x, y) = region
                // Sa propre région d'abord, puis les 8 voisines (les chunks z0–z13 communs sont sautés : déjà en base).
                val regions = sequence {
                    yield(x to y)
                    for (dx in -1..1) for (dy in -1..1) if (dx != 0 || dy != 0) yield(x + dx to y + dy)
                }
                val result = ChunkDownloader.downloadMissing(
                    appContext,
                    regions.flatMap { (rx, ry) -> ChunkMath.chunksOfRegions(rx, ry, rx, ry) },
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
     * Chunks affichés au zoom du bouton de localisation autour du fix (carte au zoom 16, chunks de 256 px : MapLibre
     * affiche du z17, avec le z16 en repli pendant le chargement). Relancé quand le fix change de chunk z17 ; les
     * chunks déjà en base sont sautés sans requête. Verrou propre : n'attend jamais la fin du pré-téléchargement
     * des régions, bien plus long.
     */
    private fun prefetchLocateView(fix: Location) {
        val x17 = ChunkMath.tileX(fix.longitude, 17)
        val y17 = ChunkMath.tileY(fix.latitude, 17)
        if (lastViewTile == x17 to y17 || !viewBusy.compareAndSet(false, true)) return
        thread(name = "prefetch-view", isDaemon = true) {
            try {
                if (!viewAllowed()) return@thread
                val chunks = sequence {
                    for (dy in -3..3) for (dx in -2..2) yield(ChunkId(17, x17 + dx, y17 + dy))
                    for (dy in -2..2) for (dx in -1..1) yield(ChunkId(16, (x17 shr 1) + dx, (y17 shr 1) + dy))
                }
                val result = ChunkDownloader.downloadMissing(appContext, chunks, shouldContinue = ::viewAllowed, onChunk = {})
                // Échecs ou passe interrompue : on retentera au prochain fix.
                if (!result.cancelled && result.failures == 0) lastViewTile = x17 to y17
            } catch (e: Exception) {
                Log.w(TAG, "Pré-téléchargement de la vue interrompu par une erreur inattendue", e)
            } finally {
                viewBusy.set(false)
            }
        }
    }

    private fun viewAllowed(): Boolean = LocationHub.running && Network.isOnline(appContext)

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
        val viewBusy = AtomicBoolean(false)

        /** Dernier chunk z17 dont la vue a été pré-téléchargée sans échec. */
        @Volatile
        var lastViewTile: Pair<Int, Int>? = null

        // Bornée aux [REGION_HISTORY_SIZE] dernières régions terminées ; accès protégé par
        // `synchronized(regionHistory)` (lu depuis le thread de localisation, écrit depuis le thread de
        // pré-téléchargement, potentiellement en parallèle).
        val regionHistory = object : LinkedHashMap<Pair<Int, Int>, RegionState>() {
            override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Pair<Int, Int>, RegionState>) =
                size > REGION_HISTORY_SIZE
        }
    }
}
