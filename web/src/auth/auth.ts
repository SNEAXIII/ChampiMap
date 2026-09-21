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
