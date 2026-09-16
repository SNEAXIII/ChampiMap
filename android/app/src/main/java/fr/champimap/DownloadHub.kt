package fr.champimap

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArraySet

/** Progression des téléchargements de claims, du service vers l'activité. */
object DownloadHub {

    data class Progress(val claimId: String, val done: Long, val total: Long, val waitingForNetwork: Boolean)

    interface Listener {
        fun onProgress(progress: Progress) {}
        fun onClaimsChanged() {}
    }

    private val listeners = CopyOnWriteArraySet<Listener>()
    private val latest = ConcurrentHashMap<String, Progress>()
    private val lastNotifiedAt = ConcurrentHashMap<String, Long>()

    // Une reprise ou une repasse peut traiter des dizaines de milliers de chunks déjà présents en quelques
    // secondes (un par onChunk) : notifier les listeners (WebView) à chaque chunk saturerait le thread UI et
    // le pont JS. `latest` reste à jour à chaque appel ; seule la notification des listeners est limitée.
    private const val THROTTLE_MS = 250L

    fun addListener(listener: Listener) {
        listeners.add(listener)
    }

    fun removeListener(listener: Listener) {
        listeners.remove(listener)
    }

    fun latest(): Collection<Progress> = latest.values

    /**
     * Notifie les listeners au plus ~4 fois par seconde par claim, mais toujours pour la valeur finale d'une
     * passe (`done >= total`) et à chaque changement d'attente réseau (y compris la toute première valeur,
     * `previous` alors `null`) : ces deux cas ne doivent jamais être retardés au point de sembler figés.
     */
    fun publishProgress(progress: Progress) {
        val previous = latest.put(progress.claimId, progress)
        val now = System.currentTimeMillis()
        val isFinal = progress.done >= progress.total
        val waitingChanged = previous?.waitingForNetwork != progress.waitingForNetwork
        val elapsed = now - (lastNotifiedAt[progress.claimId] ?: 0L)
        if (!isFinal && !waitingChanged && elapsed < THROTTLE_MS) return
        lastNotifiedAt[progress.claimId] = now
        listeners.forEach { it.onProgress(progress) }
    }

    fun publishClaimsChanged() {
        listeners.forEach { it.onClaimsChanged() }
    }

    fun forget(claimId: String) {
        latest.remove(claimId)
        lastNotifiedAt.remove(claimId)
    }
}
