package fr.champimap

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.concurrent.thread

/**
 * Télécharge les claims « downloading » un par un, en arrière-plan.
 * Réseau perdu → attend. Reprise = on recalcule les chunks manquants.
 */
class DownloadService : Service() {

    private val working = AtomicBoolean(false)
    private val store by lazy { ChunkStore.get(this) }

    @Volatile
    private var lastNotificationAt = 0L

    // Mis à vrai par onTimeout/onDestroy, lu depuis le thread de téléchargement (shouldContinue, boucles de
    // download/waitForNetwork) : arrête la passe en cours sans attendre la fin du claim ou du réseau.
    @Volatile
    private var stopped = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startInForeground(notification("Préparation…", 0, 0))
        if (working.compareAndSet(false, true)) {
            thread(name = "claims-download") {
                try {
                    while (!stopped) {
                        val claim = store.firstClaimWithStatus(Claim.DOWNLOADING) ?: break
                        download(claim)
                    }
                } catch (e: Exception) {
                    // Le thread tourne sans UI pour rattraper une exception : une exception non gérée ici tuerait
                    // le processus, y compris avec l'app en arrière-plan.
                    Log.w(TAG, "Téléchargement des zones hors ligne interrompu par une erreur inattendue", e)
                } finally {
                    working.set(false)
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                }
            }
        }
        return START_NOT_STICKY
    }

    // Android 15 limite la durée des services dataSync : on s'arrête proprement, la reprise se fera au prochain lancement.
    override fun onTimeout(startId: Int, fgsType: Int) {
        stopped = true
        stopSelf()
    }

    override fun onDestroy() {
        stopped = true
        super.onDestroy()
    }

    private fun download(claim: Claim) {
        val total = ChunkMath.countChunksOfRegions(claim.xMin, claim.yMin, claim.xMax, claim.yMax)
        var failedPasses = 0
        while (!stopped && store.claimExists(claim.id)) {
            waitForNetwork(claim, total)
            if (stopped || !store.claimExists(claim.id)) break
            val done = AtomicLong()
            val result = ChunkDownloader.downloadMissing(
                this,
                ChunkMath.chunksOfRegions(claim.xMin, claim.yMin, claim.xMax, claim.yMax),
                shouldContinue = { !stopped && Network.isOnline(this) && store.claimExists(claim.id) },
                onChunk = { publish(claim, done.incrementAndGet(), total, waitingForNetwork = false) },
            )
            if (result.cancelled) continue // passe interrompue (réseau perdu, zone supprimée ou service arrêté)
            // Des chunks hors couverture IGN échouent toujours : on n'insiste pas au-delà de 3 passes.
            if (result.failures == 0 || ++failedPasses >= MAX_FAILED_PASSES) {
                store.setClaimStatus(claim.id, Claim.COMPLETE)
                break
            }
        }
        DownloadHub.forget(claim.id)
        DownloadHub.publishClaimsChanged()
    }

    private fun waitForNetwork(claim: Claim, total: Long) {
        while (!stopped && !Network.isOnline(this) && store.claimExists(claim.id)) {
            publish(claim, 0, total, waitingForNetwork = true)
            Thread.sleep(NETWORK_POLL_MS)
        }
    }

    private fun publish(claim: Claim, done: Long, total: Long, waitingForNetwork: Boolean) {
        DownloadHub.publishProgress(DownloadHub.Progress(claim.id, done, total, waitingForNetwork))
        val now = System.currentTimeMillis()
        if (now - lastNotificationAt < 1_000) return
        lastNotificationAt = now
        val text = if (waitingForNetwork) "${claim.name} · en attente du réseau" else "${claim.name} · ${done * 100 / total} %"
        getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID, notification(text, done, total))
    }

    private fun notification(text: String, done: Long, total: Long): Notification {
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Zones hors ligne", NotificationManager.IMPORTANCE_LOW),
        )
        val openApp = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Téléchargement des zones hors ligne")
            .setContentText(text)
            .setContentIntent(openApp)
            .setOngoing(true)
            .setProgress(if (total > 0) 1000 else 0, if (total > 0) (done * 1000 / total).toInt() else 0, total == 0L)
            .build()
    }

    private fun startInForeground(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    companion object {
        private const val TAG = "DownloadService"
        private const val CHANNEL_ID = "downloads"
        private const val NOTIFICATION_ID = 2
        private const val NETWORK_POLL_MS = 5_000L
        private const val MAX_FAILED_PASSES = 3

        fun start(context: Context) {
            context.startForegroundService(Intent(context, DownloadService::class.java))
        }
    }
}
