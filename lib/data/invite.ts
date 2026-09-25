import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/* ═══════════════════════════════════════════════════════════════
   Lecture d'une invitation, avant d'y répondre.

   Passe par la clé de service, et c'est nécessaire : la policy
   `invites_select_own_families` ne laisse voir que les invitations de
   sa propre maison. Or la personne invitée, par définition, n'y est
   pas encore — et peut même ne pas être connectée du tout.

   Le jeton EST le secret. Quiconque l'a peut déjà rejoindre la
   maison ; lui en montrer le nom avant de cliquer n'ajoute aucun
   risque, et évite de faire rejoindre à l'aveugle.
   ═══════════════════════════════════════════════════════════════ */

export type InvitePreview = {
  familyId: string;
  familyName: string;
  /** Prénom de la personne qui invite. Sert à dire « Jonathan t'invite ». */
  invitedBy: string;
  accepted: boolean;
  expired: boolean;
};

export async function getInviteByToken(
  token: string,
): Promise<InvitePreview | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("family_invites")
    .select("family_id, accepted_at, expires_at, families(name), users(first_name)")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error("[casa] lecture de l'invitation échouée", error.message);
    return null;
  }
  if (!data) return null;

  const family = data.families as unknown as { name: string } | null;
  const inviter = data.users as unknown as { first_name: string } | null;

  return {
    familyId: data.family_id,
    familyName: family?.name || "Casa Liva",
    invitedBy: inviter?.first_name || "Quelqu’un",
    accepted: data.accepted_at !== null,
    expired: new Date(data.expires_at).getTime() < Date.now(),
  };
}
