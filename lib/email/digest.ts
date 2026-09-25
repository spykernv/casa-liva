import "server-only";
import { addDays } from "date-fns";
import type { CasaEvent, FamilyMember } from "@/types";
import { sendMail } from "@/lib/email/send";
import type { UnsubscribeLinks } from "@/lib/email/unsubscribe";
import { button, escape, layout, memberChip, MEMBER_HEX } from "@/lib/email/layout";
import { findCommonSlots } from "@/lib/availability/availability";
import { visibleTitle } from "@/lib/calendar/visible";
import {
  casaStartOfDay,
  formatDayLong,
  formatDuration,
  formatTime,
  isSameCasaDay,
} from "@/lib/date";

/* ═══════════════════════════════════════════════════════════════
   Les envois périodiques — §39-42.

   Une règle domine tout ce fichier : **ne rien envoyer quand il n'y a
   rien à dire.** Un résumé quotidien vide, reçu tous les soirs, se
   fait mettre en indésirable en une semaine — et emporte avec lui les
   autres emails du domaine, lien de connexion compris. On a déjà vu
   ce que coûte un domaine qui n'écrit plus (JON-36).

   Seconde règle : **la confidentialité vaut aussi par email.** Un
   événement `is_private` s'écrit « Untel occupé », jamais son titre
   (§19). Un email sort du navigateur et reste lisible pour toujours
   dans une boîte : c'est le seul endroit du système où une fuite est
   définitive.
   ═══════════════════════════════════════════════════════════════ */

/* Ce qu'on a le droit d'écrire du titre d'un événement. La règle vit
   dans `lib/calendar/visible.ts` : Casa AI répond sous la même (§35),
   et deux copies d'une même règle de confidentialité finissent
   toujours par diverger — c'est celle qu'on a oubliée qui fuit. */
const titleFor = visibleTitle;

function line(event: CasaEvent, members: FamilyMember[]): string {
  const owner = members.find((m) => m.id === event.creatorId);
  const going = members.filter((m) =>
    event.participants.some((p) => p.userId === m.id && p.status !== "declined"),
  );
  const hour = event.allDay ? "toute la journée" : formatTime(event.startAt);

  return `<tr>
  <td style="padding:9px 0;border-bottom:1px solid #eae1d5;vertical-align:top;">
    <span style="display:inline-block;min-width:64px;font-size:15px;color:#6b625a;">${escape(hour)}</span>
  </td>
  <td style="padding:9px 0 9px 10px;border-bottom:1px solid #eae1d5;">
    <span style="font-size:16px;font-weight:600;color:#1f1b17;">${event.emoji ? `${event.emoji} ` : ""}${escape(titleFor(event, owner))}</span>
    ${going.length > 0 ? `<div style="margin-top:5px;">${going.map((m) => memberChip(m.firstName, m.color)).join("")}</div>` : ""}
  </td>
</tr>`;
}

export type DigestInput = {
  recipient: FamilyMember;
  members: FamilyMember[];
  /** Les événements de la fenêtre couverte par le résumé. */
  events: CasaEvent[];
  /** Instant de référence, calculé une fois pour tout le cron. */
  now: number;
  appUrl: string;
  unsubscribe: UnsubscribeLinks;
};

/**
 * Le point du soir : ce qui attend la maison **demain**, et les
 * créneaux où tout le monde est libre.
 *
 * Renvoie `null` — sans rien envoyer — quand la journée de demain est
 * vide et qu'aucun créneau ne vaut d'être signalé.
 */
