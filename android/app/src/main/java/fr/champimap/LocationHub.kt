package fr.champimap

import android.location.Location
import java.util.concurrent.CopyOnWriteArraySet

/** État de localisation partagé entre le service et l'activité (même processus). */
object LocationHub {

    interface Listener {
        fun onFix(fix: Location) {}
        fun onSatellites(count: Int) {}
        fun onRunningChanged(running: Boolean) {}
    }

    private val listeners = CopyOnWriteArraySet<Listener>()
    private val visibilityListeners = CopyOnWriteArraySet<(Boolean) -> Unit>()

    @Volatile var lastFix: Location? = null
        private set

    @Volatile var satellites: Int = 0
        private set

    @Volatile var running: Boolean = false
        private set

    @Volatile var appVisible: Boolean = false
        private set

    fun addListener(listener: Listener) {
        listeners.add(listener)
    }

    fun removeListener(listener: Listener) {
        listeners.remove(listener)
    }

    fun addVisibilityListener(listener: (Boolean) -> Unit) {
        visibilityListeners.add(listener)
    }

    fun removeVisibilityListener(listener: (Boolean) -> Unit) {
        visibilityListeners.remove(listener)
    }

    fun publishFix(fix: Location) {
        lastFix = fix
        listeners.forEach { it.onFix(fix) }
    }

    fun publishSatellites(count: Int) {
        satellites = count
        listeners.forEach { it.onSatellites(count) }
    }

    fun setRunning(value: Boolean) {
        running = value
        listeners.forEach { it.onRunningChanged(value) }
    }

    fun setAppVisible(visible: Boolean) {
        appVisible = visible
        visibilityListeners.forEach { it(visible) }
    }
}
