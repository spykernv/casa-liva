import "server-only";
import type { CasaEvent, FamilyMember, ParticipantStatus } from "@/types";
import type { Tables } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushRappel } from "@/lib/push/notify";

/* ═══════════════════════════════════════════════════════════════
   Le balayage des rappels (§66 bis, D54, D56, JON-79).

   Tourne sous la **clé de service**, sans session — il n'y a personne
   derrière. Comme `lib/email/cron-digests.ts`, c'est donc un des rares
   endroits où la RLS ne protège rien : chaque requête filtre elle-même,
   parce que rien d'autre ne le fera.

   ── Qui reçoit : tout le monde, sauf qui a dit non ──

   Décidé avec le commanditaire le 26 août : **chaque participant, plus
   l'organisateur.** Un rappel n'est pas une invitation — la décision
   d'y aller est déjà prise, et celui qui organise a autant besoin qu'un
   autre de ne pas oublier ce qu'il a proposé.

   Deux exclusions, et deux seulement :

   - **qui a décliné.** Rappeler un rendez-vous auquel on a répondu
     « pas dispo » n'informe de rien et donne le sentiment de ne pas
     avoir été entendu ;
   - **qui a coupé `wants_push`.** Vérifié dans `notifierPersonne`, pas
     ici : le réglage appartient à celui qui le subit (D27, D37) et une
     seule fonction doit le lire.

   ── Ce qui garantit qu'un rappel ne part qu'une fois ──

   `rappel_envoye_pour` porte le `start_at` **pour lequel** l'envoi a eu
   lieu. Deux passages du planificateur ne produisent donc qu'un envoi ;
   et un événement déplacé cesse de correspondre, donc son rappel repart
   seul. Voir 0017 : la colonne s'invalide d'elle-même, il n'y a aucun
   chemin de déplacement à tenir à jour.

   Le `tag` de la notification empêche l'empilement **à l'écran**, ce
   qui est autre chose et ne suffirait pas : deux envois arriveraient
   quand même, sur deux appareils, et compteraient deux fois.

   ── Pas d'email de rappel, et c'est un choix ──

   D52 dit « le push d'abord, l'email en relais, jamais les deux ». Pour
   l'invitation et la réponse, l'email existe et prend le relais. Ici il
   n'y a **rien à relayer** : un rappel « dans 30 minutes » qui
   arriverait par email n'a pas de sens — on ne consulte pas sa boîte
   pour ça, et il serait lu après coup. Le canal du rappel est le
   téléphone, ou rien.
   ═══════════════════════════════════════════════════════════════ */

/**
 * **La** règle qui décide si un rappel doit partir. Une seule fonction,
 * et elle est pure : c'est ce qui la rend essayable sans base
 * (`scripts/verify-rappels.mjs`).
 *
 * Quatre conditions, et aucune n'est superflue :
 *
 * 1. **un rappel est demandé** — `null` veut dire que l'organisateur
 *    n'en veut pas, et ça se respecte ;
 * 2. **l'événement n'a pas commencé** — rappeler un rendez-vous en
 *    cours ne prévient de rien et fait douter du reste ;
 * 3. **l'heure du rappel est atteinte** — `début − délai ≤ maintenant` ;
 * 4. **il n'est pas déjà parti POUR CETTE heure-là.** La comparaison
 *    porte sur le `start_at`, pas sur un booléen : un événement déplacé
 *    a une heure neuve, la valeur rangée cesse de correspondre, et le
 *    rappel repart tout seul (0017).
 */
export function rappelDu(
  row: {
    start_at: string;
    rappel_minutes: number | null;
    rappel_envoye_pour: string | null;
  },
  maintenant: number,
): boolean {
  if (row.rappel_minutes === null) return false;

  const debut = new Date(row.start_at).getTime();
  if (!Number.isFinite(debut)) return false;

  if (debut <= maintenant) return false;
  if (debut - row.rappel_minutes * 60_000 > maintenant) return false;

  if (row.rappel_envoye_pour === null) return true;
  return new Date(row.rappel_envoye_pour).getTime() !== debut;
}

type ParticipantRow = { user_id: string; status: ParticipantStatus };
type EventAvecParticipants = Tables<"events"> & {
  event_participants: ParticipantRow[] | null;
};

