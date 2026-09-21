package fr.champimap

import android.app.Activity
import android.os.CancellationSignal
import androidx.credentials.CredentialManager
import androidx.credentials.CredentialManagerCallback
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import org.json.JSONObject
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/** Connexion Google native (ADR 0002) : renvoie l'idToken et le nonce brut à passer à Supabase. */
object GoogleSignIn {

    /** Bloque le thread appelant (jamais le thread UI) jusqu'au choix du compte. */
    fun signIn(activity: Activity): JSONObject {
        check(BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotEmpty()) { "Connexion Google non configurée (android/local.properties)" }

        val rawNonce = UUID.randomUUID().toString()
        // Google reçoit le nonce haché, Supabase le nonce brut.
        val hashedNonce = MessageDigest.getInstance("SHA-256")
            .digest(rawNonce.toByteArray())
            .joinToString("") { "%02x".format(it) }

        val option = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
            .setNonce(hashedNonce)
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()

        val future = CompletableFuture<GetCredentialResponse>()
        val signal = CancellationSignal()
        activity.runOnUiThread {
            CredentialManager.create(activity).getCredentialAsync(
                activity,
                request,
                signal,
                activity.mainExecutor,
                object : CredentialManagerCallback<GetCredentialResponse, GetCredentialException> {
                    override fun onResult(result: GetCredentialResponse) {
                        future.complete(result)
                    }

                    override fun onError(e: GetCredentialException) {
                        future.completeExceptionally(e)
                    }
                },
            )
        }

        val credential = try {
            future.get(3, TimeUnit.MINUTES).credential
        } catch (e: ExecutionException) {
            throw IllegalStateException(e.cause?.message ?: "Connexion Google annulée")
        } catch (e: TimeoutException) {
            // CancellationSignal.cancel() est thread-safe (appelable depuis n'importe quel thread).
            signal.cancel()
            throw IllegalStateException("Connexion Google trop longue, réessaie")
        } catch (e: InterruptedException) {
            signal.cancel()
            Thread.currentThread().interrupt()
            throw IllegalStateException("Connexion Google interrompue, réessaie")
        }
        check(credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            "Identifiant Google inattendu"
        }
        val idToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
        return JSONObject().put("idToken", idToken).put("rawNonce", rawNonce)
    }
}