export async function sendDailyDigest({
  recipient,
  members,
  events,
  now,
  appUrl,
  unsubscribe,
}: DigestInput) {
  const tomorrow = addDays(casaStartOfDay(now), 1).getTime();
  const tomorrowEvents = events
    .filter((e) => isSameCasaDay(e.startAt, tomorrow) || (e.allDay && overlapsDay(e, tomorrow)))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  const slots = findCommonSlots({
    userIds: members.map((m) => m.id),
    events,
    range: { start: tomorrow, end: addDays(casaStartOfDay(now), 4).getTime() },
    durationMinutes: 120,
    limit: 2,
  });

  // Rien demain, rien à proposer : on se tait. C'est la règle qui
  // protège tous les autres emails du domaine.
  if (tomorrowEvents.length === 0 && slots.length === 0) return null;

  const agenda =
    tomorrowEvents.length > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 6px;">${tomorrowEvents
          .map((e) => line(e, members))
          .join("")}</table>`
      : `<p style="margin:14px 0;padding:14px 16px;background:#ffffff;border:1px dashed #eae1d5;border-radius:12px;font-size:16px;color:#6b625a;">Rien de prévu demain. Soit une journée extrêmement calme, soit quelqu’un a oublié de remplir son agenda.</p>`;

  const opportunites =
    slots.length > 0
      ? `<p style="margin:22px 0 6px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${MEMBER_HEX.ochre};">Tout le monde est libre</p>
${slots
  .map(
    (s) =>
      `<p style="margin:0 0 6px;font-size:16px;color:#1f1b17;">${escape(formatDayLong(s.start))} · ${formatTime(s.start)} → ${formatTime(s.end)} <span style="color:#9a8f83;">(${formatDuration((s.end - s.start) / 60_000)})</span></p>`,
  )
  .join("")}
<div style="margin-top:16px;">${button("Trouver un moment", `${appUrl}/casa/trouver`)}</div>`
      : `<div style="margin-top:18px;">${button("Voir la journée", `${appUrl}/aujourdhui`)}</div>`;

  const text = [
    `Demain chez Casa Liva — ${formatDayLong(tomorrow)}`,
    "",
    ...tomorrowEvents.map((e) => {
      const owner = members.find((m) => m.id === e.creatorId);
      const hour = e.allDay ? "toute la journée" : formatTime(e.startAt);
      return `${hour}  ${titleFor(e, owner)}`;
    }),
    tomorrowEvents.length === 0 ? "Rien de prévu." : "",
    "",
    ...slots.map(
      (s) => `Tout le monde est libre ${formatDayLong(s.start)} ${formatTime(s.start)} → ${formatTime(s.end)}`,
    ),
    "",
    `${appUrl}/aujourdhui`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return sendMail({
    to: recipient.email,
    subject: `Demain chez Casa Liva — ${formatDayLong(tomorrow).toLowerCase()}`,
    html: layout({
      heading: `Demain, ${formatDayLong(tomorrow).toLowerCase()}`,
      body: agenda + opportunites,
      appUrl,
      unsubscribeUrl: unsubscribe.page,
    }),
    text,
    unsubscribePostUrl: unsubscribe.post,
  });
}

/** Un événement de journée entière couvre-t-il ce jour ? */
function overlapsDay(event: CasaEvent, dayStart: number): boolean {
  const end = new Date(event.endAt).getTime();
  const start = new Date(event.startAt).getTime();
  // `addDays` et non 24 heures (JON-60) : les deux dimanches de
  // changement d'heure en font 23 ou 25, et le résumé annonçait alors
  // la journée entière du lendemain avec celles du jour.
  return start < addDays(casaStartOfDay(dayStart), 1).getTime() && end > dayStart;
}

/**
 * Le point de la semaine (§41), avec le rappel d'agenda vide (§42)
 * intégré plutôt que séparé.
 *
 * **Pourquoi intégré.** Deux emails le même jour, dont un qui dit
 * « ton agenda est vide », c'est un de trop — et c'est celui-là qu'on
 * finit par ne plus ouvrir. Dans le résumé, la même phrase devient une
 * information parmi d'autres au lieu d'un reproche isolé.
 */
export async function sendWeeklyDigest({
  recipient,
  members,
  events,
  now,
  appUrl,
  unsubscribe,
}: DigestInput) {
  const from = casaStartOfDay(now).getTime();
  const to = addDays(casaStartOfDay(now), 8).getTime();

  const week = events
    .filter((e) => new Date(e.startAt).getTime() < to && new Date(e.endAt).getTime() > from)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  /* Ce que la personne n'a pas encore décidé. C'est la partie la plus
     actionnable du message : un événement en attente bloque
     l'organisation de tout le monde, pas seulement la sienne. */
  const waiting = week.filter((e) =>
    e.participants.some((p) => p.userId === recipient.id && p.status === "pending"),
  );

  const mine = week.filter((e) =>
    e.participants.some((p) => p.userId === recipient.id && p.status !== "declined"),
  );

  const slots = findCommonSlots({
    userIds: members.map((m) => m.id),
    events,
    range: { start: Math.max(now, from), end: to },
    durationMinutes: 120,
    limit: 3,
  });

  const parJour = groupByDay(mine);

  const agenda =
    mine.length > 0
      ? Object.entries(parJour)
          .map(
            ([, group]) =>
              `<p style="margin:18px 0 2px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#9a8f83;">${escape(formatDayLong(group[0].startAt))}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${group.map((e) => line(e, members)).join("")}</table>`,
          )
          .join("")
      : /* Le rappel du Sahara (§42), à sa place : au milieu d'un
           résumé, pas dans un email à lui tout seul. Le ton est
           taquin, jamais un reproche — §3. */
        `<p style="margin:14px 0;padding:16px 18px;background:#ffffff;border:1px dashed #eae1d5;border-radius:12px;font-size:16px;line-height:1.6;color:#6b625a;">Ta semaine ressemble étrangement au désert du Sahara.<br>Si tu as des plans, c’est le moment de les poser — les autres ne peuvent pas deviner.</p>`;

  const enAttente =
    waiting.length > 0
      ? `<p style="margin:26px 0 2px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${MEMBER_HEX.orange};">On attend ta réponse</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${waiting.map((e) => line(e, members)).join("")}</table>`
      : "";

  const libres =
    slots.length > 0
      ? `<p style="margin:26px 0 2px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${MEMBER_HEX.ochre};">Tout le monde est libre</p>
