import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Client à clé de service — **contourne entièrement la RLS**.
 *
 * Trois usages légitimes, et aucun autre :
 * — écrire les jetons OAuth dans `private.oauth_credentials` ;
 * — les jobs cron (digests, synchronisation d'agendas), qui n'ont pas
 *   d'utilisateur connecté ;
 * — la lecture d'une invitation avant que son destinataire n'ait un
 *   compte.
 *
 * Le `import "server-only"` fait échouer le build si ce fichier finit
 * dans un bundle navigateur. C'est voulu : cette clé donne un accès
 * total à la base.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY manquante — requise pour les opérations serveur privilégiées.",
    );
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
