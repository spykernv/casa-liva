import "server-only";
import { addDays } from "date-fns";
import type { CasaEvent, FamilyMember, ParticipantStatus } from "@/types";
import type { Tables } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDailyDigest, sendWeeklyDigest } from "@/lib/email/digest";
import { unsubscribeLinksFor } from "@/lib/email/unsubscribe";
import { casaDate, casaStartOfDay } from "@/lib/date";

/* ═══════════════════════════════════════════════════════════════
   Le passage quotidien qui écrit aux habitants.

   Tourne sous la **clé de service**, sans session : il n'y a personne
   derrière. C'est donc le seul endroit du système où la RLS ne protège
   rien, et où chaque requête doit filtrer sur `family_id` elle-même —
   pas par prudence, mais parce que rien d'autre ne le fera.
   ═══════════════════════════════════════════════════════════════ */

/** Dimanche : on envoie la semaine plutôt que le lendemain. */
function isSunday(now: number): boolean {
  return casaDate(now).getDay() === 0;
}

type ParticipantRow = { user_id: string; status: ParticipantStatus };

function toEvent(row: Tables<"events"> & { event_participants: ParticipantRow[] | null }): CasaEvent {
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

export type DigestTally = {
  maisons: number;
  envoyes: number;
  silencieux: number;
  desabonnes: number;
  echecs: number;
};

/**
 * Écrit à toutes les maisons. Renvoie un décompte, ne lève jamais :
 * une famille qui échoue ne doit pas priver les autres de leur résumé.
 */
export async function sendDigests(now: number, appUrl: string): Promise<DigestTally> {
  const supabase = createAdminClient();
  const tally: DigestTally = {
    maisons: 0,
    envoyes: 0,
    silencieux: 0,
    desabonnes: 0,
    echecs: 0,
  };

  const { data: families, error } = await supabase.from("families").select("id");
  if (error) {
    console.error("[casa] lecture des maisons échouée", error.message);
    return tally;
  }

  const dimanche = isSunday(now);

  /* La fenêtre est la même pour les deux résumés : huit jours couvrent
     le lendemain du quotidien comme la semaine de l'hebdomadaire. La
     charger une fois par maison, et non une fois par personne, évite
     de relire le même agenda cinq fois. */
  const from = casaStartOfDay(now).getTime();
  const to = addDays(casaStartOfDay(now), 9).getTime();

  for (const family of families ?? []) {
    const { data: memberRows } = await supabase
      .from("family_members")
      .select("users(*)")
      .eq("family_id", family.id);

    const members = (memberRows ?? [])
      .map((r) => (r.users as unknown as Tables<"users"> | null))
      .filter((u): u is Tables<"users"> => u !== null);

    // Une maison vide — il en reste parfois après un déménagement
    // (D18) — n'a personne à qui écrire.
    if (members.length === 0) continue;
    tally.maisons += 1;

    const { data: eventRows } = await supabase
      .from("events")
      .select("*, event_participants(user_id, status)")
      // Filtre explicite : sous clé de service, la RLS ne filtre plus
      // rien. C'est ce `eq` qui empêche d'envoyer l'agenda d'une
      // maison à une autre.
      .eq("family_id", family.id)
      .lt("start_at", new Date(to).toISOString())
      .gt("end_at", new Date(from).toISOString())
      .order("start_at");

    const events = ((eventRows ?? []) as (Tables<"events"> & {
      event_participants: ParticipantRow[] | null;
    })[]).map(toEvent);

    const all = members.map(toMember);

    for (const row of members) {
      if (!row.wants_digests) {
        tally.desabonnes += 1;
        continue;
      }

      const unsubscribe = await unsubscribeLinksFor(row.id, appUrl);
      if (!unsubscribe) {
        // Sans lien de désabonnement, on n'envoie pas. Écrire quand
        // même serait exactement ce qui fait condamner un domaine.
        tally.echecs += 1;
        continue;
      }

      const input = {
        recipient: toMember(row),
        members: all,
        events,
        now,
        appUrl,
        unsubscribe,
      };

      const outcome = dimanche
        ? await sendWeeklyDigest(input)
        : await sendDailyDigest(input);

      // `null` = il n'y avait rien à dire, et on s'est tu.
      if (outcome === null) tally.silencieux += 1;
      else if (outcome.ok) tally.envoyes += 1;
      else tally.echecs += 1;
    }
  }

  return tally;
}
