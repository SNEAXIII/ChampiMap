# Champi Map — Phase 6 : sauvegarde Supabase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Se connecter avec Google depuis Paramètres et synchroniser ses waypoints avec Supabase. L'app reste 100 % utilisable sans compte ni réseau.

**Architecture:**
- **Supabase** : table `waypoints` avec RLS (un utilisateur ne voit que ses lignes), suppression logique, et un trigger qui applique « le plus récent gagne » et horodate `synced_at` côté serveur.
- **Connexion sur Android** : Kotlin obtient un `idToken` Google via Credential Manager (ADR 0002) et le passe à la page, qui appelle `supabase.auth.signInWithIdToken`. **Dans le navigateur du PC** : `signInWithOAuth` classique.
- **Sync** : 100 % TypeScript (`sync.ts`). Elle envoie d'abord les waypoints locaux (`dirty`), puis reçoit les lignes dont `synced_at` a avancé, et fusionne selon `updated_at`. Elle se déclenche à l'ouverture, au retour du réseau, 3 s après une modification, ou manuellement.

**Tech Stack:** Phases 1–5 + `@supabase/supabase-js` 2.116.0, `androidx.credentials:credentials` 1.6.0, `androidx.credentials:credentials-play-services-auth` 1.6.0, `com.google.android.libraries.identity.googleid:googleid` 1.2.0.

**Spec:** `docs/mvp.md` (section Sync Supabase), `docs/adr/0002-login-google-natif.md`, glossaire `CONTEXT.md` (Waypoint local, Waypoint synchronisé).

**Prérequis:** phase 5 terminée. `waypointStore.ts` (phase 2) expose `getAllWaypoints`, `saveWaypoints`, `subscribeWaypoints`. `SettingsPanel.tsx` (phase 4) existe.

## Global Constraints

- `fr.champimap`, `minSdk 26`, `compileSdk 36`, `targetSdk 36`. Pas de Leaflet/Compose/AppCompat. AGP 9 sans plugin kotlin-android.
- **Supabase ne doit jamais être nécessaire pour utiliser l'app** : sans configuration, sans compte ou sans réseau, tout fonctionne sauf la sauvegarde.
- Connexion uniquement depuis Paramètres (« Sauvegarder mes waypoints »), jamais d'écran de connexion au lancement.
- Table `waypoints` : `id` uuid (généré côté client), `user_id`, `name`, `latitude`, `longitude`, `created_at`, `updated_at`, `deleted_at`, avec RLS : un utilisateur n'accède qu'à ses lignes. Aucune suppression physique.
- Conflits : le `updated_at` le plus récent gagne, par waypoint entier.
- Première connexion : tous les waypoints locaux sont rattachés au compte et envoyés. Déconnexion ou changement de compte : dernière sync, puis on vide les waypoints locaux. **Refuser la déconnexion si des waypoints locaux ne peuvent pas être envoyés** (sinon ils seraient perdus).
- Libellés : 📱 « Sur l'appareil » (non envoyé) / ☁️ « Sauvegardé ». Compteur « N waypoints sur l'appareil ».
- Aucun secret dans git : `web/.env.local` et `android/local.properties` sont ignorés. La clé publishable Supabase et les client IDs Google ne sont pas secrets, mais restent hors du dépôt.
- Pas de tests automatisés. npm uniquement. Gradle : `export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11";`. `adb` préfixé par `timeout 30`.
- **Téléphone : prévenir l'utilisateur et attendre son accord explicite avant toute commande qui installe, lance ou modifie l'état du téléphone.** Un sous-agent s'arrête après le build et rend la main (NEEDS_CONTEXT). **Consoles Supabase et Google Cloud : actions de l'utilisateur uniquement.**

## Procédure « lancer en debug sur le téléphone » (référencée par les tâches)

