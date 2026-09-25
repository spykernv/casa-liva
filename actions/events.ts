"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ParticipantStatus } from "@/types";
import type { TablesUpdate } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { getCasaContext, getEvent, type CasaContext } from "@/lib/data/casa";
import { sendEventInvitation } from "@/lib/email/invitation";
import { pushInvitation, pushReponse } from "@/lib/push/notify";
import { appOrigin } from "@/lib/url";

/* ═══════════════════════════════════════════════════════════════
   Mutations d'événements.

   Chaque action re-vérifie l'identité. Le proxy ne suffit pas : une
   Server Action est traitée comme un POST sur la route où elle est
   utilisée, donc déplacer un composant peut lui faire quitter la
   couverture du `matcher` sans que rien ne le signale.
   ═══════════════════════════════════════════════════════════════ */

export type ActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Ce qu'on répond quand quelqu'un essaie de modifier un événement
 * importé.
 *
 * Le laisser passer serait pire qu'un refus : la modification tiendrait
 * quelques minutes, puis la synchronisation suivante la remplacerait
 * par la version Google, sans rien dire. Une action qui ne tient pas
 * est une trahison silencieuse.
 *
 * La RLS l'interdit déjà (migration 0004), mais elle refuse en
 * renvoyant zéro ligne — sans erreur. Sans ce contrôle explicite, la
 * Server Action répondrait « c'est fait » alors que rien n'a bougé.
 */
const IMPORTED_EVENT_REFUSAL =
  "Cet événement vient de ton agenda Google. Il se modifie là-bas.";

/**
 * Le filet de dernier recours : la RLS a refusé alors que `refusalFor`
 * venait de dire oui.
 *
 * Ça veut dire que quelque chose a bougé entre les deux — l'événement
 * supprimé par son créateur, ou la personne sortie de la maison. On ne
 * peut plus deviner lequel, donc on ne prétend pas le savoir : le
 * message le dit, et invite à regarder. C'est plus honnête que de
 * blâmer Google, ce que faisait le message précédent quel que soit le
 * vrai motif.
 */
const RACED =
  "Ça n'a pas marché — l'événement a dû changer de son côté. Recharge pour voir où il en est.";

/**
 * L'événement est-il touchable ici ? Renvoie le motif de refus, ou `null`.
 *
 * `ownerOnly` sépare les deux règles, qui n'ont pas la même portée :
 * seul le créateur modifie ou supprime (D21), mais **tout le monde
 * répond** « je viens / pas dispo » — répondre à une invitation n'est
 * pas modifier l'événement de quelqu'un.
 *
 * **Exportée depuis JON-66**, et c'est le premier geste de ce ticket :
 * un aperçu doit pouvoir demander « ai-je le droit ? » **sans tenter
 * l'écriture**. Sans ça, la seule façon de le savoir serait d'écrire —
 * soit l'inverse exact de D22. On proposerait de déplacer le golf de
 * Sophie, la personne validerait, et ça échouerait ensuite :
 * promettre puis échouer est précisément ce que D13 interdit.
 */
export async function refusalFor(
  eventId: string,
  context: CasaContext,
  { ownerOnly }: { ownerOnly: boolean },
): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("events")
    .select("source, connection_id, creator_id")
    .eq("id", eventId)
    .eq("family_id", context.familyId)
    .maybeSingle();

  if (!data) return "Cet événement n'existe plus.";
  if (data.connection_id || data.source !== "casa-liva") {
    return IMPORTED_EVENT_REFUSAL;
  }

  if (ownerOnly && data.creator_id !== context.me.id) {
    // On nomme la personne : « tu n'as pas le droit » laisse chercher
    // qui l'a, alors que la réponse est à l'écran.
    const owner = context.members.find((m) => m.id === data.creator_id);
    return owner
      ? `Cet événement est à ${owner.firstName}. Tu peux répondre « je viens » ou « pas dispo », mais pas le modifier.`
      : "Cet événement ne t'appartient pas.";
  }

  return null;
}

