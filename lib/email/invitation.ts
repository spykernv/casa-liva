import "server-only";
import type { CasaEvent, FamilyMember } from "@/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/email/send";
import { button, escape, eventCard, layout, memberChip } from "@/lib/email/layout";
import {
  formatAllDayRange,
  formatDayLong,
  formatTime,
  isSameCasaDay,
} from "@/lib/date";

/* ═══════════════════════════════════════════════════════════════
   « Casa Liva a un plan pour toi. » — §16

   L'un des dix points du Core MVP : recevoir une invitation, et
   pouvoir répondre.
   ═══════════════════════════════════════════════════════════════ */

/** « Samedi 8 août · 10:00 → 12:00 », ou la forme journée entière. */
function when(event: CasaEvent): string {
  if (event.allDay) {
    return `${formatAllDayRange(event.startAt, event.endAt)} · toute la journée`;
  }
  const day = formatDayLong(event.startAt);
  const end = isSameCasaDay(event.startAt, event.endAt)
    ? formatTime(event.endAt)
    : `${formatDayLong(event.endAt)} ${formatTime(event.endAt)}`;
  return `${day} · ${formatTime(event.startAt)} → ${end}`;
}

/**
 * Le secret qui permet de répondre sans se connecter.
 *
 * Il est fabriqué **ici**, au moment de l'envoi, et sous la clé de
 * service : la table n'a aucune policy, donc rien d'autre ne peut ni
 * l'écrire ni la lire. Conséquence voulue — un jeton n'existe que si
 * un email est réellement parti.
 */
async function rsvpToken(eventId: string, userId: string): Promise<string | null> {
  const supabase = createAdminClient();

  // `upsert` plutôt qu'`insert` : réinviter quelqu'un sur le même
  // événement ne doit pas casser, et surtout ne doit pas invalider le
  // lien du premier message — il peut très bien être encore ouvert.
  const { data, error } = await supabase
    .from("event_rsvp_tokens")
    .upsert(
      { event_id: eventId, user_id: userId },
      { onConflict: "event_id,user_id", ignoreDuplicates: true },
    )
    .select("token")
    .maybeSingle();

  if (data?.token) return data.token;

  // `ignoreDuplicates` ne renvoie rien quand la ligne existait déjà.
  const { data: existing } = await supabase
    .from("event_rsvp_tokens")
    .select("token")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing && error) {
    console.error("[casa] jeton de réponse impossible", error.message);
  }
  return existing?.token ?? null;
}

export type InvitationInput = {
  event: CasaEvent;
  /** À qui on écrit. */
  guest: FamilyMember;
  organiser: FamilyMember;
  /** Ceux qui sont déjà partants — « Jonathan et Papa sont déjà partants. » */
  alreadyIn: FamilyMember[];
  appUrl: string;
};

/**
 * Envoie l'invitation à **une** personne.
 *
 * Le lien mène à un écran qui demande, pas à une URL qui écrit : un
 * lien dans un email est visité par les robots de Gmail et d'Outlook,
 * et un `GET` qui enregistrerait la réponse répondrait « je viens »
 * tout seul, avant même l'ouverture du message. C'est la leçon que D18
 * a déjà payée sur `/invitation/[token]`.
 */
export async function sendEventInvitation({
  event,
  guest,
  organiser,
  alreadyIn,
  appUrl,
}: InvitationInput) {
  const token = await rsvpToken(event.id, guest.id);
  if (!token) return { ok: false as const, reason: "jeton" };

  const rsvp = `${appUrl}/rsvp/${token}`;

  const partants = alreadyIn.filter((m) => m.id !== guest.id);
  const partantsPhrase =
    partants.length === 0
      ? `${organiser.firstName} organise.`
      : partants.length === 1
        ? `${partants[0].firstName} est déjà partant.`
        : `${partants.slice(0, -1).map((m) => m.firstName).join(", ")} et ${partants[partants.length - 1].firstName} sont déjà partants.`;

  const body = `
<p style="margin:0 0 4px;">${escape(organiser.firstName)} t’a mis sur le coup.</p>
${eventCard({
  title: event.title,
  emoji: event.emoji,
  when: when(event),
  location: event.location,
  chips: alreadyIn.map((m) => memberChip(m.firstName, m.color)).join(""),
  color: organiser.color,
})}
<p style="margin:0 0 20px;">${escape(partantsPhrase)}</p>
${button("Je viens", `${rsvp}?r=oui`)}${button("Pas dispo", `${rsvp}?r=non`, "secondary")}
<p style="margin:18px 0 0;font-size:14px;">Tu pourras changer d’avis — c’est un agenda de famille, pas un contrat.</p>`;

  const text = [
    "Casa Liva a un plan pour toi.",
    "",
    `${event.emoji ? `${event.emoji} ` : ""}${event.title}`,
    when(event),
    event.location ?? "",
    "",
    partantsPhrase,
    "",
    `Je viens :   ${rsvp}?r=oui`,
    `Pas dispo :  ${rsvp}?r=non`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return sendMail({
    to: guest.email,
    // Le titre dans l'objet : c'est ce qu'on lit dans la liste des
    // messages, souvent sans ouvrir.
    subject: `${event.emoji ? `${event.emoji} ` : ""}${event.title} — ${when(event)}`,
    html: layout({
      heading: "Casa Liva a un plan pour toi.",
      body,
      appUrl,
      // Pas de désabonnement : cette invitation répond à une action de
      // quelqu'un. Proposer de couper reviendrait à proposer de ne
      // plus être convié.
    }),
    text,
  });
}
