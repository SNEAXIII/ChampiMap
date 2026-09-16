package fr.champimap

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.location.Location
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.Lifecycle
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity : ComponentActivity() {

    private lateinit var webView: WebView
    private lateinit var bridge: NativeBridge
    private var locationPermissionDenied = false

    // StrictMode (debug) invoque effects deux fois : évite un double permissionLauncher.launch()
    // dont le second retour (map vide) serait pris pour un refus.
    private var permissionRequestInFlight = false

    // Activé par la page quand une feuille ou un panneau est ouvert : retour = fermer, pas quitter.
    private val backCallback = object : OnBackPressedCallback(false) {
        override fun handleOnBackPressed() {
            bridge.emit("back", null)
        }
    }

    private val locationListener = object : LocationHub.Listener {
        override fun onFix(fix: Location) = bridge.emit("location", fix.toJson())
        override fun onSatellites(count: Int) = bridge.emit("satellites", JSONObject().put("count", count))
        override fun onRunningChanged(running: Boolean) = emitLocationState()
    }

    private val permissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        permissionRequestInFlight = false
        // Map vide : résultat fantôme d'un second appel (StrictMode en debug), pas un vrai refus.
        if (granted.isEmpty()) return@registerForActivityResult
        val located = granted[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            granted[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        locationPermissionDenied = !located
        if (located) startLocationService()
        emitLocationState()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Edge-to-edge sur toutes les API (26+), pas seulement R+ : doit être appelé après super.onCreate()
        // (la fenêtre est attachée à ce moment) et avant setContentView(). Fond blanc pour rester cohérent
        // avec le fond de wrapInsideSystemBars ci-dessous.
        enableEdgeToEdge(SystemBarStyle.light(Color.WHITE, Color.WHITE))

        // chrome://inspect sur le PC en debug.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        // Release : sert assets/web/ sur https://appassets.androidplatform.net/assets/web/.
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            // Chunks de carte : cache SQLite, sinon IGN (ADR 0001).
            .addPathHandler("/chunks/", ChunkPathHandler(this))
            .build()

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowContentAccess = false
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

                // La WebView ne quitte jamais la page de l'app.
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean = !isSameOrigin(request.url)

                // Le renderer (processus séparé) peut mourir (OOM, crash) sans tuer notre processus :
                // on reconstruit l'activité au lieu de laisser une WebView morte à l'écran. Le service de
                // localisation (LocationHub/LocationService) n'est pas affecté, il tourne dans notre processus.
                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    recreate()
                    return true
                }
            }
        }

        bridge = NativeBridge(this, webView)
        bridge.handle("setBackEnabled") { params ->
            val enabled = params.getBoolean("enabled")
            runOnUiThread { backCallback.isEnabled = enabled }
            null
        }
        bridge.handle("startLocation") {
            runOnUiThread { startLocation() }
            null
        }
        bridge.handle("setKeepScreenOn") { params ->
            val on = params.getBoolean("on")
            runOnUiThread {
                if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
            null
        }
        bridge.install()
        onBackPressedDispatcher.addCallback(this, backCallback)

        setContentView(wrapInsideSystemBars(webView))
        // Sur le téléphone Samsung de test (voir commit e92ddef), les icônes système ne passaient en sombre
        // qu'après setContentView : enableEdgeToEdge() seul ne suffisait pas à ce moment-là. On garde donc cet
        // appel explicite en complément, après setContentView, tant que ce n'est pas revérifié sur l'appareil.
        setLightSystemBarIcons()
        webView.loadUrl(BuildConfig.WEB_URL)
    }

    override fun onStart() {
        super.onStart()
        LocationHub.addListener(locationListener)
        LocationHub.setAppVisible(true)
        // Le listener vient d'être (ré)attaché : la page a pu rater un changement pendant qu'on était
        // en arrière-plan (ex. arrêt depuis la notification), on lui renvoie l'état courant.
        resyncLocationState()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onStop() {
        LocationHub.setAppVisible(false)
        LocationHub.removeListener(locationListener)
        super.onStop()
    }

    override fun onDestroy() {
        bridge.shutdown()
        // Détacher avant destroy() : sinon la WebView encore attachée à son parent peut déclencher
        // des callbacks de rendu après sa destruction.
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }

    private fun startLocation() {
        // Démarrer le service ou demander la permission exige que l'activité soit au moins démarrée
        // (API 31+/34+) : sinon (ex. page rechargée par onRenderProcessGone pendant un passage en
        // arrière-plan) l'appel peut lever une exception hors de portée du try/catch du bridge.
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) {
            if (LocationService.hasLocationPermission(this)) {
                locationPermissionDenied = false
                startLocationService()
            } else if (!permissionRequestInFlight) {
                permissionRequestInFlight = true
                val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) permissions += Manifest.permission.POST_NOTIFICATIONS
                permissionLauncher.launch(permissions.toTypedArray())
            }
        }
        resyncLocationState()
    }

    private fun startLocationService() {
        try {
            startForegroundService(Intent(this, LocationService::class.java))
        } catch (e: IllegalStateException) {
            Log.w(TAG, "Service de localisation refusé (app en arrière-plan)", e)
        } catch (e: SecurityException) {
            Log.w(TAG, "Permission refusée pour démarrer le service de localisation", e)
        }
    }

    // La page vient peut-être de (re)charger, ou de revenir au premier plan : on lui renvoie ce qu'on
    // sait déjà (LocationHub.running reste à false si startLocationService a échoué ci-dessus).
    private fun resyncLocationState() {
        // Un dernier fix trop vieux (app restée en arrière-plan longtemps, GPS arrêté depuis un moment)
        // n'est pas renvoyé : la page affiche alors « GPS arrêté » plutôt qu'une position trompeuse.
        LocationHub.lastFix?.let { fix ->
            if (System.currentTimeMillis() - fix.time <= STALE_RESYNC_MS) bridge.emit("location", fix.toJson())
        }
        bridge.emit("satellites", JSONObject().put("count", LocationHub.satellites ?: JSONObject.NULL))
        emitLocationState()
    }

    private fun emitLocationState() {
        bridge.emit(
            "locationState",
            JSONObject()
                .put("running", LocationHub.running)
                // Refusée seulement si toujours refusée en pratique : sinon (accordée entre-temps dans
                // les réglages système) on ne colle pas un refus obsolète au badge.
                .put("permissionDenied", locationPermissionDenied && !LocationService.hasLocationPermission(this)),
        )
    }

    private fun Location.toJson(): JSONObject = JSONObject()
        .put("latitude", latitude)
        .put("longitude", longitude)
        .put("accuracy", if (hasAccuracy()) accuracy.toDouble() else JSONObject.NULL)
        .put("time", time)

    private fun setLightSystemBarIcons() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.setSystemBarsAppearance(
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS,
            )
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility =
                window.decorView.systemUiVisibility or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        }
    }

    // targetSdk 36 impose l'edge-to-edge : la page reste entre la barre d'état, la barre de navigation et le clavier.
    private fun wrapInsideSystemBars(content: WebView): FrameLayout {
        val root = FrameLayout(this)
        root.setBackgroundColor(Color.WHITE)
        root.addView(
            content,
            ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )
        root.setOnApplyWindowInsetsListener { view, insets ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            } else {
                @Suppress("DEPRECATION")
                view.setPadding(
                    insets.systemWindowInsetLeft,
                    insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight,
                    insets.systemWindowInsetBottom,
                )
            }
            insets
        }
        return root
    }

    // Comparaison stricte scheme+host+port (pas de préfixe texte : évite les contournements du type
    // "http://localhost:5173.evil.com/" ou "http://localhost:51730/").
    private fun isSameOrigin(url: Uri): Boolean =
        url.scheme == webOriginUri.scheme && url.host == webOriginUri.host && url.port == webOriginUri.port

    companion object {
        private const val TAG = "MainActivity"

        // Au-delà, un dernier fix renvoyé au resync serait trompeur (voir resyncLocationState).
        private const val STALE_RESYNC_MS = 10 * 60 * 1000L

        // Parsée une seule fois : réutilisée à chaque navigation.
        private val webOriginUri: Uri = Uri.parse(BuildConfig.WEB_ORIGIN)
    }
}