/** Toutes les vues qui affichent des événements. */
function revalidateCalendar() {
  revalidatePath("/aujourdhui");
  revalidatePath("/semaine");
  revalidatePath("/casa");
}

/**
 * Prévient les invités, un par un.
 *
 * **Pas le créateur** : il est partant par définition, et lui écrire
 * pour le lui apprendre serait comique. **Pas de désabonnement non
 * plus** — voir `lib/email/invitation.ts`.
 *
 * Chaque envoi est indépendant : une adresse morte ne doit pas priver
 * les autres de leur invitation.
 */
async function notifyInvitees(
  eventId: string,
  participantIds: string[],
  context: CasaContext,
) {
  // On relit l'événement plutôt que de recomposer l'objet depuis
  // l'entrée : c'est la base qui fait foi sur ce qui a réellement été
  // enregistré, y compris ce qu'elle a normalisé au passage.
  const event = await getEvent(eventId);
  if (!event) return;

  const appUrl = await appOrigin();
  const invitees = context.members.filter(
    (m) => participantIds.includes(m.id) && m.id !== context.me.id,
  );

  for (const guest of invitees) {
    /* Le téléphone d'abord, l'email en relais — et JAMAIS les deux
       (§66 bis, JON-47). Recevoir la même invitation deux fois finit
       par faire couper les deux canaux.

       L'ordre n'est pas arbitraire : une notification arrive tout de
       suite et se répond d'un tap, un email attend qu'on ouvre sa
       boîte. Mais elle se rate aussi — téléphone muet, permission
       refusée, abonnement mort — d'où le relais, qui est la raison
       d'être des deux interrupteurs plutôt qu'un. */
    if (await pushInvitation(event, guest, context.me)) continue;

    const outcome = await sendEventInvitation({
      event,
      guest,
      organiser: context.me,
      alreadyIn: context.members.filter((m) => participantIds.includes(m.id)),
      appUrl,
    });
    if (!outcome.ok) {
      console.error(`[casa] invitation non envoyée (${guest.id})`, outcome.reason);
    }
  }
}

/**
 * Ramène un délai de rappel dans ce que la base accepte (0017).
 *
 * La contrainte `events_rappel_minutes_borne` refuse tout ce qui sort
 * de 0 à 1440, et une Server Action ne doit pas faire échouer un
 * enregistrement d'événement sur un champ accessoire : on borne
 * plutôt que de refuser. **Le titre et les dates, eux, refusent** —
 * ils sont l'événement, le rappel n'est qu'un service par-dessus.
 */
function bornerRappel(minutes: number | null): number | null {
  if (minutes === null || !Number.isFinite(minutes)) return null;
  return Math.min(1440, Math.max(0, Math.round(minutes)));
}

export type CreateEventInput = {
  title: string;
  emoji?: string;
  location?: string;
  startAt: string;
  endAt: string;
  participantIds: string[];
  /**
   * Minutes avant le début pour prévenir tout le monde. `null` = aucun
   * rappel ; absent = le défaut de la base (30 min, 0017).
   *
   * **Choisi par l'organisateur, subi par tous** (D56) — c'est une
   * propriété de l'événement, comme l'heure et le lieu, pas une
   * préférence de qui le reçoit.
   */
  rappelMinutes?: number | null;
};

