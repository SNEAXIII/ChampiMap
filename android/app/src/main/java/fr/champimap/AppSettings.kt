package fr.champimap

import android.content.Context

object AppSettings {
    private const val PREFS = "settings"
    private const val PREFETCH_ON_MOBILE_DATA = "prefetch_on_mobile_data"
    private const val GPS_INTERVAL_SECONDS = "gps_interval_seconds"
    private const val CACHE_LIMIT_MB = "cache_limit_mb"

    fun prefetchOnMobileData(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(PREFETCH_ON_MOBILE_DATA, false)

    fun setPrefetchOnMobileData(context: Context, on: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(PREFETCH_ON_MOBILE_DATA, on).apply()
    }

    /** Intervalle entre deux positions GPS quand l'app est à l'écran. */
    fun gpsIntervalSeconds(context: Context): Int =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(GPS_INTERVAL_SECONDS, 5)

    fun setGpsIntervalSeconds(context: Context, seconds: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt(GPS_INTERVAL_SECONDS, seconds.coerceIn(1, 10)).apply()
    }

    /** Place maximale des cartes vues récemment (hors zones hors ligne), en Mo. */
    fun cacheLimitMb(context: Context): Int =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt(CACHE_LIMIT_MB, 500)

    fun setCacheLimitMb(context: Context, mb: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt(CACHE_LIMIT_MB, mb.coerceIn(100, 1024)).apply()
    }
}
