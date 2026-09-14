# Connexion Google native (Credential Manager) plutôt que la redirection OAuth de Supabase

Google refuse OAuth dans les WebViews embarquées (`403 disallowed_useragent`). Le flux Supabase classique par redirection ne peut donc pas fonctionner dans l'app. Kotlin récupère un `idToken` Google via Credential Manager et le passe au JS, qui appelle `supabase.auth.signInWithIdToken`. On a écarté l'alternative Chrome Custom Tab + deep link : plus de pièces mobiles (gestion du retour dans l'app, échange de code) pour une UX moins bonne.
