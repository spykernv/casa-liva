"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MemberColor } from "@/types";
import { MEMBER_COLORS } from "@/types";
import { isKnownFace } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/server";
import { getCasaContext, getUserId } from "@/lib/data/casa";
import { isKnownVoice } from "@/lib/voice/voices";
import { appOrigin } from "@/lib/url";

export type FamilyResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Crée la maison et rattache son créateur comme propriétaire, en une
 * seule transaction côté base (fonction `create_family`). Idempotent :
 * relancer l'onboarding ne crée pas une deuxième maison.
 */
export async function createFamily(name?: string): Promise<FamilyResult> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Il faut être connecté." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_family", {
    family_name: name?.trim() || "Casa Liva",
  });

  if (error) {
    console.error("[casa] création de la maison échouée", error.message);
    return { ok: false, error: "Impossible de créer la maison." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Ce qui peut arriver quand on répond à une invitation.
 *
 * Le cas est décidé par l'identifiant machine que la RPC place dans
 * `detail` (`casa:*`, migration 0007), jamais en filtrant le message
 * d'erreur avec des expressions régulières : un message français est
 * fait pour être relu et réécrit, pas pour piloter du code.
 */
export type JoinResult =
  | { kind: "ok" }
  | { kind: "introuvable" }
  | { kind: "deja-servie" }
  | { kind: "expiree" }
  /** On habite déjà une maison avec d'autres personnes. */
  | { kind: "maison-partagee" }
  | { kind: "echec" };

/**
 * Rejoindre une maison.
 *
 * C'est une **Server Action**, et pas un effet de bord du rendu de
 * `/invitation/[token]` comme auparavant. Ouvrir une URL suffisait
 * alors à changer de maison — sans question, sans « Annuler », et en
 * brûlant le jeton au moindre préchargement du lien. Deux règles
 * d'AGENTS.md y passaient : « mutations = Server Actions » et
 * « toujours un Annuler ».
 */
export async function joinFamily(token: string): Promise<JoinResult> {
  const userId = await getUserId();
  if (!userId) return { kind: "echec" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_family_invite", {
    invite_token: token,
  });

  if (!error) {
    revalidatePath("/", "layout");
    return { kind: "ok" };
  }

  const marker = /casa:([a-z-]+)/.exec(error.details ?? error.message ?? "");
  const kind = marker?.[1];

  if (
    kind === "introuvable" ||
    kind === "deja-servie" ||
    kind === "expiree" ||
    kind === "maison-partagee"
  ) {
    return { kind };
  }

  console.error("[casa] adhésion à la maison échouée", error.message);
  return { kind: "echec" };
}

export type InviteResult =
  | { ok: true; link: string }
  | { ok: false; error: string };

/**
 * Crée une invitation et renvoie le lien à transmettre.
 *
 * L'envoi par email arrive en phase 6 ; d'ici là le lien se partage
 * par SMS ou WhatsApp, ce qui est de toute façon ce que fait une
 * famille.
 */
export async function inviteMember(email: string): Promise<InviteResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  const clean = email.trim().toLowerCase();
  if (!clean.includes("@")) {
    return { ok: false, error: "Cette adresse ne ressemble pas à une adresse." };
  }
  if (context.members.some((m) => m.email.toLowerCase() === clean)) {
    return { ok: false, error: "Cette personne habite déjà ici." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("family_invites")
    .insert({
      family_id: context.familyId,
      email: clean,
      invited_by: context.me.id,
    })
    .select("token")
    .single();

  if (error || !data) {
    console.error("[casa] création d'invitation échouée", error?.message);
    return { ok: false, error: "Impossible de créer l'invitation." };
  }

  revalidatePath("/casa");
  return { ok: true, link: `${await appOrigin()}/invitation/${data.token}` };
}

export async function updateProfile(input: {
  firstName?: string;
  color?: MemberColor;
  avatar?: string;
}): Promise<FamilyResult> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Il faut être connecté." };

  const patch: { first_name?: string; color?: MemberColor; avatar?: string } = {};

  if (input.firstName !== undefined) {
    const name = input.firstName.trim();
    if (!name) return { ok: false, error: "Il faut bien un prénom." };
    patch.first_name = name.slice(0, 40);
  }
  if (input.color !== undefined) {
    if (!MEMBER_COLORS.includes(input.color)) {
      return { ok: false, error: "Cette couleur n'existe pas." };
    }
    patch.color = input.color;
  }
  if (input.avatar !== undefined) {
    /* Même raison que `setVoicePreference` : une Server Action est une
       porte d'entrée comme une autre, et une colonne qui accepte
       n'importe quoi finit par le ressortir quelque part. La valeur
       stockée n'est jamais vide — `lib/data/casa.ts` fait
       `row.avatar || row.id`, donc une chaîne vide retomberait sur
       l'UUID et le choix serait perdu sans erreur. */
    if (!isKnownFace(input.avatar)) {
      return { ok: false, error: "Ce visage n'existe pas." };
    }
    patch.avatar = input.avatar;
  }

  if (Object.keys(patch).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("users").update(patch).eq("id", userId);

  if (error) {
    console.error("[casa] mise à jour du profil échouée", error.message);
    return { ok: false, error: "Impossible d'enregistrer." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * « Résumés du soir », depuis l'application.
 *
 * Le même réglage que le lien de désabonnement des emails, pris par
 * l'autre bout — et il faut les deux. Celui qui veut arrêter le fait
 * depuis le message qu'il a sous les yeux ; celui qui veut reprendre
 * ne peut le faire que d'ici, puisqu'il ne reçoit plus rien où
 * cliquer.
 *
 * Ne touche ni aux invitations à un événement ni au lien de connexion :
 * ceux-là répondent à une action, et les couper reviendrait à casser
 * l'application plutôt qu'à rendre service.
 */
export async function setDigestPreference(wanted: boolean): Promise<FamilyResult> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Il faut être connecté." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ wants_digests: wanted })
    .eq("id", userId);

  if (error) {
    console.error("[casa] réglage des résumés échoué", error.message);
    return { ok: false, error: "Impossible d'enregistrer ce réglage." };
  }

  revalidatePath("/moi");
  return { ok: true };
}

/**
 * La voix de Casa AI, pour cette personne et elle seule (JON-59).
 *
 * On revalide la voix reçue **côté serveur** : une Server Action est
 * une porte d'entrée comme une autre, et rien ne garantit que ce qui
 * arrive ici vient du sélecteur. Une valeur inconnue est refusée
 * plutôt que rangée — une colonne qui contient n'importe quoi finit
 * par sortir quelque part.
 */
export async function setVoicePreference(voiceId: string): Promise<FamilyResult> {
  const userId = await getUserId();
  if (!userId) return { ok: false, error: "Il faut être connecté." };
  if (!isKnownVoice(voiceId)) return { ok: false, error: "Cette voix n'existe pas." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ voice_id: voiceId })
    .eq("id", userId);

  if (error) {
    console.error("[casa] choix de la voix échoué", error.message);
    return { ok: false, error: "Impossible d'enregistrer ce réglage." };
  }

  revalidatePath("/moi");
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/connexion");
}
