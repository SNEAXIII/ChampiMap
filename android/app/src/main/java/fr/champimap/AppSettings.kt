package fr.champimap

import android.content.Context

object AppSettings {
    private const val PREFS = "settings"
    private const val PREFETCH_ON_MOBILE_DATA = "prefetch_on_mobile_data"

    fun prefetchOnMobileData(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(PREFETCH_ON_MOBILE_DATA, false)

    fun setPrefetchOnMobileData(context: Context, on: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(PREFETCH_ON_MOBILE_DATA, on).apply()
    }
}
