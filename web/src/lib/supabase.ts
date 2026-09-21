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
