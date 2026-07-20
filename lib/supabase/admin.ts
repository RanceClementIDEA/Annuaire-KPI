import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase « admin » (clé service_role) — usage serveur uniquement,
 * jamais exposé au navigateur. Renvoie null si la clé n'est pas configurée.
 */
export function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