Après accord de l'utilisateur :
```bash
cd web && npm run dev                      # en arrière-plan
cd X:/Dev/Perso/champibheu
export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11"; (cd android && ./gradlew assembleDebug)
timeout 30 adb reverse tcp:5173 tcp:5173
timeout 60 adb install -r android/app/build/outputs/apk/debug/app-debug.apk
timeout 30 adb shell am force-stop fr.champimap
timeout 30 adb shell am start -n fr.champimap/.MainActivity
```
Captures : `mkdir -p android/build/screens && timeout 30 adb exec-out screencap -p > android/build/screens/<nom>.png`. Mode avion : `cmd connectivity airplane-mode enable|disable`, **toujours** désactiver et vérifier `settings get global airplane_mode_on` = `0`. Arrêter Vite avant le rapport.

## File Structure

```
.gitignore                                     + web/.env*.local
supabase/migrations/0001_waypoints.sql         table, index, RLS, trigger « le plus récent gagne »
docs/supabase-setup.md                         pas-à-pas consoles Supabase + Google Cloud (utilisateur)
web/.env.example                               variables attendues
android/app/build.gradle.kts                   + GOOGLE_WEB_CLIENT_ID depuis local.properties, dépendances Credential Manager
android/app/src/main/java/fr/champimap/
├── GoogleSignIn.kt                            Credential Manager → idToken + nonce brut
└── MainActivity.kt                            + méthode googleSignIn
web/src/
├── lib/supabase.ts                            client Supabase, ou null si non configuré
├── auth/auth.ts                               signInWithGoogle (Android / navigateur), signOut sûr
├── auth/useSession.ts                         session courante
├── sync/sync.ts                               push → pull → fusion, déclencheurs, état
├── sync/useSyncState.ts                       état de sync pour l'UI
├── waypoints/waypointStore.ts                 + clearWaypoints
├── bridge/bridge.ts, bridge/fakeNative.ts     + googleSignIn
├── components/AccountSection.tsx              section compte dans Paramètres
├── components/SettingsPanel.tsx               + AccountSection
└── main.tsx                                   + démarrage de la sync automatique
```

---

### Task 1: Schéma Supabase et configuration du projet

**Files:**
- Create: `supabase/migrations/0001_waypoints.sql`, `docs/supabase-setup.md`, `web/.env.example`
- Modify: `.gitignore`, `android/app/build.gradle.kts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - Table `public.waypoints(id uuid, user_id uuid, name text, latitude float8, longitude float8, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz null, synced_at timestamptz)`.
  - Variables Vite : `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
  - `BuildConfig.GOOGLE_WEB_CLIENT_ID: String` (vide si non configuré).

- [ ] **Step 1: Créer `supabase/migrations/0001_waypoints.sql`**

```sql
-- Waypoints synchronisés de Champi Map.
create table public.waypoints (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  -- Horloge serveur : sert de curseur pour la réception, indépendante des horloges des téléphones.
  synced_at timestamptz not null default clock_timestamp()
);

create index waypoints_user_synced_at on public.waypoints (user_id, synced_at);

alter table public.waypoints enable row level security;

create policy "waypoints: lecture de ses lignes" on public.waypoints
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "waypoints: création de ses lignes" on public.waypoints
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "waypoints: modification de ses lignes" on public.waypoints
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Pas de politique delete : la suppression est logique (deleted_at).

-- Le plus récent gagne : une mise à jour plus ancienne (ou égale) que la ligne stockée est ignorée.
create function public.waypoints_last_write_wins() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at <= old.updated_at then
    return null;
  end if;
  -- clock_timestamp() : valeurs distinctes même pour plusieurs lignes d'un même upsert (pagination par synced_at).
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

create trigger waypoints_last_write_wins
  before insert or update on public.waypoints
  for each row execute function public.waypoints_last_write_wins();
```

- [ ] **Step 2: Créer `web/.env.example`**

```bash
# Copier en web/.env.local (ignoré par git). Sans ces valeurs, l'app marche sans sauvegarde cloud.
VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 3: Ajouter à la fin de `.gitignore`**

```gitignore

