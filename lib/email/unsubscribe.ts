import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/* ═══════════════════════════════════════════════════════════════
   Le lien « ne plus recevoir ».

   Il ne couvre que les envois **subis** — résumés et rappels. Une
   invitation à un événement et un lien de connexion répondent à une
   action de quelqu'un : les couper reviendrait à casser l'application
   plutôt qu'à rendre service.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Le jeton de désabonnement, créé au premier envoi et stable ensuite.
 *
 * Stable, et c'est le point : les liens des anciens messages doivent
 * continuer de marcher. Quelqu'un se désabonne rarement au premier
 * email — il le fait le jour où il en a assez, depuis celui qu'il a
 * sous les yeux, qui date parfois de six mois.
 */
export type UnsubscribeLinks = {
  /** Le lien du pied de page, pour un humain. */
  page: string;
  /** L'URL que Gmail et Outlook appellent en `POST` (RFC 8058). */
  post: string;
};

export async function unsubscribeLinksFor(
  userId: string,
  appUrl: string,
): Promise<UnsubscribeLinks | null> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("unsubscribe_tokens")
    .select("token")
    .eq("user_id", userId)
    .maybeSingle();

  const token = existing?.token ?? (await mint(userId));
  if (!token) return null;

  // Deux URLs pour un seul jeton : une route et une page ne peuvent pas
  // partager un chemin dans l'App Router.
  return {
    page: `${appUrl}/desabonnement/${token}`,
    post: `${appUrl}/api/desabonnement/${token}`,
  };
}

async function mint(userId: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("unsubscribe_tokens")
    .insert({ user_id: userId })
    .select("token")
    .single();

  if (error || !data) {
    console.error("[casa] jeton de désabonnement impossible", error?.message);
    return null;
  }
  return data.token;
}

/** Éteint les résumés. Idempotent — on peut cliquer deux fois. */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: link } = await supabase
    .from("unsubscribe_tokens")
    .select("user_id")
    .eq("token", token)
    .maybeSingle();

  if (!link) return false;

  const { error } = await supabase
    .from("users")
    .update({ wants_digests: false })
    .eq("id", link.user_id);

  if (error) {
    console.error("[casa] désabonnement échoué", error.message);
    return false;
  }
  return true;
}
