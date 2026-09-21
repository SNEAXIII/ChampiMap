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