# configuration locale (Supabase)
web/.env*.local
```

- [ ] **Step 4: Lire le client Google dans `android/app/build.gradle.kts`**

- En tête du fichier, juste après le bloc `plugins { … }`, ajouter :
```kotlin
// android/local.properties (ignoré par git) : champimap.googleWebClientId=…apps.googleusercontent.com
val localProperties = java.util.Properties().apply {
    rootProject.file("local.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) }
}
```
- Dans `defaultConfig { … }`, après `versionName = "0.1.0"`, ajouter :
```kotlin
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"${localProperties.getProperty("champimap.googleWebClientId", "")}\"")
```

- [ ] **Step 5: Créer `docs/supabase-setup.md`**

````markdown
# Mise en place Supabase + Google (à faire une fois)

Ces étapes se font dans des consoles web, par toi. Compte 20 minutes.

## 1. Projet Supabase

1. Sur https://supabase.com/dashboard, crée un projet `champi-map` (région : Paris / `eu-west-3`).
2. **SQL Editor** → nouveau script → colle le contenu de `supabase/migrations/0001_waypoints.sql` → **Run**.
3. **Project Settings → API Keys** : note l'URL du projet et la clé **publishable** (`sb_publishable_…`).

## 2. Clients OAuth Google

1. Sur https://console.cloud.google.com, crée un projet `Champi Map`.
2. **Google Auth Platform → Branding / Audience** : type **External**, statut **Testing**, ajoute ton adresse Gmail dans **Test users**.
3. **Clients → Create client → Web application** :
   - nom : `Champi Map Web` ;
   - **Authorized redirect URIs** : `https://<ref-du-projet>.supabase.co/auth/v1/callback` ;
   - note le **Client ID** et le **Client secret**.
4. **Clients → Create client → Android** :
   - nom : `Champi Map Android` ;
   - package : `fr.champimap` ;
   - SHA-1 : le résultat de la commande ci-dessous (ligne `SHA1:`).
   ```bash
   "$USERPROFILE/.jdks/jbr-21.0.11/bin/keytool" -list -v -keystore "$USERPROFILE/.android/debug.keystore" -alias androiddebugkey -storepass android -keypass android
   ```

## 3. Fournisseur Google dans Supabase

1. **Authentication → Sign In / Providers → Google** : active-le.
2. **Client IDs** : le Client ID **Web**, une virgule, puis le Client ID **Android**.
3. **Client Secret** : le secret du client Web.
4. Laisse **Skip nonce checks** désactivé. Ne l'active que si la connexion sur le téléphone échoue avec « Nonces mismatch ».
5. **Authentication → URL Configuration** :
   - **Site URL** : `http://127.0.0.1:5173` ;
   - **Redirect URLs** : ajoute `http://127.0.0.1:5173`.

## 4. Fichiers locaux (jamais committés)

- `web/.env.local` :
  ```
  VITE_SUPABASE_URL=https://<ref-du-projet>.supabase.co
  VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
  ```
- `android/local.properties`, ajouter la ligne :
  ```
  champimap.googleWebClientId=<Client ID Web>.apps.googleusercontent.com
  ```

## Si la clé de signature change

Le SHA-1 du client Android correspond à `~/.android/debug.keystore`. Si ce fichier change (nouveau PC), ajoute le nouveau SHA-1 dans Google Cloud, sinon la connexion Google échoue (`[16] Account reauth failed` ou `No credentials available`).
````

- [ ] **Step 6: Vérifier le build Android**