export async function createEvent(input: CreateEventInput): Promise<ActionResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Il manque le titre." };

  const start = new Date(input.startAt);
  const end = new Date(input.endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: "Ces dates ne tiennent pas debout." };
  }
  if (end <= start) {
    return { ok: false, error: "La fin doit venir après le début." };
  }

  // On n'invite que des gens de la maison, et le créateur en fait
  // toujours partie — il est difficile d'organiser un apéro auquel on
  // n'est pas convié.
  const known = new Set(context.members.map((m) => m.id));
  const participants = Array.from(
    new Set([context.me.id, ...input.participantIds.filter((id) => known.has(id))]),
  );

  const supabase = await createClient();

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      family_id: context.familyId,
      creator_id: context.me.id,
      title,
      emoji: input.emoji?.trim() || null,
      location: input.location?.trim() || null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      source: "casa-liva",
      ...(input.rappelMinutes === undefined
        ? {}
        : { rappel_minutes: bornerRappel(input.rappelMinutes) }),
    })
    .select("id")
    .single();

  if (error || !event) {
    console.error("[casa] création d'événement échouée", error?.message);
    return { ok: false, error: "Impossible de créer l'événement." };
  }

  const { error: participantsError } = await supabase
    .from("event_participants")
    .insert(
      participants.map((userId) => ({
        event_id: event.id,
        user_id: userId,
        // Le créateur est partant par définition ; les autres doivent
        // répondre.
        status: (userId === context.me.id ? "accepted" : "pending") as ParticipantStatus,
      })),
    );

  if (participantsError) {
    // L'événement existe mais sans invités : plutôt que de laisser un
    // fantôme, on annule tout.
    await supabase.from("events").delete().eq("id", event.id);
    console.error("[casa] invitation des participants échouée", participantsError.message);
    return { ok: false, error: "Impossible d'inviter les participants." };
  }

  /* Les emails partent APRÈS la réponse, et ne peuvent pas la faire
     échouer (§16).

     `after()` est fait pour ça : trois invitations, c'est trois allers
     -retours chez Resend, soit une bonne seconde ajoutée à un geste
     qui doit tenir sous les quinze. La phase 4 avait appris l'inverse
     — n'y mettre que ce dont l'écran n'a PAS besoin. Un email n'est
     pas affiché ; il a donc toute sa place ici. */
  after(async () => {
    await notifyInvitees(event.id, participants, context);
  });

  revalidateCalendar();
  return { ok: true, id: event.id };
}

/**
 * Remet en place un événement qu'on vient de supprimer — « Annuler ».
 *
 * **`createEvent()` ne convenait pas, et c'était un défaut réel, pas
 * une élégance manquante.** `UndoBar` recréait l'événement par cette
 * action, donc repassait par `after(() => notifyInvitees(...))`. Trois
 * conséquences, toutes déjà vraies avant JON-66 :
 *
 * - **annuler une suppression renvoyait une invitation par email à
 *   tout le monde.** Le geste censé réparer une erreur en produisait
 *   une seconde, dans la boîte des autres ;
 * - **les réponses des participants étaient effacées** : tout le monde
 *   repassait en `pending`, y compris ceux qui avaient dit « pas
 *   dispo » ;
 * - **`allDay` n'était pas transmis** : une journée entière revenait
 *   en créneau horaire.
 *
 * La phase 2 le déclenchait rarement — il faut supprimer puis se
 * raviser en sept secondes. Une suppression conversationnelle
 * l'exercera tout le temps.
 *
 * On **recrée** plutôt qu'on ne ressuscite : la ligne a été supprimée,
 * ses participants aussi (cascade). L'événement change donc
 * d'identifiant, ce qui reste sans conséquence tant que rien d'externe
 * ne le référence. Ce qui compte est ailleurs : **rien ne part par
 * email, et l'état des réponses est celui d'avant.**
 */
/**
 * Ce qu'il faut pour remettre un événement en place.
 *
 * Structurel plutôt que `CasaEvent` : un brouillon de suppression n'a
 * ni `id` (il vient d'être effacé), ni `familyId`, ni `createdAt`. Un
 * `CasaEvent` reste assignable tel quel — c'est ce que la grille passe.
 */
export type EventSnapshot = {
  title: string;
  emoji?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  source: string;
  creatorId: string;
  participants: { userId: string; status: ParticipantStatus }[];
};

