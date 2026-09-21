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