```bash
cd android && export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11" && ./gradlew assembleDebug
```
Expected: `BUILD SUCCESSFUL`, sans configuration Google : le champ vaut `""`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0001_waypoints.sql docs/supabase-setup.md web/.env.example .gitignore android/app/build.gradle.kts
git commit -m "chore: schéma Supabase et configuration du projet"
```

- [ ] **Step 8: Configuration par l'utilisateur**

Rendre la main (statut NEEDS_CONTEXT) en demandant à l'utilisateur de suivre `docs/supabase-setup.md`. Quand il confirme, vérifier sans afficher les valeurs :
```bash
test -f web/.env.local && grep -c "^VITE_SUPABASE_URL=https://" web/.env.local && grep -c "^VITE_SUPABASE_PUBLISHABLE_KEY=." web/.env.local
grep -c "^champimap.googleWebClientId=.*apps.googleusercontent.com" android/local.properties
git status --short   # ne doit lister ni web/.env.local ni android/local.properties
```
Expected: `1`, `1`, `1`, `1`, et un `git status` sans ces fichiers.

---

### Task 2: Connexion Google (Android + navigateur)

**Files:**
- Create: `android/app/src/main/java/fr/champimap/GoogleSignIn.kt`, `web/src/lib/supabase.ts`, `web/src/auth/auth.ts`, `web/src/auth/useSession.ts`, `web/src/components/AccountSection.tsx`
- Modify: `android/app/build.gradle.kts`, `android/app/src/main/java/fr/champimap/MainActivity.kt`, `web/package.json`, `web/src/bridge/bridge.ts`, `web/src/bridge/fakeNative.ts`, `web/src/components/SettingsPanel.tsx`

**Interfaces:**
- Consumes: `BuildConfig.GOOGLE_WEB_CLIENT_ID`, variables Vite (Task 1), `NativeBridge.handle` (phase 2), `callNative`, `isAndroid`, `SettingsPanel` (phase 4).
- Produces:
  - Kotlin `object GoogleSignIn { fun signIn(activity: Activity): JSONObject }` → `{ idToken, rawNonce }`.
  - TS `BridgeMethods.googleSignIn: { params: Record<string, never>; result: { idToken: string; rawNonce: string } }`.
  - `supabase: SupabaseClient | null`.
  - `signInWithGoogle(): Promise<void>`. `signOut(): Promise<void>` dans sa version simple ici ; Task 3 la remplace par la version sûre.
  - `useSession(): Session | null | undefined` (`undefined` = chargement).
  - `AccountSection` (sans props).

- [ ] **Step 1: Dépendances**

Dans `android/app/build.gradle.kts`, bloc `dependencies`, ajouter :
```kotlin
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.2.0")
```
Puis :
```bash
cd web && npm install @supabase/supabase-js@2.116.0
```

- [ ] **Step 2: Créer `android/app/src/main/java/fr/champimap/GoogleSignIn.kt`**

```kotlin
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
        activity.runOnUiThread {
            CredentialManager.create(activity).getCredentialAsync(
                activity,
                request,
                CancellationSignal(),
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
        }
        check(credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            "Identifiant Google inattendu"
        }
        val idToken = GoogleIdTokenCredential.createFrom(credential.data).idToken
        return JSONObject().put("idToken", idToken).put("rawNonce", rawNonce)
    }
}
```

- [ ] **Step 3: Ajouter la méthode dans `MainActivity.kt`**

Juste avant `bridge.install()`, ajouter :
```kotlin
        bridge.handle("googleSignIn") { GoogleSignIn.signIn(this) }
```

- [ ] **Step 4: Modifier `web/src/bridge/bridge.ts` et `web/src/bridge/fakeNative.ts`**

- `bridge.ts`, dans `BridgeMethods`, ajouter après `getAvailableRegions` :
```ts
  googleSignIn: { params: Record<string, never>; result: { idToken: string; rawNonce: string } };
```
- `fakeNative.ts` : rien à ajouter. Dans le navigateur, `auth.ts` utilise `signInWithOAuth` et n'appelle jamais `googleSignIn`.

- [ ] **Step 5: Créer `web/src/lib/supabase.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isAndroid } from '../bridge/bridge';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Client Supabase, ou null si le projet n'est pas configuré : l'app reste utilisable sans cloud. */
export const supabase: SupabaseClient | null =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Retour de redirection OAuth : seulement dans le navigateur du PC.
          detectSessionInUrl: !isAndroid,
        },
      })
    : null;
```

- [ ] **Step 6: Créer `web/src/auth/useSession.ts`**

```ts
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/** Session Supabase : undefined pendant le chargement, null si déconnecté. */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  return session;
}
```

- [ ] **Step 7: Créer `web/src/auth/auth.ts`**

```ts
import { callNative, isAndroid } from '../bridge/bridge';
import { supabase } from '../lib/supabase';

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Sauvegarde cloud non configurée');
  if (isAndroid) {
    const { idToken, rawNonce } = await callNative('googleSignIn', {});
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: rawNonce });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  if (error) throw error;
}