function toEvent(row: EventAvecParticipants): CasaEvent {
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

function toMember(row: Tables<"users">): FamilyMember {
  return {
    id: row.id,
    firstName: row.first_name || row.email.split("@")[0],
    email: row.email,
    avatar: row.avatar || row.id,
    color: row.color,
    timezone: row.timezone,
  };
}

export type RappelTally = {
  /** Événements dont l'heure de rappel est atteinte. */
  dus: number;
  /** Notifications effectivement acceptées par un appareil. */
  envoyes: number;
  /** Destinataires sans appareil joignable, ou ayant coupé le réglage. */
  silencieux: number;
  /** Événements marqués comme traités. */
  marques: number;
};

/**
 * Envoie les rappels échus, et rend un décompte. **Ne lève jamais** :
 * un événement qui échoue ne doit pas priver les suivants du leur.
 *
 * `maintenant` est passé en paramètre plutôt que lu ici — c'est ce qui
 * rend la fonction essayable à une heure choisie, comme `sendDigests`.
 */
export async function envoyerRappels(maintenant: number): Promise<RappelTally> {
  const supabase = createAdminClient();
  const tally: RappelTally = { dus: 0, envoyes: 0, silencieux: 0, marques: 0 };

  const maintenantIso = new Date(maintenant).toISOString();

  /* On ne peut pas exprimer « start_at - rappel_minutes <= maintenant »
     dans le langage de requête de PostgREST : la borne dépend d'une
     colonne. On charge donc la fenêtre la plus large possible — la plus
     grande valeur de la liste, deux heures (D56) — et on tranche en
     mémoire juste en dessous. La fenêtre est courte et l'index partiel
     de 0017 la rend bon marché. */
  const horizon = new Date(maintenant + 2 * 60 * 60_000).toISOString();

  const { data: rows, error } = await supabase
    .from("events")
    .select("*, event_participants(user_id, status)")
    .not("rappel_minutes", "is", null)
    .gt("start_at", maintenantIso)
    .lte("start_at", horizon)
    .order("start_at");

  if (error) {
    console.error("[casa-push] lecture des rappels échouée", error.message);
    return tally;
  }

  for (const row of (rows ?? []) as EventAvecParticipants[]) {
    /* La règle vit dans `rappelDu` et nulle part ailleurs. La requête
       ci-dessus dégrossit — elle ne peut pas comparer une colonne à une
       autre — mais elle ne décide pas : deux endroits qui décideraient
       du même finiraient par ne pas s'accorder, comme `weekAnchor`
       (JON-60) et `gridBounds` (JON-75). */
    if (!rappelDu(row, maintenant)) continue;

    tally.dus += 1;
    const event = toEvent(row);

    /* Le titre se lit avec le PROPRIÉTAIRE de l'événement, jamais avec
       le destinataire : sur l'écran verrouillé de quelqu'un d'autre,
       c'est bien « 🔒 Sophie occupée » qu'il faut écrire (D13). C'est
       `pushRappel` qui applique `visibleTitle`. */
    const { data: proprietaireRow } = await supabase
      .from("users")
      .select("*")
      .eq("id", row.creator_id)
      .maybeSingle();

    if (!proprietaireRow) {
      console.error(`[casa-push] propriétaire introuvable (${row.id})`);
      continue;
    }
    const proprietaire = toMember(proprietaireRow);

    // L'organisateur en fait toujours partie, même s'il n'est pas
    // inscrit dans `event_participants` — il a autant besoin de ne pas
    // oublier ce qu'il a proposé.
    const destinataires = new Set<string>([row.creator_id]);
    for (const p of row.event_participants ?? []) {
      if (p.status === "declined") continue;
      destinataires.add(p.user_id);
    }

    for (const userId of destinataires) {
      const { data: personneRow } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      if (!personneRow) continue;

      const prevenu = await pushRappel(
        event,
        toMember(personneRow),
        proprietaire,
        maintenant,
      );
      if (prevenu) tally.envoyes += 1;
      else tally.silencieux += 1;
    }

    /* On marque **même si personne n'a été joint.** Sans ça, un
       événement dont tous les destinataires ont coupé les notifications
       serait retenté toutes les quinze minutes jusqu'à son début, pour
       rien. Le rappel a eu lieu ; qu'il n'ait atterri nulle part est une
       autre question, et elle se lit dans `silencieux`. */
    const { error: marqueError } = await supabase
      .from("events")
      .update({ rappel_envoye_pour: row.start_at })
      .eq("id", row.id);

    if (marqueError) {
      console.error(`[casa-push] marquage du rappel échoué (${row.id})`, marqueError.message);
    } else {
      tally.marques += 1;
    }
  }

  return tally;
}
