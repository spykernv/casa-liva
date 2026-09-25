import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/* ═══════════════════════════════════════════════════════════════
   Rangement des jetons OAuth Google.

   Les jetons vivent dans `private.oauth_credentials`, un schéma qui
   n'est pas exposé par PostgREST. Ce n'est pas contournable par la
   clé de service : le refus vient de PostgREST, pas de la RLS. Le
   seul chemin est un jeu de fonctions `public` en SECURITY DEFINER,
   exécutables par `service_role` uniquement (migration 0004).

   Conséquence pratique : tout ce fichier passe par le client admin,
   et `import "server-only"` garantit qu'il ne finira jamais dans un
   bundle navigateur.
   ═══════════════════════════════════════════════════════════════ */

export const GOOGLE_PROVIDER = "google";

export type StoredCredentials = {
  refreshToken: string;
  accessToken: string | null;
  /** ISO 8601, ou `null` si on ne sait pas. */
  expiresAt: string | null;
  scopes: string | null;
};

export type NewCredentials = {
  refreshToken: string;
  accessToken?: string | null;
  expiresAt?: string | null;
  scopes?: string | null;
};

/**
 * Enregistre le consentement fraîchement obtenu.
 *
 * Appelé depuis le retour OAuth, et de là uniquement : c'est la seule
 * occasion de voir passer un refresh token. Supabase ne le conserve
 * pas, et Google ne le réémet qu'à un nouveau consentement explicite.
 */
export async function saveCredentials(
  userId: string,
  credentials: NewCredentials,
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.rpc("save_oauth_credentials", {
    p_user_id: userId,
    p_provider: GOOGLE_PROVIDER,
    p_refresh_token: credentials.refreshToken,
    p_access_token: credentials.accessToken ?? null,
    p_expires_at: credentials.expiresAt ?? null,
    p_scopes: credentials.scopes ?? null,
  });

  if (error) {
    // On ne journalise jamais le jeton lui-même — seulement le fait.
    console.error("[casa] enregistrement des jetons Google échoué", error.message);
    throw new Error("Impossible d'enregistrer la connexion Google.");
  }
}

/** Les jetons de quelqu'un, ou `null` s'il n'a jamais connecté d'agenda. */
export async function readCredentials(
  userId: string,
): Promise<StoredCredentials | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("get_oauth_credentials", {
    p_user_id: userId,
    p_provider: GOOGLE_PROVIDER,
  });

  if (error) {
    console.error("[casa] lecture des jetons Google échouée", error.message);
    throw new Error("Impossible de lire la connexion Google.");
  }

  const row = data?.[0];
  if (!row) return null;

  return {
    refreshToken: row.refresh_token,
    accessToken: row.access_token,
    expiresAt: row.expires_at,
    scopes: row.scopes,
  };
}

/** Après un rafraîchissement : seul le jeton d'accès et sa fin de vie changent. */
export async function saveAccessToken(
  userId: string,
  accessToken: string,
  expiresAt: string,
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.rpc("save_oauth_access_token", {
    p_user_id: userId,
    p_provider: GOOGLE_PROVIDER,
    p_access_token: accessToken,
    p_expires_at: expiresAt,
  });

  if (error) {
    console.error("[casa] mise à jour du jeton d'accès échouée", error.message);
    // Non bloquant : le jeton en mémoire reste utilisable pour cet
    // appel-ci, on en redemandera un au suivant. Échouer ici ferait
    // perdre une synchronisation pour une raison purement comptable.
  }
}

/** Déconnexion : on oublie tout. */
export async function forgetCredentials(userId: string): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase.rpc("delete_oauth_credentials", {
    p_user_id: userId,
    p_provider: GOOGLE_PROVIDER,
  });

  if (error) {
    console.error("[casa] suppression des jetons Google échouée", error.message);
    throw new Error("Impossible de déconnecter Google.");
  }
}
