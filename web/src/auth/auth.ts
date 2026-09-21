import { callNative, isAndroid } from '../bridge/bridge';
import { supabase } from '../lib/supabase';
import { resetSyncCursors, syncNow } from '../sync/sync';
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

/**
 * Dernière sync, puis déconnexion locale et nettoyage des waypoints locaux.
 * Refuse si des waypoints locaux n'ont pas pu partir, ou si la déconnexion locale échoue (réseau/5xx) —
 * dans ce dernier cas la session Supabase reste active, donc on ne vide surtout pas les waypoints.
 */
export async function signOut(): Promise<void> {
  if (!supabase) return;
  try {
    await syncNow();
  } catch {
    // L'erreur est vérifiée juste en dessous via les waypoints encore locaux.
  }
  const unsent = getAllWaypoints().filter((waypoint) => waypoint.dirty).length;
  if (unsent > 0) {
    throw new Error(`${unsent} modification${unsent > 1 ? 's' : ''} pas encore sauvegardée${unsent > 1 ? 's' : ''} : reconnecte-toi à Internet avant de te déconnecter.`);
  }
  // scope: 'local' : révoque uniquement la session de cet appareil (pas besoin d'aller invalider les autres).
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
  resetSyncCursors();
  await clearWaypoints();
}
