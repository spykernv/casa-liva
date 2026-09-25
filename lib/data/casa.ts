import { cache } from "react";
import type { CasaEvent, FamilyMember, ParticipantStatus } from "@/types";
import type { Tables } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { resolveVoice } from "@/lib/voice/voices";

/* ═══════════════════════════════════════════════════════════════
   Accès aux données côté serveur.

   Toutes les requêtes re-filtrent explicitement sur `family_id`, même
   si la RLS le garantit déjà. Ce n'est pas de la défiance : Postgres
   construit un bien meilleur plan quand le filtre est dans la requête
   plutôt que seulement dans la policy. La RLS sert à la sécurité, pas
   au filtrage.

   `cache()` déduplique les appels pour une même requête HTTP : le
   layout et la page peuvent demander la famille sans la charger deux
   fois.
   ═══════════════════════════════════════════════════════════════ */

export type CasaContext = {
  me: FamilyMember;
  familyId: string;
  familyName: string;
  members: FamilyMember[];
};

function toMember(row: Tables<"users">, role?: "owner" | "member"): FamilyMember {
  return {
    id: row.id,
    firstName: row.first_name || row.email.split("@")[0],
    email: row.email,
    avatar: row.avatar || row.id,
    color: row.color,
    timezone: row.timezone,
    role,
  };
}

type EventWithParticipants = Tables<"events"> & {
  event_participants: { user_id: string; status: ParticipantStatus }[] | null;
};

function toEvent(row: EventWithParticipants): CasaEvent {
  return {
    id: row.id,
    familyId: row.family_id,
    creatorId: row.creator_id,
    title: row.title,
    description: row.description ?? undefined,
    emoji: row.emoji ?? undefined,
    location: row.location ?? undefined,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    source: row.source,
    externalEventId: row.external_event_id ?? undefined,
    busy: row.busy,
    isPrivate: row.is_private,
    rappelMinutes: row.rappel_minutes,
    participants: (row.event_participants ?? []).map((p) => ({
      eventId: row.id,
      userId: p.user_id,
      status: p.status,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** L'identifiant de l'utilisateur connecté, ou `null`. */
export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? sub : null;
});

/**
 * Le contexte complet : qui je suis, dans quelle maison, avec qui.
 * Renvoie `null` si l'utilisateur n'est pas connecté ou n'appartient
 * encore à aucune maison — c'est l'onboarding qui traite ce cas.
 */
export const getCasaContext = cache(async (): Promise<CasaContext | null> => {
  const userId = await getUserId();
  if (!userId) return null;

  const supabase = await createClient();

  /* Pas de `.limit(1)`.

     Il y en avait un, et il tirait la maison au sort : sans ORDER BY,
     Postgres rend la ligne qu'il veut. Quelqu'un présent dans deux
     maisons se voyait servir l'une ou l'autre — en pratique la
     coquille vide créée par l'onboarding, pendant que le reste de la
     famille le voyait dans la bonne.

     La contrainte `family_members_one_per_user` (migration 0007)
     garantit désormais une seule appartenance. Sans `limit`, une
     seconde ligne ferait crier `maybeSingle()` au lieu de rester
     silencieuse — c'est exactement ce qu'on veut d'une invariante. */
  const { data: membership, error } = await supabase
    .from("family_members")
    .select("family_id, role, families(name)")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[casa] lecture de l'appartenance échouée", error.message);
    return null;
  }
  if (!membership) return null;

  const { data: rows } = await supabase
    .from("family_members")
    .select("role, users(*)")
    .eq("family_id", membership.family_id);

  const members = (rows ?? [])
    .map((r) => {
      const user = r.users as unknown as Tables<"users"> | null;
      return user ? toMember(user, r.role) : null;
    })
    .filter((m): m is FamilyMember => m !== null)
    // Ordre stable : les couleurs et les colonnes ne doivent pas
    // changer de place d'un chargement à l'autre.
    .sort((a, b) => a.firstName.localeCompare(b.firstName, "fr"));

  const me = members.find((m) => m.id === userId);
  if (!me) return null;

  const family = membership.families as unknown as { name: string } | null;

  return {
    me,
    familyId: membership.family_id,
    familyName: family?.name ?? "Casa Liva",
    members,
  };
});

/**
 * Le réglage « résumés du soir » de la personne connectée.
 *
 * Lu à part plutôt qu'ajouté à `FamilyMember` : ce type part au
 * navigateur pour **tous** les membres, et savoir qui s'est désabonné
 * ne regarde personne d'autre.
 */
export const wantsDigests = cache(async (): Promise<boolean> => {
  const userId = await getUserId();
  if (!userId) return false;

  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("wants_digests")
    .eq("id", userId)
    .maybeSingle();

  // En cas de doute, on considère que oui : c'est l'état par défaut, et
  // afficher « coupés » à tort ferait croire à une panne.
  return data?.wants_digests ?? true;
});

/**
 * Veut-elle des notifications sur son téléphone ? (0016, JON-47)
 *
 * Pendant exact de `wantsDigests`, et **absente de `FamilyMember`**
 * pour la même raison : une préférence appartient à celui qui la subit
 * et ne regarde personne d'autre. Elle ne part donc jamais au
 * navigateur avec la liste des habitants.
 *
 * Le réglage est distinct de l'abonnement : couper ici garde l'appareil
 * connu, et se rallume d'un tap sans repasser par la permission du
 * système — qui, sur iOS, ne se redemande pas.
 */
export const wantsPush = cache(async (): Promise<boolean> => {
  const userId = await getUserId();
  if (!userId) return false;

  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("wants_push")
    .eq("id", userId)
    .maybeSingle();

  return data?.wants_push ?? true;
});

/**
 * La voix que la personne connectée a choisie pour Casa AI.
 *
 * Lue à part plutôt qu'ajoutée à `FamilyMember`, pour la même raison
 * que `wants_digests` : ce type part au navigateur pour **tous** les
 * membres, et la voix que Mamie écoute ne regarde personne d'autre.
 *
 * Une valeur inconnue — voix retirée du catalogue, ligne bricolée à la
 * main — retombe sur celle de la maison plutôt que de rendre
 * l'application muette.
 */
export const myVoice = cache(async (): Promise<string> => {
  const userId = await getUserId();
  if (!userId) return resolveVoice(null);

  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("voice_id")
    .eq("id", userId)
    .maybeSingle();

  return resolveVoice(data?.voice_id);
});

/**
 * Les événements qui **croisent** l'intervalle, pas seulement ceux qui
 * y commencent : un événement démarré hier soir et fini ce matin doit
 * apparaître aujourd'hui.
 */
export async function getEvents(
  familyId: string,
  fromMs: number,
  toMs: number,
): Promise<CasaEvent[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("events")
    .select("*, event_participants(user_id, status)")
    .eq("family_id", familyId)
    .lt("start_at", new Date(toMs).toISOString())
    .gt("end_at", new Date(fromMs).toISOString())
    .order("start_at");

  if (error) {
    console.error("[casa] lecture des événements échouée", error.message);
    return [];
  }

  return (data as EventWithParticipants[]).map(toEvent);
}

/** Un événement précis, avec ses participants. */
export async function getEvent(eventId: string): Promise<CasaEvent | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("events")
    .select("*, event_participants(user_id, status)")
    .eq("id", eventId)
    .maybeSingle();

  return data ? toEvent(data as EventWithParticipants) : null;
}
