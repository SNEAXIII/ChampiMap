import { useState } from 'react';
import { signInWithGoogle, signOut } from '../auth/auth';
import { useSession } from '../auth/useSession';
import { supabase } from '../lib/supabase';
import { useOnline } from '../net/useOnline';
import { syncNow } from '../sync/sync';
import { useSyncState } from '../sync/useSyncState';
import { useWaypoints } from '../waypoints/useWaypoints';
import { getAllWaypoints } from '../waypoints/waypointStore';

export function AccountSection() {
  const session = useSession();
  const online = useOnline();
  const sync = useSyncState();
  // Abonnement pour se re-rendre à chaque modification ; le compte inclut les suppressions pas encore envoyées.
  useWaypoints();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // Waypoints visibles pas encore envoyés (créés/renommés) vs suppressions pas encore envoyées : un waypoint
  // supprimé n'est plus « sur l'appareil » pour l'utilisateur, donc les deux se comptent — et s'affichent —
  // séparément.
  const visibleDirtyCount = getAllWaypoints().filter((waypoint) => waypoint.dirty && waypoint.deletedAt === null).length;
  const dirtyDeletionsCount = getAllWaypoints().filter((waypoint) => waypoint.dirty && waypoint.deletedAt !== null).length;

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
            {visibleDirtyCount === 0 && dirtyDeletionsCount === 0
              ? '☁️ Tous les waypoints sont sauvegardés'
              : visibleDirtyCount > 0
                ? `📱 ${visibleDirtyCount} waypoint${visibleDirtyCount > 1 ? 's' : ''} sur l'appareil`
                : `📱 ${dirtyDeletionsCount} suppression${dirtyDeletionsCount > 1 ? 's' : ''} pas encore sauvegardée${dirtyDeletionsCount > 1 ? 's' : ''}`}
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
