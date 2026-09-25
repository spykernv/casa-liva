"use server";

import { revalidatePath } from "next/cache";
import type { ParticipantStatus } from "@/types";
import { createAdminClient } from "@/lib/supabase/admin";

/* ═══════════════════════════════════════════════════════════════
   Répondre à une invitation depuis l'email, sans être connecté (§16).

   Le jeton **est** l'autorisation. C'est assumé : demander à Mamie de
   se connecter avant de dire « je viens » ferait échouer la règle des
   quinze secondes, et l'adoption est la priorité absolue du produit.

   Ce que le jeton permet, et rien de plus : poser SON propre statut
   sur UN événement précis, auquel elle est déjà conviée. Il ne donne
   accès à aucune lecture, ne crée pas de session, et ne sert pas
   ailleurs.
   ═══════════════════════════════════════════════════════════════ */

export type RsvpResult =
  | { ok: true; status: ParticipantStatus }
  | { ok: false; error: string };

export async function answerByToken(
  token: string,
  status: ParticipantStatus,
): Promise<RsvpResult> {
  if (status !== "accepted" && status !== "declined") {
    return { ok: false, error: "Réponse inconnue." };
  }

  /* Clé de service : `event_rsvp_tokens` n'a aucune policy, donc rien
     d'autre ne peut la lire. C'est ce qui rend le jeton secret — un
     membre de la maison ne peut pas le récupérer pour répondre à la
     place de quelqu'un. */
  const supabase = createAdminClient();

  const { data: link } = await supabase
    .from("event_rsvp_tokens")
    .select("event_id, user_id")
    .eq("token", token)
    .maybeSingle();

  if (!link) return { ok: false, error: "Ce lien n'est plus valable." };

  /* On met à jour, on ne crée pas.

     Un `upsert` inviterait quelqu'un que le créateur n'a pas invité —
     par exemple sur un événement dont il a été retiré depuis. Le jeton
     sert à *répondre*, pas à s'inscrire. Zéro ligne touchée dit
     exactement ça. */
  const { data, error } = await supabase
    .from("event_participants")
    .update({ status })
    .eq("event_id", link.event_id)
    .eq("user_id", link.user_id)
    .select("status");

  if (error) {
    console.error("[casa] réponse par email échouée", error.message);
    return { ok: false, error: "Impossible d'enregistrer ta réponse." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Tu n'es plus sur la liste de cet événement." };
  }

  revalidatePath("/aujourdhui");
  revalidatePath("/semaine");
  revalidatePath("/casa");
  return { ok: true, status };
}
