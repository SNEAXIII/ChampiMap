package fr.champimap

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities

object Network {
    private fun capabilities(context: Context): NetworkCapabilities? {
        val manager = context.getSystemService(ConnectivityManager::class.java)
        return manager.getNetworkCapabilities(manager.activeNetwork)
    }

    fun isOnline(context: Context): Boolean =
        capabilities(context)?.let {
            it.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                it.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } == true

    /** Wi-Fi ou équivalent non facturé au volume. */
    fun isUnmetered(context: Context): Boolean =
        capabilities(context)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == true
}