/** Version simple (Task 2). Task 3 la remplace : dernière sync + nettoyage des waypoints locaux. */
export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}
```

- [ ] **Step 8: Créer `web/src/components/AccountSection.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { signInWithGoogle, signOut } from '../auth/auth';
import { useSession } from '../auth/useSession';
import { supabase } from '../lib/supabase';

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export function AccountSection() {
  const session = useSession();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase">Sauvegarder mes waypoints</h3>
      {!supabase ? (
        <p className="text-sm text-gray-500">Sauvegarde cloud non configurée.</p>
      ) : session === undefined ? (
        <p className="text-sm text-gray-500">…</p>
      ) : session === null ? (
        <>
          <p className="mb-2 text-sm text-gray-600">Connecte-toi pour retrouver tes waypoints sur un autre téléphone.</p>
          <button
            type="button"
            disabled={busy || !online}
            onClick={() => run(signInWithGoogle)}
            className="w-full rounded-lg bg-gray-900 py-3 font-medium text-white disabled:opacity-40"
          >
            {online ? 'Se connecter avec Google' : 'Connexion impossible hors ligne'}
          </button>
        </>
      ) : (
        <>
          <p className="mb-2 text-sm">Connecté : {session.user.email}</p>
          <button type="button" disabled={busy} onClick={() => run(signOut)} className="w-full rounded-lg bg-gray-100 py-3 font-medium">
            Se déconnecter
          </button>
        </>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 9: Ajouter la section dans `web/src/components/SettingsPanel.tsx`**

- Import : `import { AccountSection } from './AccountSection';`
- Dans `<div className="flex-1 space-y-6 overflow-y-auto p-4">`, insérer `<AccountSection />` comme **premier** enfant, avant la section « Stockage ».

- [ ] **Step 10: Vérifier types et builds**

```bash
cd web && npm run typecheck && npm run build
cd ../android && export JAVA_HOME="$USERPROFILE/.jdks/jbr-21.0.11" && ./gradlew assembleDebug
```
Expected: aucune erreur, `BUILD SUCCESSFUL`.

- [ ] **Step 11: Contrôle sur le téléphone** (après accord de l'utilisateur, procédure « lancer en debug » ; Task 1 step 8 validée)

1. Paramètres : section « Sauvegarder mes waypoints » avec [Se connecter avec Google].
2. Tap : la feuille Google Credential Manager s'ouvre. **L'utilisateur choisit son compte lui-même.**
3. Capture : « Connecté : <email> ». Relancer l'app (`force-stop` + `start`) : toujours connecté (session persistée).
4. En cas d'erreur affichée, la rapporter mot pour mot. Pistes : SHA-1 du client Android, Client IDs dans Supabase, « Nonces mismatch » (voir `docs/supabase-setup.md`).
5. [Se déconnecter] : le bouton de connexion revient.
6. Mode avion (accord donné) : le bouton affiche « Connexion impossible hors ligne » et l'app reste utilisable. Désactiver le mode avion, vérifier `airplane_mode_on` = `0`.

- [ ] **Step 12: Commit**

```bash
git add android/app/build.gradle.kts android/app/src/main web/package.json web/package-lock.json web/src
git commit -m "feat: connexion Google native vers Supabase"
```

---

### Task 3: Synchronisation des waypoints

**Files:**
- Create: `web/src/sync/sync.ts`, `web/src/sync/useSyncState.ts`
- Modify: `web/src/waypoints/waypointStore.ts`, `web/src/auth/auth.ts`, `web/src/components/AccountSection.tsx`, `web/src/main.tsx`

**Interfaces:**
- Consumes: `supabase`, `useSession` (Task 2), `getAllWaypoints`, `saveWaypoints`, `subscribeWaypoints`, `Waypoint`, `loadWaypoints` (phase 2).
- Produces:
  - `waypointStore.ts` + `clearWaypoints(): Promise<void>`.
  - `sync.ts` :
    - type : `type SyncState = { syncing: boolean; lastError: string | null; lastSyncedAt: number | null }` ;
    - sync : `syncNow(): Promise<void>`, `scheduleSync(): void` ;
    - démarrage et état : `startAutoSync(): void`, `getSyncState(): SyncState`, `subscribeSyncState(listener): () => void`.
  - `useSyncState(): SyncState`.
  - `auth.ts` : `signOut()` renvoie une erreur si des waypoints locaux ne peuvent pas être envoyés.

- [ ] **Step 1: Ajouter `clearWaypoints` à la fin de `web/src/waypoints/waypointStore.ts`**

```ts
/** Vide les waypoints locaux (déconnexion ou changement de compte, après la dernière sync). */
export async function clearWaypoints(): Promise<void> {
  const db = await dbPromise;
  await db.clear('waypoints');
  replaceAll([]);
}
```

- [ ] **Step 2: Créer `web/src/sync/sync.ts`**

```ts
import { supabase } from '../lib/supabase';
import { getAllWaypoints, saveWaypoints, subscribeWaypoints, type Waypoint } from '../waypoints/waypointStore';

export type SyncState = { syncing: boolean; lastError: string | null; lastSyncedAt: number | null };

type Row = {
  id: string;
  user_id: string;
  name: string;
  latitude: number;
  longitude: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  synced_at: string;
};

const PAGE_SIZE = 500;
const DEBOUNCE_MS = 3000;
const cursorKey = (userId: string) => `champi.sync.cursor.${userId}`;

let state: SyncState = { syncing: false, lastError: null, lastSyncedAt: null };
const listeners = new Set<() => void>();
let running: Promise<void> | null = null;
let debounceTimer: number | undefined;

function setState(change: Partial<SyncState>): void {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
}

export const getSyncState = (): SyncState => state;

export function subscribeSyncState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const toRow = (waypoint: Waypoint, userId: string): Omit<Row, 'synced_at'> => ({
  id: waypoint.id,
  user_id: userId,
  name: waypoint.name,
  latitude: waypoint.latitude,
  longitude: waypoint.longitude,
  created_at: new Date(waypoint.createdAt).toISOString(),
  updated_at: new Date(waypoint.updatedAt).toISOString(),
  deleted_at: waypoint.deletedAt === null ? null : new Date(waypoint.deletedAt).toISOString(),
});

const fromRow = (row: Row): Waypoint => ({
  id: row.id,
  name: row.name,
  latitude: row.latitude,
  longitude: row.longitude,
  createdAt: Date.parse(row.created_at),
  updatedAt: Date.parse(row.updated_at),
  deletedAt: row.deleted_at === null ? null : Date.parse(row.deleted_at),
  dirty: false,
});

async function runSync(): Promise<void> {
  if (!supabase || !navigator.onLine) return;
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return;
  const userId = session.user.id;

  setState({ syncing: true, lastError: null });
  try {
    // 1. Envoi des waypoints locaux. Le trigger serveur ignore les versions plus anciennes que celle stockée.
    const dirty = getAllWaypoints().filter((waypoint) => waypoint.dirty);
    if (dirty.length > 0) {
      const { error } = await supabase.from('waypoints').upsert(dirty.map((waypoint) => toRow(waypoint, userId)));
      if (error) throw error;
      // « Sauvegardé » seulement si le waypoint n'a pas été modifié pendant l'envoi.
      const sentVersion = new Map(dirty.map((waypoint) => [waypoint.id, waypoint.updatedAt]));
      await saveWaypoints(
        getAllWaypoints()
          .filter((waypoint) => waypoint.dirty && sentVersion.get(waypoint.id) === waypoint.updatedAt)
          .map((waypoint) => ({ ...waypoint, dirty: false })),
      );
    }

    // 2. Réception de ce qui a changé ailleurs, dans l'ordre de l'horloge serveur.
    let cursor = localStorage.getItem(cursorKey(userId)) ?? '1970-01-01T00:00:00Z';
    for (;;) {
      const { data: rows, error } = await supabase
        .from('waypoints')
        .select('*')
        .gt('synced_at', cursor)
        .order('synced_at', { ascending: true })
        .limit(PAGE_SIZE);
      if (error) throw error;
      const page = rows as Row[];
      if (page.length === 0) break;

      const local = new Map(getAllWaypoints().map((waypoint) => [waypoint.id, waypoint]));
      // Le plus récent gagne : on garde la version locale si elle est plus récente (elle partira au prochain envoi).
      const accepted = page
        .map(fromRow)
        .filter((remote) => {
          const mine = local.get(remote.id);
          return !mine || remote.updatedAt > mine.updatedAt || (remote.updatedAt === mine.updatedAt && mine.dirty);
        });
      await saveWaypoints(accepted);

      cursor = page[page.length - 1].synced_at;
      localStorage.setItem(cursorKey(userId), cursor);
      if (page.length < PAGE_SIZE) break;
    }
    setState({ syncing: false, lastSyncedAt: Date.now() });
  } catch (e) {
    setState({ syncing: false, lastError: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** Lance une sync (ou rejoint celle en cours). Sans session ni réseau : ne fait rien. */
export function syncNow(): Promise<void> {
  running ??= runSync().finally(() => {
    running = null;
  });
  return running;
}

export function scheduleSync(): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    syncNow().catch(() => undefined);
  }, DEBOUNCE_MS);
}

/** Déclencheurs : ouverture de l'app, connexion, retour du réseau, retour au premier plan, modification locale. */
export function startAutoSync(): void {
  if (!supabase) return;
  const quietSync = () => {
    syncNow().catch(() => undefined);
  };
  supabase.auth.onAuthStateChange((event, session) => {
    if (session && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) quietSync();
  });
  window.addEventListener('online', quietSync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') quietSync();
  });
  subscribeWaypoints(() => {
    if (getAllWaypoints().some((waypoint) => waypoint.dirty)) scheduleSync();
  });
}
```

- [ ] **Step 3: Créer `web/src/sync/useSyncState.ts`**

```ts
import { useSyncExternalStore } from 'react';
import { getSyncState, subscribeSyncState, type SyncState } from './sync';

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSyncState, getSyncState);
}
```

- [ ] **Step 4: Remplacer `web/src/auth/auth.ts`**

```ts
import { callNative, isAndroid } from '../bridge/bridge';
import { supabase } from '../lib/supabase';
import { syncNow } from '../sync/sync';
import { clearWaypoints, getAllWaypoints } from '../waypoints/waypointStore';

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Sauvegarde cloud non configurée');
  if (isAndroid) {
    const { idToken, rawNonce } = await callNative('googleSignIn', {});
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce: rawNonce });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  if (error) throw error;
}

/** Dernière sync, puis on vide les waypoints locaux. Refuse si des waypoints locaux n'ont pas pu partir. */
export async function signOut(): Promise<void> {
  if (!supabase) return;
  try {
    await syncNow();
  } catch {
    // L'erreur est vérifiée juste en dessous via les waypoints encore locaux.
  }
  const unsent = getAllWaypoints().filter((waypoint) => waypoint.dirty).length;
  if (unsent > 0) {
    throw new Error(`${unsent} waypoint${unsent > 1 ? 's' : ''} pas encore sauvegardé${unsent > 1 ? 's' : ''} : reconnecte-toi à Internet avant de te déconnecter.`);
  }
  await clearWaypoints();
  await supabase.auth.signOut();
}
```

- [ ] **Step 5: Remplacer `web/src/components/AccountSection.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { signInWithGoogle, signOut } from '../auth/auth';
import { useSession } from '../auth/useSession';
import { supabase } from '../lib/supabase';
import { syncNow } from '../sync/sync';
import { useSyncState } from '../sync/useSyncState';
import { useWaypoints } from '../waypoints/useWaypoints';
import { getAllWaypoints } from '../waypoints/waypointStore';

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export function AccountSection() {
  const session = useSession();
  const online = useOnline();
  const sync = useSyncState();
  // Abonnement pour se re-rendre à chaque modification ; le compte inclut les suppressions pas encore envoyées.
  useWaypoints();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const localCount = getAllWaypoints().filter((waypoint) => waypoint.dirty).length;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-500 uppercase">Sauvegarder mes waypoints</h3>
      {!supabase ? (
        <p className="text-sm text-gray-500">Sauvegarde cloud non configurée.</p>
      ) : session === undefined ? (
        <p className="text-sm text-gray-500">…</p>
      ) : session === null ? (
        <>
          <p className="mb-2 text-sm text-gray-600">Connecte-toi pour retrouver tes waypoints sur un autre téléphone.</p>
          <button
            type="button"
            disabled={busy || !online}
            onClick={() => run(signInWithGoogle)}
            className="w-full rounded-lg bg-gray-900 py-3 font-medium text-white disabled:opacity-40"
          >
            {online ? 'Se connecter avec Google' : 'Connexion impossible hors ligne'}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm">Connecté : {session.user.email}</p>
          <p className="text-sm text-gray-600">
            {localCount === 0 ? '☁️ Tous les waypoints sont sauvegardés' : `📱 ${localCount} waypoint${localCount > 1 ? 's' : ''} sur l'appareil`}
          </p>
          <p className="mb-2 text-xs text-gray-500">
            {sync.syncing
              ? 'Synchronisation…'
              : sync.lastSyncedAt
                ? `Dernière synchronisation : ${new Date(sync.lastSyncedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
                : online
                  ? 'Pas encore synchronisé'
                  : 'Hors ligne : synchronisation au retour du réseau'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || sync.syncing || !online}
              onClick={() => run(syncNow)}
              className="flex-1 rounded-lg bg-gray-100 py-3 font-medium disabled:opacity-40"
            >
              Synchroniser
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!confirmSignOut) {
                  setConfirmSignOut(true);
                  return;
                }
                setConfirmSignOut(false);
                void run(signOut);
              }}
              className={`flex-1 rounded-lg py-3 font-medium ${confirmSignOut ? 'bg-red-600 text-white' : 'bg-gray-100'}`}
            >
              {confirmSignOut ? 'Confirmer' : 'Se déconnecter'}
            </button>
          </div>
          {confirmSignOut && <p className="mt-2 text-xs text-gray-500">Les waypoints seront retirés de ce téléphone après une dernière sauvegarde.</p>}
        </>
      )}
      {(error ?? sync.lastError) && <p className="mt-2 text-sm text-red-700">{error ?? sync.lastError}</p>}
    </section>
  );
}
```

- [ ] **Step 6: Démarrer la sync automatique dans `web/src/main.tsx`**

- Import : `import { startAutoSync } from './sync/sync';`
- Remplacer `void loadWaypoints();` par :
```tsx
void loadWaypoints().then(startAutoSync);
```

- [ ] **Step 7: Vérifier types et build**

```bash
cd web && npm run typecheck && npm run build
```
Expected: aucune erreur.

- [ ] **Step 8: Contrôle sur le téléphone** (après accord de l'utilisateur, procédure « lancer en debug »)

1. Déconnecté, créer 2 waypoints `Sync A` et `Sync B` : dans la liste, 📱 sur chacun.
2. Paramètres → se connecter (l'utilisateur choisit le compte). Sous ~5 s : « ☁️ Tous les waypoints sont sauvegardés », et la liste montre ☁️ (première connexion : rattachement et envoi).
3. **Demander à l'utilisateur** de vérifier dans Supabase (**Table Editor → waypoints**) que `Sync A` et `Sync B` existent avec son `user_id`.
4. Mode avion (accord donné) : renommer `Sync A` en `Sync A2` et supprimer `Sync B`. La liste affiche 📱 pour `Sync A2`. Paramètres : « 📱 1 waypoint sur l'appareil ». Tenter « Se déconnecter » → « Confirmer » : message refusant la déconnexion (1 waypoint pas encore sauvegardé).
5. Désactiver le mode avion (vérifier `airplane_mode_on` = `0`). Sous ~5 s, `Sync A2` passe à ☁️. **L'utilisateur vérifie** dans Supabase : `Sync A2` renommé, et `deleted_at` renseigné sur `Sync B`.
6. **Conflit** : l'utilisateur modifie le `name` de `Sync A2` en `Serveur` et met `updated_at` à maintenant + 1 h dans le Table Editor. Tap « Synchroniser » : le waypoint s'appelle « Serveur » sur le téléphone.
7. Se déconnecter (en ligne) : la liste est vide. Se reconnecter : « Serveur » revient, et `Sync B` reste supprimé (non affiché).
8. Relancer l'app : aucune erreur de sync affichée, les waypoints sont toujours là.

- [ ] **Step 9: Commit**

```bash
git add web/src
git commit -m "feat(web): synchronisation des waypoints avec Supabase"
```
