package fr.champimap

import android.app.Activity
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
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
                worker.execute { dispatch(JSONObject(data), proxy) }
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

    private fun dispatch(request: JSONObject, proxy: JavaScriptReplyProxy) {
        val method = request.getString("method")
        val reply = JSONObject().put("id", request.getInt("id"))
        val handler = handlers[method]
        try {
            if (handler == null) {
                reply.put("error", "Méthode inconnue : $method")
            } else {
                reply.put("result", handler(request.optJSONObject("params") ?: JSONObject()) ?: JSONObject.NULL)
            }
        } catch (e: Exception) {
            reply.put("error", e.message ?: e.javaClass.simpleName)
        }
        activity.runOnUiThread { proxy.postMessage(reply.toString()) }
    }

    companion object {
        const val JS_OBJECT_NAME = "champiNative"
    }
}
