import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/* ═══════════════════════════════════════════════════════════════
   Qui a le droit de faire naître un compte (JON-81).

   **Le problème qu'on ferme.** `signInWithOtp` était appelé avec
   `shouldCreateUser: true` et aucune liste : n'importe qui, n'importe où,
   tapait une adresse sur `casaliva.app` et recevait un compte avec sa
   propre maison. Ce n'était pas une fuite — la RLS cloisonne par
   maison — mais deux inconnus étaient déjà entrés au 26 août, dont un
   `admin@…` le matin même. Chacun coûte un email envoyé **depuis le
   domaine vérifié de la famille**, celui qui porte les invitations.

   ── Pourquoi on lit l'INVITATION et pas une liste d'adresses ──

   Une liste en dur aurait fermé la porte aussi bien, et il aurait fallu
   la modifier à chaque nouvel habitant — donc déployer pour inviter sa
   mère. L'invitation existe déjà, elle porte l'adresse, elle expire, et
   elle se consomme. C'est la même autorisation, mais qui se donne
   depuis l'app.

   ── L'adresse doit correspondre, et c'est le point ──

   On ne se contente pas de « il existe une invitation quelque part » :
   l'adresse saisie doit être **celle qui a été invitée**. Sans ça, un
   lien d'invitation qui traîne dans un SMS transféré laisserait créer
   n'importe quel compte — le jeton est un secret, mais un secret qui
   voyage par SMS voyage mal.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Cette adresse a-t-elle une invitation qui l'attend&nbsp;?
 *
 * **Sous la clé de service, et il n'y a pas d'autre choix** : la
 * personne n'est pas connectée, elle n'appartient à aucune maison, et
 * la policy `invites_select_own_families` ne lui montrerait rien. C'est
 * le même chemin que `getInviteByToken`, et pour la même raison.
 *
 * Ne lève jamais : en cas de panne de lecture on rend `false`, donc on
 * **refuse**. Un contrôle d'accès qui s'ouvre quand la base tousse
 * n'est pas un contrôle d'accès.
 */
export async function invitationOuvertePour(email: string): Promise<boolean> {
  const propre = email.trim().toLowerCase();
  if (!propre) return false;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("family_invites")
    .select("id")
    .eq("email", propre)
    // Une invitation déjà consommée ne vaut plus : sinon elle
    // resservirait indéfiniment à recréer un compte supprimé.
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1);

  if (error) {
    console.error("[casa] lecture des invitations échouée", error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}
