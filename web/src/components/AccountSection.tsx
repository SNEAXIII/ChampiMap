import { useState } from 'react';
import { signInWithGoogle, signOut } from '../auth/auth';
import { useSession } from '../auth/useSession';
import { supabase } from '../lib/supabase';
import { useOnline } from '../net/useOnline';

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
