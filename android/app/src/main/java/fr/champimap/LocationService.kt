package fr.champimap

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.location.GnssStatus
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority

/**
 * Garde le GPS actif, app visible ou non : haute précision, toutes les 5 s à l'écran, 30 s sinon.
 * S'arrête quand l'app est balayée des récents ou via « Stop » dans la notification.
 */
class LocationService : Service() {

    private lateinit var fused: FusedLocationProviderClient
    private lateinit var locationManager: LocationManager
    private var started = false
    private val prefetcher by lazy { Prefetcher(this) }

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val fix = result.lastLocation ?: return
            LocationHub.publishFix(fix)
            prefetcher.onFix(fix)
        }
    }

    private val gnssCallback = object : GnssStatus.Callback() {
        override fun onSatelliteStatusChanged(status: GnssStatus) {
            LocationHub.publishSatellites((0 until status.satelliteCount).count { status.usedInFix(it) })
        }
    }

    private val onVisibilityChanged: (Boolean) -> Unit = { visible ->
        requestUpdates()
        // Le statut GNSS brut n'intéresse que l'app au premier plan (affichage du badge) : on évite de
        // réveiller inutilement le récepteur GNSS pendant que l'app est en arrière-plan.
        if (visible) registerGnssStatus() else unregisterGnssStatus()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        fused = LocationServices.getFusedLocationProviderClient(this)
        locationManager = getSystemService(LocationManager::class.java)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            // Démarré via startService() (PendingIntent.getService) depuis la notification : pas
            // d'obligation startForeground ici, on ne fait que quitter le premier plan et s'arrêter.
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        if (!hasLocationPermission(this)) {
            // startForegroundService() impose quand même un startForeground(), même sans la permission :
            // sur API 34+ un type LOCATION sans permission peut lever une SecurityException. Best effort
            // seulement — la vraie protection est la vérification de permission côté appelant
            // (MainActivity.startLocation ne démarre le service qu'après l'avoir vérifiée).
            try {
                startInForeground()
            } catch (e: SecurityException) {
                Log.w(TAG, "startForeground refusé (permission manquante)", e)
            } catch (e: IllegalStateException) {
                Log.w(TAG, "startForeground refusé (service en arrière-plan)", e)
            }
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        startInForeground()
        if (!started) {
            started = true
            LocationHub.addVisibilityListener(onVisibilityChanged)
            requestUpdates()
            if (LocationHub.appVisible) registerGnssStatus()
            LocationHub.setRunning(true)
        }
        return START_NOT_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        stopSelf()
    }

    override fun onDestroy() {
        if (started) {
            fused.removeLocationUpdates(locationCallback)
            unregisterGnssStatus()
            LocationHub.removeVisibilityListener(onVisibilityChanged)
            // Le nombre de satellites n'a plus de sens une fois le GPS arrêté.
            LocationHub.publishSatellites(0)
            LocationHub.setRunning(false)
        }
        super.onDestroy()
    }

    @SuppressLint("MissingPermission")
    private fun requestUpdates() {
        val intervalMs = if (LocationHub.appVisible) VISIBLE_INTERVAL_MS else BACKGROUND_INTERVAL_MS
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
            .setMinUpdateIntervalMillis(intervalMs)
            .build()
        fused.removeLocationUpdates(locationCallback)
        fused.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
    }

    @SuppressLint("MissingPermission")
    private fun registerGnssStatus() {
        // Le statut GNSS brut (nombre de satellites) exige ACCESS_FINE_LOCATION : en position
        // approximative (COARSE seul, permission « Approximative »), s'y abonner lève une
        // SecurityException. Le nombre de satellites reste alors inconnu, ce qui n'empêche pas le fix.
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                locationManager.registerGnssStatusCallback(mainExecutor, gnssCallback)
            } else {
                locationManager.registerGnssStatusCallback(gnssCallback, Handler(Looper.getMainLooper()))
            }
        } catch (e: SecurityException) {
            // Idem : nombre de satellites inconnu, pas bloquant.
        }
    }

    // Sûr à appeler même si le callback n'était pas enregistré (permission absente, déjà en arrière-plan).
    private fun unregisterGnssStatus() {
        locationManager.unregisterGnssStatusCallback(gnssCallback)
    }

    private fun startInForeground() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Position", NotificationManager.IMPORTANCE_LOW),
        )
        val openApp = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            this, 1,
            Intent(this, LocationService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Champi Map utilise ta position")
            .setContentIntent(openApp)
            .setOngoing(true)
            .addAction(
                Notification.Action.Builder(
                    Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel), "Stop", stop,
                ).build(),
            )
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    companion object {
        const val ACTION_STOP = "fr.champimap.action.STOP_LOCATION"
        private const val TAG = "LocationService"
        private const val CHANNEL_ID = "location"
        private const val NOTIFICATION_ID = 1
        private const val VISIBLE_INTERVAL_MS = 5_000L
        private const val BACKGROUND_INTERVAL_MS = 30_000L

        fun hasLocationPermission(context: Context): Boolean =
            context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
                context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }
}