export async function restoreEvent(snapshot: EventSnapshot): Promise<ActionResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  // On ne restaure que ce qu'on avait le droit de supprimer — et un
  // événement importé de Google n'en fait pas partie (D13).
  if (snapshot.source !== "casa-liva" || snapshot.creatorId !== context.me.id) {
    return { ok: false, error: "Cet événement ne peut pas être remis en place." };
  }

  const supabase = await createClient();

  const { data: event, error } = await supabase
    .from("events")
    .insert({
      family_id: context.familyId,
      creator_id: context.me.id,
      title: snapshot.title,
      emoji: snapshot.emoji ?? null,
      location: snapshot.location ?? null,
      start_at: snapshot.startAt,
      end_at: snapshot.endAt,
      all_day: snapshot.allDay ?? false,
      source: "casa-liva",
    })
    .select("id")
    .single();

  if (error || !event) {
    console.error("[casa] remise en place échouée", error?.message);
    return { ok: false, error: "Impossible de remettre l'événement." };
  }

  const known = new Set(context.members.map((m) => m.id));
  const participants = snapshot.participants.filter((p) => known.has(p.userId));

  if (participants.length > 0) {
    const { error: participantsError } = await supabase
      .from("event_participants")
      .insert(
        participants.map((p) => ({
          event_id: event.id,
          user_id: p.userId,
          // Le statut d'avant, pas `pending`. Quelqu'un qui avait dit
          // « pas dispo » n'a pas changé d'avis parce qu'on a hésité.
          status: p.status,
        })),
      );

    if (participantsError) {
      await supabase.from("events").delete().eq("id", event.id);
      console.error("[casa] remise des participants échouée", participantsError.message);
      return { ok: false, error: "Impossible de remettre l'événement." };
    }
  }

  /* **Aucun `after(notifyInvitees)` ici, et c'est tout l'intérêt.**
     Personne n'a besoin d'apprendre par email qu'un événement qui
     existait il y a sept secondes existe toujours. */
  revalidateCalendar();
  return { ok: true, id: event.id };
}

export type UpdateEventInput = {
  id: string;
  title?: string;
  emoji?: string | null;
  location?: string | null;
  startAt?: string;
  endAt?: string;
  participantIds?: string[];
  /** Voir `CreateEventInput.rappelMinutes` (D56). */
  rappelMinutes?: number | null;
};

/**
 * Sert au glisser-déposer et au redimensionnement comme à l'édition.
 * L'UI applique le changement immédiatement et appelle ceci en fond
 * (§70) ; en cas d'échec elle revient en arrière.
 */
export async function updateEvent(input: UpdateEventInput): Promise<ActionResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  const refusal = await refusalFor(input.id, context, { ownerOnly: true });
  if (refusal) return { ok: false, error: refusal };

  const supabase = await createClient();

  const patch: TablesUpdate<"events"> = {};

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) return { ok: false, error: "Il manque le titre." };
    patch.title = title;
  }
  if (input.emoji !== undefined) patch.emoji = input.emoji?.trim() || null;
  if (input.location !== undefined) patch.location = input.location?.trim() || null;
  if (input.rappelMinutes !== undefined) {
    patch.rappel_minutes = bornerRappel(input.rappelMinutes);
    /* Changer le délai remet le rappel en jeu. Sans ça, avancer un
       rappel de 30 min à 2 h sur un événement déjà notifié ne
       produirait rien — la trace dirait « déjà fait » pour une règle
       qui n'existe plus. Déplacer l'événement, lui, s'invalide tout
       seul : `rappel_envoye_pour` cesse de correspondre (0017). */
    patch.rappel_envoye_pour = null;
  }

  if (input.startAt !== undefined || input.endAt !== undefined) {
    const { data: current } = await supabase
      .from("events")
      .select("start_at, end_at")
      .eq("id", input.id)
      .maybeSingle();

    if (!current) return { ok: false, error: "Cet événement n'existe plus." };

    const start = new Date(input.startAt ?? current.start_at);
    const end = new Date(input.endAt ?? current.end_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return { ok: false, error: "La fin doit venir après le début." };
    }
    patch.start_at = start.toISOString();
    patch.end_at = end.toISOString();
  }

  if (Object.keys(patch).length > 0) {
    // `.select()` n'est pas décoratif : une écriture refusée par la RLS
    // ne renvoie pas d'erreur, seulement zéro ligne. Sans ça, l'UI
    // afficherait un déplacement qui n'a jamais eu lieu.
    const { data, error } = await supabase
      .from("events")
      .update(patch)
      .eq("id", input.id)
      .eq("family_id", context.familyId)
      .select("id");

    if (error) {
      console.error("[casa] mise à jour d'événement échouée", error.message);
      return { ok: false, error: "Impossible de modifier l'événement." };
    }
    if (!data || data.length === 0) {
      return { ok: false, error: RACED };
    }
  }

  if (input.participantIds) {
    const known = new Set(context.members.map((m) => m.id));
    const wanted = new Set(input.participantIds.filter((id) => known.has(id)));
    wanted.add(context.me.id);

    const { data: existing } = await supabase
      .from("event_participants")
      .select("user_id")
      .eq("event_id", input.id);

    const before = new Set((existing ?? []).map((p) => p.user_id));
    const toAdd = [...wanted].filter((id) => !before.has(id));
    const toRemove = [...before].filter((id) => !wanted.has(id));

    if (toAdd.length > 0) {
      await supabase.from("event_participants").insert(
        toAdd.map((userId) => ({
          event_id: input.id,
          user_id: userId,
          status: "pending" as ParticipantStatus,
        })),
      );
    }
    if (toRemove.length > 0) {
      await supabase
        .from("event_participants")
        .delete()
        .eq("event_id", input.id)
        .in("user_id", toRemove);
    }
  }

  revalidateCalendar();
  return { ok: true, id: input.id };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  const refusal = await refusalFor(id, context, { ownerOnly: true });
  if (refusal) return { ok: false, error: refusal };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .delete()
    .eq("id", id)
    .eq("family_id", context.familyId)
    .select("id");

  if (error) {
    console.error("[casa] suppression d'événement échouée", error.message);
    return { ok: false, error: "Impossible de supprimer l'événement." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: RACED };
  }

  revalidateCalendar();
  return { ok: true, id };
}