${slots
  .map(
    (s) =>
      `<p style="margin:0 0 6px;font-size:16px;color:#1f1b17;">${escape(formatDayLong(s.start))} · ${formatTime(s.start)} → ${formatTime(s.end)}</p>`,
  )
  .join("")}`
      : "";

  const text = [
    "La semaine chez Casa Liva",
    "",
    ...mine.map(
      (e) =>
        `${formatDayLong(e.startAt)} ${e.allDay ? "toute la journée" : formatTime(e.startAt)} — ${titleFor(e, members.find((m) => m.id === e.creatorId))}`,
    ),
    mine.length === 0 ? "Rien de prévu cette semaine." : "",
    "",
    waiting.length > 0 ? `${waiting.length} événement(s) attendent ta réponse.` : "",
    ...slots.map(
      (s) => `Tout le monde est libre ${formatDayLong(s.start)} ${formatTime(s.start)} → ${formatTime(s.end)}`,
    ),
    "",
    `${appUrl}/semaine`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return sendMail({
    to: recipient.email,
    subject: "La semaine chez Casa Liva",
    html: layout({
      heading: "La semaine qui vient",
      body:
        agenda +
        enAttente +
        libres +
        `<div style="margin-top:24px;">${button("Voir la semaine", `${appUrl}/semaine`)}${button("Trouver un moment", `${appUrl}/casa/trouver`, "secondary")}</div>`,
      appUrl,
      unsubscribeUrl: unsubscribe.page,
    }),
    text,
    unsubscribePostUrl: unsubscribe.post,
  });
}

function groupByDay(events: CasaEvent[]): Record<string, CasaEvent[]> {
  const out: Record<string, CasaEvent[]> = {};
  for (const event of events) {
    const key = formatDayLong(event.startAt);
    (out[key] ??= []).push(event);
  }
  return out;
}
