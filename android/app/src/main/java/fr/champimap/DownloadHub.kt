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

    fun addListener(listener: Listener) {
        listeners.add(listener)
    }

    fun removeListener(listener: Listener) {
        listeners.remove(listener)
    }

    fun latest(): Collection<Progress> = latest.values

    fun publishProgress(progress: Progress) {
        latest[progress.claimId] = progress
        listeners.forEach { it.onProgress(progress) }
    }

    fun publishClaimsChanged() {
        listeners.forEach { it.onClaimsChanged() }
    }

    fun forget(claimId: String) {
        latest.remove(claimId)
    }
}