/** « Je viens » / « Pas dispo » — ne concerne que soi (§16). */
export async function setParticipation(
  eventId: string,
  status: ParticipantStatus,
): Promise<ActionResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  /* Répondre « pas dispo » à son propre rendez-vous Google le ferait
     disparaître de la grille ET libérerait le créneau pour toute la
     maison — alors que le rendez-vous, lui, tient toujours. On
     organiserait un apéro pendant le dentiste de quelqu'un.

     `ownerOnly: false` : c'est tout l'intérêt de répondre. D21 retire
     aux autres le droit de *modifier* l'événement, pas celui de dire
     s'ils viennent — sinon on n'invite plus personne, on décrète. */
  const refusal = await refusalFor(eventId, context, { ownerOnly: false });
  if (refusal) return { ok: false, error: refusal };

  const supabase = await createClient();
  const { error } = await supabase
    .from("event_participants")
    .upsert(
      { event_id: eventId, user_id: context.me.id, status },
      { onConflict: "event_id,user_id" },
    );

  if (error) {
    console.error("[casa] réponse à l'invitation échouée", error.message);
    return { ok: false, error: "Impossible d'enregistrer ta réponse." };
  }

  /* Prévenir celui qui a proposé — c'est le troisième cas de §66 bis,
     et le plus utile : on organise, puis on attend, sans savoir.

     **Pas d'email en relais ici, et c'est délibéré.** Une réponse est
     une information agréable, pas une action à mener : elle mérite une
     notification si le téléphone est là, et le silence sinon. Écrire un
     email pour chaque « je viens » remplirait la boîte de quatre
     personnes à chaque événement — exactement le zèle qui fait couper
     les résumés du soir.

     Ni pour soi-même — répondre à sa propre proposition et s'en
     recevoir la nouvelle serait comique. Ni pour un retour à
     l'indécision, qui n'apprend rien. */
  if (status !== "pending") {
    const event = await getEvent(eventId);
    const organiser = event
      ? context.members.find((m) => m.id === event.creatorId)
      : undefined;

    if (event && organiser && organiser.id !== context.me.id) {
      await pushReponse(event, organiser, context.me, status);
    }
  }

  revalidateCalendar();
  return { ok: true, id: eventId };
}
