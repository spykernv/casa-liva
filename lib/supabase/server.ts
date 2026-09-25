import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

/**
 * Client Supabase pour Server Components, Server Actions et Route
 * Handlers.
 *
 * Un client neuf à chaque requête : sur Vercel Fluid Compute les
 * instances sont réutilisées entre requêtes, et un client mis en
 * portée module ferait fuiter la session d'un utilisateur vers le
 * suivant.
 *
 * `cookies()` est asynchrone depuis Next 15 — d'où le `await` ici, et
 * donc `const supabase = await createClient()` partout ailleurs.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Écrire un cookie depuis un Server Component est interdit
            // (HTTP n'autorise pas Set-Cookie après le début du
            // streaming). C'est sans conséquence : le proxy rafraîchit
            // déjà la session à chaque requête.
          }
        },
      },
    },
  );
}
