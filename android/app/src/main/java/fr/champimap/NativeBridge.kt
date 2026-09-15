package fr.champimap

import android.app.Activity
import android.util.Log
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONException
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Canal page ↔ Kotlin.
 * - La page envoie `{id, method, params}` ; Kotlin répond `{id, result}` ou `{id, error}`.
 * - Kotlin pousse des événements `{event, payload}`.
 * Seule l'origine de l'app (BuildConfig.WEB_ORIGIN) peut parler au canal.
 */
class NativeBridge(private val activity: Activity, private val webView: WebView) {

    private val handlers = HashMap<String, (JSONObject) -> Any?>()
    private val worker = Executors.newSingleThreadExecutor()

    @Volatile
    private var replyProxy: JavaScriptReplyProxy? = null

    /** À appeler avant [install]. Le handler s'exécute hors du thread UI. */
    fun handle(method: String, handler: (JSONObject) -> Any?) {
        handlers[method] = handler
    }

    fun install() {
        check(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            "WebView trop ancienne : WEB_MESSAGE_LISTENER indisponible"
        }
        WebViewCompat.addWebMessageListener(webView, JS_OBJECT_NAME, setOf(BuildConfig.WEB_ORIGIN)) { _, message, _, isMainFrame, proxy ->
            val data = message.data
            if (isMainFrame && data != null) {
                replyProxy = proxy
                // `data` est un texte non fiable venant de la page : tout le parsing se fait dans dispatch,
                // à l'intérieur d'un try, pour qu'un message malformé ne fasse jamais planter le thread worker.
                worker.execute { dispatch(data, proxy) }
            }
        }
    }

    fun emit(event: String, payload: Any?) {
        val message = JSONObject()
            .put("event", event)
            .put("payload", payload ?: JSONObject.NULL)
            .toString()
        activity.runOnUiThread { replyProxy?.postMessage(message) }
    }

    fun shutdown() {
        worker.shutdown()
    }

    // `data` vient de la page (non fiable) : rien ici ne doit pouvoir lancer une exception non rattrapée
    // sur le thread worker, sous peine de crasher le process.
    private fun dispatch(data: String, proxy: JavaScriptReplyProxy) {
        val request = try {
            JSONObject(data)
        } catch (e: JSONException) {
            Log.w(TAG, "Message JSON invalide, ignoré : ${e.message}")
            return
        }

        // Sans id valide, impossible de répondre à la page : on journalise et on abandonne le message.
        if (!request.has("id")) {
            Log.w(TAG, "Message sans id, ignoré : $data")
            return
        }
        val id = try {
            request.getInt("id")
        } catch (e: JSONException) {
            Log.w(TAG, "Message avec id invalide, ignoré : $data")
            return
        }

        val reply = JSONObject().put("id", id)
        try {
            if (!request.has("method")) {
                reply.put("error", "Requête sans méthode")
            } else {
                val method = request.getString("method")
                val handler = handlers[method]
                if (handler == null) {
                    reply.put("error", "Méthode inconnue : $method")
                } else {
                    reply.put("result", handler(request.optJSONObject("params") ?: JSONObject()) ?: JSONObject.NULL)
                }
            }
        } catch (e: Exception) {
            reply.put("error", e.message ?: e.javaClass.simpleName)
        }
        activity.runOnUiThread { proxy.postMessage(reply.toString()) }
    }

    companion object {
        const val JS_OBJECT_NAME = "champiNative"
        private const val TAG = "NativeBridge"
    }
}
