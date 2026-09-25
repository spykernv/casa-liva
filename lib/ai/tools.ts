import "server-only";
import { addDays } from "date-fns";
import type { CasaEvent, FamilyMember } from "@/types";
import type { AIToolResult, AIToolSpec } from "@/lib/ai/types";
import { getEvents, type CasaContext } from "@/lib/data/casa";
import { refusalFor } from "@/actions/events";
import { findMoments, whoIsFree, SEARCH_DAYS } from "@/lib/data/availability";
import { visibleLocation, visibleTitle } from "@/lib/calendar/visible";
import { guessEmoji } from "@/lib/calendar/emoji";
import { AGENDA_CLOSE, AGENDA_OPEN, asData } from "@/lib/ai/untrusted";
import type { ActionDraft, DraftEvent } from "@/lib/ai/drafts";
import {
  casaDate,
  casaStartOfDay,
  formatDayLong,
  formatDuration,
  formatTime,
  parseCasaDay,
} from "@/lib/date";

/* ═══════════════════════════════════════════════════════════════
   Les tools de lecture de Casa AI (§34-35).

   **La règle qui structure toute la phase.** Le LLM ne touche jamais
   la base : il choisit un tool déclaré ici, le backend valide, exécute,
   et rend le résultat.

   Et le corollaire qui la rend vraie sans effort : **tout ce fichier
   s'exécute sous la session de la personne qui pose la question.**
   `getEvents`, `findMoments` et `whoIsFree` passent par
   `createClient()`, donc sous RLS. Un tool ne peut structurellement
   pas lire ce que son appelant ne peut pas lire — la garantie ne
   dépend pas de la relecture d'un prompt.

   `createAdminClient()` n'a rien à faire ici, jamais, même « juste
   pour simplifier une requête ». `npm run verify:rls` refuse
   désormais de passer si un fichier de `lib/ai/` l'importe.

   **Deuxième règle, celle de JON-50.** Rien ne sort d'ici sans passer
   par `visibleTitle` / `visibleLocation`. Un événement masqué s'écrit
   « Untel occupé », et la description d'un événement **n'est jamais
   envoyée au modèle** : elle ne sert à rien pour organiser, elle coûte
   des tokens, et c'est la plus grosse surface de fuite du schéma.
   ═══════════════════════════════════════════════════════════════ */

export type ToolContext = {
  familyId: string;
  members: FamilyMember[];
  /** Qui pose la question — « je », « mon », « ma semaine » désignent cette personne. */
  meId: string;
  /** Instant de référence, calculé une seule fois pour toute la requête. */
  now: number;
  /**
   * La maison entière, telle que `refusalFor` l'attend.
   *
   * Redondant avec `familyId` / `members` / `meId` juste au-dessus, et
   * c'est assumé : la duplication disparaîtra le jour où l'on
   * remplacera les trois par celui-ci. Aujourd'hui, les changer casse
   * tous les tools de lecture pour un gain nul.
   */
  casa: CasaContext;
  /**
   * Range un aperçu et rend son jeton — **la seule écriture permise
   * ici, et elle n'écrit pas d'événement** (D41).
   *
   * Passée par le contexte plutôt qu'importée : c'est ce qui garde
   * `lib/ai/tools.ts` totalement dépourvu d'accès en base, et c'est
   * exactement ce que `verify:ai` contrôle. Le fichier qui *choisit*
   * une action et celui qui la *range* restent deux fichiers.
   */
  propose?: (draft: ActionDraft) => Promise<string>;
};

/** Au-delà, la réponse coûte plus qu'elle n'apprend (§71). */
const MAX_DAYS = 31;
const MAX_EVENTS = 60;
const MAX_MATCHES = 20;

/* ── Lecture des entrées ─────────────────────────────────────────
   Tout ce qui arrive ici a été écrit par un modèle. Il produit du
   plausible, pas du vrai : une date qui n'existe pas, un prénom
   approché, une durée fantaisiste. Chaque entrée est donc relue, et
   un refus explicite vaut mieux qu'une réponse fausse — le modèle sait
   se corriger quand on lui dit ce qui n'allait pas.
   ─────────────────────────────────────────────────────────────── */

function field(input: unknown, key: string): unknown {
  return typeof input === "object" && input !== null
    ? (input as Record<string, unknown>)[key]
    : undefined;
}

function text(input: unknown, key: string): string | undefined {
  const value = field(input, key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** « Éloïse » et « eloise » désignent la même personne. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Un refus **écrit pour le modèle**, pas pour la personne.
 *
 * `runTool` le transforme en résultat marqué en erreur : le modèle le
 * lit, se corrige, et rappelle le tool. Exporté depuis JON-63 parce que
 * `propose` peut refuser lui aussi — et un refus qui arriverait sous
 * une autre forme deviendrait « ce tool est tombé en panne », c'est-à-
 * dire un message que le modèle ne sait pas quoi faire de.
 */
export class ToolError extends Error {
  /* Le `name` n'est pas décoratif : `runTool` reconnaît un refus par
     lui **en plus** de l'`instanceof`. Deux copies d'un même module —
     un bundle serveur et un bundle de route, un banc de test qui le
     recharge — donnent deux classes distinctes, et l'`instanceof`
     répond alors « non » sur un objet qui est pourtant bien un refus.
     La conséquence serait invisible et coûteuse : le modèle recevrait
     « ce tool est tombé en panne » au lieu de « il manque le prénom »,
     donc il abandonnerait au lieu de se corriger. Vu sur le banc. */
  readonly name = "ToolError";
}

/**
 * Les personnes visées, par prénom.
 *
 * **Des prénoms, pas des identifiants**, et c'est délibéré : un modèle
 * écrit « Sophie » de façon fiable et un UUID de façon approximative.
 * Les identifiants ne quittent donc jamais le serveur — ils n'entrent
 * pas dans le contexte, ils n'en sortent pas.
 *
 * Absent veut dire « toute la maison ». C'est la même convention que
 * `/casa/trouver` (le `qui` absent de la phase 5), et pour la même
 * raison : la question par défaut porte sur la maison, pas sur soi.
 */
function resolvePeople(input: unknown, ctx: ToolContext): FamilyMember[] {
  const raw = field(input, "people");
  if (raw === undefined || raw === null) return ctx.members;

  const names = (Array.isArray(raw) ? raw : [raw]).filter(
    (n): n is string => typeof n === "string" && n.trim() !== "",
  );
  if (names.length === 0) return ctx.members;

  const found: FamilyMember[] = [];
  for (const name of names) {
    const needle = fold(name);
    const matches = ctx.members.filter(
      (m) => fold(m.firstName) === needle || fold(m.firstName).startsWith(needle),
    );

    if (matches.length === 0) {
      throw new ToolError(
        `Personne ne s'appelle « ${name} » dans cette maison. Les habitants sont : ${ctx.members
          .map((m) => m.firstName)
          .join(", ")}.`,
      );
    }
    if (matches.length > 1) {
      throw new ToolError(
        `« ${name} » peut désigner ${matches.map((m) => m.firstName).join(" ou ")}. Demande à la personne de préciser.`,
      );
    }
    if (!found.some((m) => m.id === matches[0].id)) found.push(matches[0]);
  }
  return found;
}

function resolveDay(input: unknown, key: string, ctx: ToolContext): number {
  const raw = text(input, key);
  const day = parseCasaDay(raw, ctx.now);
  if (day === null) {
    throw new ToolError(
      `« ${raw ?? "(vide)"} » n'est pas une date lisible pour \`${key}\`. Écris-la au format AAAA-MM-JJ.`,
    );
  }
  return day;
}

/**
 * Les personnes visées, **quand ne rien dire n'est pas une réponse**.
 *
 * `resolvePeople` rend toute la maison quand l'argument manque. Bon
 * défaut pour « qui est libre samedi ? » — la question porte sur la
 * maison. Désastreux pour une création : la famille entière conviée,
 * et autant d'emails partis, parce que personne n'a précisé. C'est le
 * seul endroit du code où **l'absence produit l'effet le plus large**,
 * et c'est exactement là qu'il ne faut pas de défaut.
 *
 * On refuse donc, avec un message qui dit au modèle de **demander**
 * plutôt que de choisir.
 */
function requirePeople(input: unknown, ctx: ToolContext): FamilyMember[] {
  const raw = field(input, "people");
  const names = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).filter(
    (n): n is string => typeof n === "string" && n.trim() !== "",
  );

  if (names.length === 0) {
    throw new ToolError(
      `Il manque \`people\` : dis avec qui. N'invente pas la liste et ne mets pas toute la maison par défaut — demande à la personne, en une phrase. Les habitants sont : ${ctx.members
        .map((m) => m.firstName)
        .join(", ")}.`,
    );
  }

  return resolvePeople({ people: names }, ctx);
}

/** Au-delà, ce n'est plus un agenda familial, c'est une capsule temporelle. */
const MAX_AHEAD_DAYS = 365;

/**
 * Un jour où l'on a le droit d'**écrire**.
 *
 * `parseCasaDay` ne valide que la forme `AAAA-MM-JJ`, jamais l'année :
 * `2025-08-09` passe sans un mot. En lecture, ça rend « rien de prévu »
 * et personne n'est trompé. En écriture, ça pose un golf **un an dans
 * le passé** — invisible dans toutes les vues, introuvable, et
 * pourtant bien là. Le modèle se trompe d'année plus souvent qu'on ne
 * croit : il n'a aucune idée de la date, sauf celle qu'on lui écrit.
 *
 * Le passé est refusé **au jour près, pas à l'heure près** : « ajoute
 * le déjeuner de ce midi » à 14 h reste une demande légitime, et
 * quelqu'un qui range son agenda après coup ne mérite pas un refus.
 */
function resolveWritableDay(input: unknown, key: string, ctx: ToolContext): number {
  const day = resolveDay(input, key, ctx);
  const today = casaStartOfDay(ctx.now).getTime();
  const horizon = addDays(casaStartOfDay(ctx.now), MAX_AHEAD_DAYS).getTime();

  if (day < today) {
    throw new ToolError(
      `${formatDayLong(day)} est déjà passé — on ne crée pas un événement en arrière. Vérifie l'année : nous sommes en ${casaDate(ctx.now).getFullYear()}.`,
    );
  }
  if (day > horizon) {
    throw new ToolError(
      `${formatDayLong(day)} est à plus d'un an. Vérifie l'année : nous sommes en ${casaDate(ctx.now).getFullYear()}.`,
    );
  }
  return day;
}

/** `14:30` — ce que le modèle écrit le plus naturellement, et sans fuseau à deviner. */
function resolveTime(input: unknown, key: string, required: boolean): number | null {
  const raw = text(input, key);
  if (!raw) {
    if (!required) return null;
    throw new ToolError(`Il manque \`${key}\` : donne une heure au format HH:MM.`);
  }

  const match = /^(\d{1,2})[:h](\d{2})$/.exec(raw);
  const hours = match ? Number(match[1]) : NaN;
  const minutes = match ? Number(match[2]) : NaN;
  if (!match || hours > 23 || minutes > 59) {
    throw new ToolError(`« ${raw} » n'est pas une heure lisible pour \`${key}\`. Écris-la au format HH:MM.`);
  }
  return hours * 60 + minutes;
}

/* ── Mise en mots ────────────────────────────────────────────────
   Du texte, pas du JSON. Le modèle lit mieux une ligne d'agenda qu'un
   objet, ça coûte moins de tokens, et surtout ça ne l'encourage pas à
   recracher une structure là où on attend une phrase.
   ─────────────────────────────────────────────────────────────── */

function owner(event: CasaEvent, ctx: ToolContext): FamilyMember | undefined {
  return ctx.members.find((m) => m.id === event.creatorId);
}

/** Qui participe réellement — un « pas dispo » ne compte pas. */
function attendees(event: CasaEvent, ctx: ToolContext): FamilyMember[] {
  return ctx.members.filter((m) =>
    event.participants.some((p) => p.userId === m.id && p.status !== "declined"),
  );
}

function line(event: CasaEvent, ctx: ToolContext): string {
  const when = event.allDay
    ? "toute la journée"
    : `${formatTime(event.startAt)}–${formatTime(event.endAt)}`;

  const who = attendees(event, ctx).map((m) => m.firstName);
  const where = visibleLocation(event);

  /* `asData` en plus de `visibleTitle`, et les deux sont nécessaires :
     l'un décide de **ce qui peut être dit**, l'autre empêche ce qui est
     dit de **se faire passer pour une consigne** (D42). Un titre venu
     d'un agenda Google est écrit par n'importe qui capable d'envoyer
     une invitation à une adresse Gmail. */
  return [
    `  ${when} · ${asData(visibleTitle(event, owner(event, ctx)))}`,
    who.length > 0 ? ` (${who.join(", ")})` : "",
    where ? ` — ${asData(where)}` : "",
    event.busy === false ? " [n'occupe pas]" : "",
  ].join("");
}

/**
 * Ce qui vient de l'agenda, borné et annoncé comme tel.
 *
 * Les résultats de tool reviennent déjà dans des blocs à part chez les
 * deux fournisseurs — c'est une frontière structurelle, pas seulement
 * typographique. Les bornes s'y ajoutent quand même : elles portent la
 * **même** promesse que dans le prompt système, et une règle qui
 * s'applique partout se retient, alors qu'une règle à exceptions se
 * contourne le jour où on ne sait plus laquelle est laquelle.
 */
function fenced(body: string): string {
  return `${AGENDA_OPEN}\n${body}\n${AGENDA_CLOSE}`;
}

/** Les événements groupés par jour, jours vides compris — « rien ce jour-là » est une réponse. */
function agenda(events: CasaEvent[], from: number, to: number, ctx: ToolContext): string {
  const days: string[] = [];
  let shown = 0;

  for (let day = from; day < to; day = addDays(casaStartOfDay(day), 1).getTime()) {
    const next = addDays(casaStartOfDay(day), 1).getTime();
    const ofDay = events
      .filter(
        (e) =>
          new Date(e.startAt).getTime() < next && new Date(e.endAt).getTime() > day,
      )
      .sort((a, b) => a.startAt.localeCompare(b.startAt));

    if (ofDay.length === 0) {
      days.push(`${formatDayLong(day)} : rien de prévu`);
      continue;
    }

    const kept = ofDay.slice(0, Math.max(0, MAX_EVENTS - shown));
    shown += kept.length;
    days.push(
      [
        formatDayLong(day),
        ...kept.map((e) => line(e, ctx)),
        kept.length < ofDay.length ? `  … et ${ofDay.length - kept.length} autres` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return days.join("\n");
}

/* ── Les tools ───────────────────────────────────────────────────
   Les descriptions disent **quand appeler**, pas seulement ce que le
   tool fait : c'est la description qui décide du déclenchement, et un
   modèle qui n'appelle pas répond de mémoire — c'est-à-dire faux.
   ─────────────────────────────────────────────────────────────── */

export const TOOLS: AIToolSpec[] = [
  {
    name: "get_schedule",
    description:
      "Lit l'agenda de la maison entre deux dates. À appeler dès qu'une question porte sur ce qui est prévu — « que fait Papa demain ? », « résume ma semaine », « on a quelque chose samedi ? ». Ne réponds jamais de mémoire sur un agenda : appelle ce tool.",
    input: {
      type: "object",
      properties: {
        from: { type: "string", description: "Premier jour inclus, au format AAAA-MM-JJ." },
        to: { type: "string", description: "Dernier jour inclus, au format AAAA-MM-JJ. 31 jours au maximum." },
        people: {
          type: "array",
          items: { type: "string" },
          description:
            "Prénoms des personnes concernées. Omets-le pour toute la maison.",
        },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "who_is_free",
    description:
      "Dit qui est libre un jour donné, ce qui occupe les autres, et les plages où tout le monde est libre. À appeler pour « qui est libre samedi ? » ou « est-ce que Maman peut samedi après-midi ? ».",
    input: {
      type: "object",
      properties: {
        day: { type: "string", description: "Le jour, au format AAAA-MM-JJ." },
      },
      required: ["day"],
    },
  },
  {
    name: "find_moments",
    description:
      "Cherche les meilleurs créneaux où tout le monde est libre sur les deux prochaines semaines. À appeler pour « quand peut-on faire un golf ensemble ? » ou « trouve un moment pour un apéro ». Ne propose jamais un créneau sans avoir appelé ce tool.",
    input: {
      type: "object",
      properties: {
        duration_minutes: {
          type: "number",
          description: "Durée souhaitée en minutes (60, 120 ou 180). 120 par défaut.",
        },
        people: {
          type: "array",
          items: { type: "string" },
          description: "Prénoms des participants. Omets-le pour toute la maison.",
        },
      },
      required: [],
    },
  },
  {
    name: "search_events",
    description:
      "Retrouve un événement par son nom sur l'année qui vient. À appeler pour « c'est quand le prochain golf ? » ou « on avait prévu quoi avec Mamie ? ».",
    input: {
      type: "object",
      properties: {
        query: { type: "string", description: "Un mot ou deux du titre cherché." },
      },
      required: ["query"],
    },
  },
  {
    name: "create_event",
    description:
      "Prépare un aperçu d'événement et l'affiche à la personne, qui valide elle-même. À appeler dès qu'on demande d'ajouter, de créer, de caler ou d'organiser quelque chose. **Ce tool n'enregistre rien** : il montre ce que ça donnerait. Après l'avoir appelé, ne dis jamais que c'est créé — dis que l'aperçu est à l'écran. Si tu ne sais pas avec qui, demande-le avant d'appeler.",
    input: {
      type: "object",
      properties: {
        title: { type: "string", description: "Ce qu'on fait : « Golf », « Apéro », « Déjeuner chez Mamie »." },
        day: { type: "string", description: "Le jour, au format AAAA-MM-JJ. Ni dans le passé, ni à plus d'un an." },
        start_time: { type: "string", description: "Heure de début, au format HH:MM." },
        end_time: {
          type: "string",
          description:
            "Heure de fin, au format HH:MM. Omets-la pour deux heures. Plus petite que le début = ça finit le lendemain.",
        },
        people: {
          type: "array",
          items: { type: "string" },
          description:
            "Prénoms des participants. **Obligatoire** : ne le devine pas, et ne mets pas toute la maison par défaut. Si on ne l'a pas dit, demande.",
        },
        location: { type: "string", description: "Où, si on l'a dit. Du texte libre." },
        emoji: { type: "string", description: "Un seul émoji, si un évident s'impose. Sinon omets-le." },
      },
      required: ["title", "day", "start_time", "people"],
    },
  },
  {
    name: "modify_event",
    description:
      "Prépare un aperçu de **modification** d'un événement qui existe déjà : le déplacer, le renommer, changer le lieu, ou changer qui est invité. À appeler pour « décale le golf de samedi à 14h » ou « ajoute Mamie au déjeuner de dimanche ». **N'enregistre rien** : la personne valide. Ne dis jamais que c'est déplacé ou modifié. Omets ce que la personne n'a pas dit — ce qui n'est pas donné ne bouge pas.",
    input: {
      type: "object",
      properties: {
        event: { type: "string", description: "Un mot ou deux du titre de l'événement visé." },
        day: {
          type: "string",
          description:
            "Le jour, au format AAAA-MM-JJ. Sert **à la fois** à retrouver l'événement et à le déplacer. Omets-le pour ne pas changer le jour.",
        },
        start_time: { type: "string", description: "Nouvelle heure de début, HH:MM. Omets-la pour ne pas la changer." },
        end_time: { type: "string", description: "Nouvelle heure de fin, HH:MM. Omise, la durée actuelle est conservée." },
        title: { type: "string", description: "Nouveau titre, si on le renomme." },
        location: { type: "string", description: "Nouveau lieu, si on le change." },
        people: {
          type: "array",
          items: { type: "string" },
          description:
            "**Remplace** la liste des participants. Ne le donne que si on te demande de changer qui vient — omis, les invités actuels ne bougent pas.",
        },
      },
      required: ["event"],
    },
  },
  {
    name: "delete_event",
    description:
      "Prépare un aperçu de **suppression**. À appeler pour « supprime le dîner de dimanche » ou « annule le golf ». **N'enregistre rien** : la personne valide, et l'aperçu lui montre l'événement en entier. Ne dis jamais que c'est supprimé.",
    input: {
      type: "object",
      properties: {
        event: { type: "string", description: "Un mot ou deux du titre de l'événement visé." },
        day: {
          type: "string",
          description:
            "Le jour, au format AAAA-MM-JJ, quand il est dit. Il réduit beaucoup l'ambiguïté — donne-le dès que tu l'as.",
        },
      },
      required: ["event"],
    },
  },
];

export const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

/* ── Exécution ───────────────────────────────────────────────── */

async function getSchedule(input: unknown, ctx: ToolContext): Promise<string> {
  const from = resolveDay(input, "from", ctx);
  const asked = resolveDay(input, "to", ctx);
  const people = resolvePeople(input, ctx);

  if (asked < from) throw new ToolError("`to` tombe avant `from`.");

  // La borne haute est **exclusive** en interne (minuit du lendemain),
  // mais le modèle écrit « du 3 au 9 » en pensant le 9 inclus. On
  // ajoute donc le jour ici plutôt que d'espérer qu'il le fasse.
  const to = addDays(casaStartOfDay(asked), 1).getTime();
  const days = Math.round((to - from) / 86_400_000);
  if (days > MAX_DAYS) {
    throw new ToolError(
      `${days} jours d'un coup, c'est trop : demande ${MAX_DAYS} jours au maximum, quitte à rappeler ce tool.`,
    );
  }

  const all = await getEvents(ctx.familyId, from, to);
  const ids = new Set(people.map((m) => m.id));
  const events =
    people.length === ctx.members.length
      ? all
      : all.filter((e) =>
          e.participants.some((p) => ids.has(p.userId) && p.status !== "declined"),
        );

  const scope =
    people.length === ctx.members.length
      ? "toute la maison"
      : people.map((m) => m.firstName).join(", ");

  return `Agenda (${scope}) :\n${fenced(agenda(events, from, to, ctx))}`;
}

async function whoIsFreeTool(input: unknown, ctx: ToolContext): Promise<string> {
  const day = resolveDay(input, "day", ctx);

  /* Toute la maison, toujours. La question est « qui est libre », pas
     « est-ce que ceux que j'ai listés le sont » : filtrer d'avance
     reviendrait à répondre avant d'avoir demandé. C'est le même choix
     que l'écran de la phase 5. */
  const availability = await whoIsFree({
    familyId: ctx.familyId,
    userIds: ctx.members.map((m) => m.id),
    day,
  });

  const people = availability.people.map((person) => {
    const member = ctx.members.find((m) => m.id === person.userId);
    const name = member?.firstName ?? "Quelqu’un";
    if (person.freeAllDay) return `- ${name} : libre toute la journée`;

    const busy = person.busy
      .map(
        (o) =>
          `${formatTime(o.interval.start)}–${formatTime(o.interval.end)} ${asData(visibleTitle(o.event, owner(o.event, ctx)))}`,
      )
      .join(", ");
    const free =
      person.free.length > 0
        ? person.free
            .map((i) => `${formatTime(i.start)}–${formatTime(i.end)}`)
            .join(", ")
        : "rien";

    return `- ${name} : occupé ${busy} · libre ${free}`;
  });

  const common =
    availability.common.length > 0
      ? availability.common
          .map((b) => `${formatTime(b.start)}–${formatTime(b.end)}`)
          .join(", ")
      : "aucune plage d'au moins une heure";

  return [
    `${formatDayLong(day)} (fenêtre 8h–22h) :`,
    fenced(people.join("\n")),
    `Tout le monde libre en même temps : ${common}.`,
  ].join("\n");
}

async function findMomentsTool(input: unknown, ctx: ToolContext): Promise<string> {
  const asked = field(input, "duration_minutes");
  const durationMinutes =
    typeof asked === "number" && asked >= 30 && asked <= 480 ? Math.round(asked) : 120;
  const people = resolvePeople(input, ctx);

  const slots = await findMoments({
    familyId: ctx.familyId,
    // Celui qui demande fait toujours partie du créneau : c'est lui
    // qui organise, et `createEvent` le remettra de toute façon.
    userIds: Array.from(new Set([ctx.meId, ...people.map((m) => m.id)])),
    durationMinutes,
    now: ctx.now,
  });

  const who = people.map((m) => m.firstName).join(", ");

  if (slots.length === 0) {
    return `Aucun créneau de ${formatDuration(durationMinutes)} où ${who} soient libres ensemble sur ${SEARCH_DAYS} jours. Propose de raccourcir, ou de retirer quelqu'un.`;
  }

  return [
    `Créneaux de ${formatDuration(durationMinutes)} où ${who} sont libres (les meilleurs d'abord) :`,
    ...slots.map(
      (s) => `- ${formatDayLong(s.start)} ${formatTime(s.start)}–${formatTime(s.end)}`,
    ),
  ].join("\n");
}

async function searchEvents(input: unknown, ctx: ToolContext): Promise<string> {
  const query = text(input, "query");
  if (!query) throw new ToolError("`query` est vide : dis quoi chercher.");

  const from = casaStartOfDay(ctx.now).getTime();
  const to = addDays(casaStartOfDay(ctx.now), 365).getTime();
  const events = await getEvents(ctx.familyId, from, to);

  const needle = fold(query);

  /* Les événements masqués ne sont **jamais** comparés à la recherche.
     Leur titre en base est déjà « Occupé » (D13), donc il n'y a rien à
     lire — mais la comparaison elle-même serait une fuite par
     déduction le jour où un titre masqué existerait autrement :
     chercher « cardiologue » et voir revenir « Mamie occupée » répond
     à la question qu'on voulait justement ne pas laisser poser. */
  const found = events
    .filter((e) => !e.isPrivate && fold(visibleTitle(e)).includes(needle))
    .slice(0, MAX_MATCHES);

  if (found.length === 0) {
    return `Rien qui ressemble à « ${query} » dans les douze mois qui viennent.`;
  }

  return [
    `Trouvé pour « ${query} » :`,
    fenced(
      found
        .map(
          (e) =>
            `- ${formatDayLong(e.startAt)} ${e.allDay ? "toute la journée" : formatTime(e.startAt)} · ${asData(visibleTitle(e, owner(e, ctx)))} (${attendees(
              e,
              ctx,
            )
              .map((m) => m.firstName)
              .join(", ")})`,
        )
        .join("\n"),
    ),
  ].join("\n");
}

/* ── L'écriture, et le contrat qui la rend sûre ──────────────────
   **Un tool d'écriture ne s'exécute pas — il propose** (D41).

   Ce n'est pas de la prudence : `runTool` tourne au moment où le
   modèle appelle le tool, et `lib/ai/chat.ts` retire les outils au
   dernier de ses trois tours pour forcer une conclusion en prose. Un
   `create_event` branché comme les autres créerait donc l'événement
   avant que personne n'ait rien vu — et si le modèle décidait ensuite
   d'écrire « c'est fait ! » sans l'avoir appelé, rien dans `askCasaAI`
   ne comparerait le texte final aux tools qui ont réellement tourné.
   La personne l'apprendrait samedi, quand personne ne vient.

   Le même choix règle trois problèmes d'un coup : la double exécution
   (c'est le jeton), l'injection par un titre d'agenda (au pire un
   aperçu absurde qu'on refuse d'un tap), et le budget des quinze
   secondes (aucun appel de modèle supplémentaire pour confirmer).
   ─────────────────────────────────────────────────────────────── */

/** Deux heures : la durée d'un golf, d'un déjeuner de famille, d'un ciné. */
const DEFAULT_DURATION_MIN = 120;

/** Un titre plus long que ça n'a jamais aidé personne à lire sa grille. */
const MAX_TITLE = 80;
const MAX_LOCATION = 120;

/**
 * Recompose un instant depuis un jour et des minutes, **dans le fuseau
 * de la maison**, et le rend en millisecondes.
 *
 * Des millisecondes et pas la `TZDate` elle-même : son `toISOString()`
 * rend la forme décalée (`…T10:00:00.000+02:00`) là où un `Date`
 * ordinaire rend la forme UTC. Les deux désignent le même instant et la
 * base les range pareil — mais un brouillon dont le début et la fin
 * s'écrivent dans deux formats différents se relit mal, et se compare
 * encore plus mal. Vu sur le banc, pas en relisant.
 */
function at(day: number, minutes: number): number {
  const d = casaStartOfDay(day);
  d.setHours(0, minutes, 0, 0);
  return d.getTime();
}

async function proposeEvent(input: unknown, ctx: ToolContext): Promise<string> {
  if (!ctx.propose) {
    // Le tour de lecture d'un briefing, par exemple : aucun aperçu ne
    // peut y aboutir, et le dire vaut mieux que ranger un brouillon
    // que personne n'ira chercher.
    throw new ToolError("Impossible de préparer un aperçu ici.");
  }

  const title = text(input, "title");
  if (!title) throw new ToolError("Il manque `title` : dis ce qu'on fait.");
  if (title.length > MAX_TITLE) {
    throw new ToolError(`\`title\` est trop long (${MAX_TITLE} caractères au maximum).`);
  }

  const day = resolveWritableDay(input, "day", ctx);
  const startMin = resolveTime(input, "start_time", true)!;
  const endMin = resolveTime(input, "end_time", false);

  const start = at(day, startMin);

  /* Une fin antérieure au début veut dire « ça déborde sur le
     lendemain » — c'est ce que « de 22h à 2h » signifie pour tout le
     monde. On le traite plutôt que de le refuser : une soirée est
     exactement le genre d'événement qu'on crée à la voix.

     Le risque assumé, c'est la faute de frappe : « de 14h à 10h »
     donne vingt heures. L'aperçu l'affiche en toutes lettres, avec le
     jour de fin — c'est précisément le rôle qu'on lui donne, et le
     pire résultat acceptable est un aperçu absurde qu'on refuse d'un
     tap. */
  const end =
    endMin === null
      ? start + DEFAULT_DURATION_MIN * 60_000
      : at(endMin <= startMin ? addDays(casaStartOfDay(day), 1).getTime() : day, endMin);

  const people = requirePeople(input, ctx);
  const location = text(input, "location");
  if (location && location.length > MAX_LOCATION) {
    throw new ToolError(`\`location\` est trop long (${MAX_LOCATION} caractères au maximum).`);
  }

  /* L'émoji deviné plutôt que demandé au modèle : `guessEmoji` est
     local, déterministe et gratuit (phase 5), et un « ⛳ Golf » se
     repère dans la grille bien plus vite qu'un « Golf ». Le modèle
     peut en proposer un, il ne prime pas sur rien — il complète. */
  const emoji = text(input, "emoji") ?? guessEmoji(title);

  await ctx.propose({
    kind: "create_event",
    event: {
      title,
      emoji,
      location,
      startAt: new Date(start).toISOString(),
      endAt: new Date(end).toISOString(),
      /* Celui qui demande est toujours de la partie : `createEvent`
         l'ajouterait de toute façon, et un aperçu qui ne le montre pas
         mentirait sur ce qui va être écrit. */
      participantIds: Array.from(new Set([ctx.meId, ...people.map((m) => m.id)])),
    },
  });

  const who = ctx.members
    .filter((m) => m.id === ctx.meId || people.some((p) => p.id === m.id))
    .map((m) => m.firstName)
    .join(", ");

  return [
    `Aperçu prêt et affiché à l'écran : ${emoji ? `${emoji} ` : ""}« ${title} », ${formatDayLong(start)} de ${formatTime(start)} à ${formatTime(end)}, avec ${who}.`,
    "**Rien n'est enregistré.** La personne valide elle-même d'un tap, ou corrige les champs.",
    "Dis-lui simplement que c'est prêt à côté — une phrase. Ne dis pas que c'est créé, ajouté ou noté.",
  ].join("\n");
}

/* ── Viser un événement qui existe déjà ──────────────────────────
   La partie de JON-66 qui n'a pas d'équivalent en création : il faut
   **retrouver** ce dont on parle, et refuser avant d'afficher quoi que
   ce soit.
   ─────────────────────────────────────────────────────────────── */

/** L'événement visé, et combien d'autres lui ressemblaient. */
type Cible = { event: CasaEvent; candidats: number };

/**
 * Retrouve l'événement dont on parle, et **refuse avant d'afficher**.
 *
 * L'ordre est la moitié du travail. Composer l'aperçu puis découvrir au
 * moment de valider qu'on n'avait pas le droit, c'est proposer de
 * déplacer le golf de Sophie, faire valider, et échouer : promettre
 * puis échouer est exactement ce que D13 interdit. `refusalFor` est
 * donc consulté **ici**, avant que le brouillon n'existe.
 *
 * Et le compte des candidats n'est pas décoratif. « Supprime le
 * déjeuner de dimanche » dans une maison qui déjeune tous les
 * dimanches n'a pas une réponse, elle en a cinquante-deux — l'aperçu
 * doit montrer que le serveur a **choisi**, et lequel.
 */
async function resolveTarget(input: unknown, ctx: ToolContext): Promise<Cible> {
  const query = text(input, "event");
  if (!query) {
    throw new ToolError("Il manque `event` : dis de quel événement il s'agit, en un mot ou deux.");
  }

  const from = casaStartOfDay(ctx.now).getTime();
  const to = addDays(casaStartOfDay(ctx.now), MAX_AHEAD_DAYS).getTime();
  const all = await getEvents(ctx.familyId, from, to);
  const needle = fold(query);

  /* Les événements masqués ne sont jamais comparés — même raison que
     dans `search_events` : chercher « cardiologue » et voir revenir
     « Mamie occupée » répond à la question qu'on voulait justement ne
     pas laisser poser. Les événements Google, eux, restent visibles :
     on veut pouvoir répondre « ça se modifie chez Google » plutôt que
     « je ne trouve pas », qui enverrait chercher au mauvais endroit. */
  let found = all
    .filter((e) => !e.isPrivate && fold(visibleTitle(e)).includes(needle))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

  // Le jour, quand il est dit, réduit avant de choisir — c'est
  // exactement ce que « le déjeuner **de dimanche** » veut dire.
  const dayRaw = text(input, "day");
  if (dayRaw) {
    const day = resolveDay(input, "day", ctx);
    const next = addDays(casaStartOfDay(day), 1).getTime();
    const sameDay = found.filter(
      (e) =>
        new Date(e.startAt).getTime() < next && new Date(e.endAt).getTime() > day,
    );
    // Un jour qui ne donne rien n'écrase pas la recherche : on le dit,
    // plutôt que de proposer silencieusement un autre jour.
    if (sameDay.length === 0) {
      throw new ToolError(
        `Rien qui ressemble à « ${query} » le ${formatDayLong(day)}. Vérifie le jour, ou n'en donne pas.`,
      );
    }
    found = sameDay;
  }

  if (found.length === 0) {
    throw new ToolError(
      `Rien qui ressemble à « ${query} » dans les douze mois qui viennent.`,
    );
  }

  const event = found[0];

  const refusal = await refusalFor(event.id, ctx.casa, { ownerOnly: true });
  if (refusal) {
    /* Le message part **tel quel**, sans consigne accolée du genre
       « dis-le simplement ». Ces messages sont déjà écrits pour être
       lus par quelqu'un — « Cet événement est à Sophie », « Il se
       modifie là-bas » — et ils remontent jusqu'à l'écran quand le
       modèle les relaie mal (`AskResult.refusal`). Une consigne collée
       au bout s'y afficherait aussi, et on lirait Casa AI se parler à
       elle-même. */
    throw new ToolError(refusal);
  }

  return { event, candidats: found.length };
}

/**
 * L'événement en base, dans la forme que l'aperçu affiche.
 *
 * **`visibleTitle` et pas `event.title`**, alors même que
 * `resolveTarget` a déjà écarté les événements masqués. Deux raisons,
 * et la seconde est la vraie : le filtre pourrait changer un jour sans
 * que personne ne pense à ce chemin-ci, et un titre masqué remonterait
 * alors jusqu'à l'écran — par un aperçu, c'est-à-dire l'endroit le plus
 * lu de toute la phase. Attrapé par `verify:ai`, pas en relisant.
 *
 * **Pas d'`asData` ici, en revanche**, et c'est important : ce titre
 * repart en base sur une modification. `asData` borne ce qui entre
 * dans un *prompt* ; l'appliquer à ce qui entre dans une *table*
 * réécrirait silencieusement le titre de quelqu'un — un « <3 » devenu
 * « ‹3 » parce qu'on a déplacé l'événement d'une heure.
 */
function asDraftEvent(event: CasaEvent): DraftEvent {
  return {
    title: visibleTitle(event),
    emoji: event.emoji,
    location: visibleLocation(event),
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
    participantIds: event.participants.map((p) => p.userId),
    // Les réponses **avec** l'événement : sur une suppression, ce sont
    // elles qu'on efface, et « n'a pas répondu » affiché pour quelqu'un
    // qui avait dit « je viens » ferait signer sur une information
    // fausse.
    participants: event.participants.map((p) => ({
      userId: p.userId,
      status: p.status,
    })),
  };
}

async function proposeModify(input: unknown, ctx: ToolContext): Promise<string> {
  if (!ctx.propose) throw new ToolError("Impossible de préparer un aperçu ici.");

  const { event, candidats } = await resolveTarget(input, ctx);
  const avant = asDraftEvent(event);

  const nouveauTitre = text(input, "title");
  const lieu = text(input, "location");

  /* Le jour et les heures se recalculent **ensemble**, à partir de ce
     qui existe : « décale à 14h » ne dit rien du jour, et « déplace à
     samedi » ne dit rien de l'heure. Prendre un défaut pour l'un des
     deux déplacerait l'autre sans qu'on l'ait demandé. */
  const dureeMin =
    (new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60_000;

  const jour = text(input, "day")
    ? resolveWritableDay(input, "day", ctx)
    : casaStartOfDay(event.startAt).getTime();

  const debutMin = resolveTime(input, "start_time", false);
  const finMin = resolveTime(input, "end_time", false);

  const ancienDebut = casaDate(event.startAt);
  const minutesDuJour =
    debutMin ?? ancienDebut.getHours() * 60 + ancienDebut.getMinutes();

  const start = at(jour, minutesDuJour);
  const end =
    finMin === null
      ? start + dureeMin * 60_000
      : at(finMin <= minutesDuJour ? addDays(casaStartOfDay(jour), 1).getTime() : jour, finMin);

  /* **`people` omis ne veut pas dire « toute la maison » ici.** C'est
     le piège de `resolvePeople`, et il serait bien pire sur une
     modification que sur une création : on remplacerait la liste des
     invités par le foyer entier au motif que personne n'a précisé. */
  const gensDits = field(input, "people");
  const participantIds =
    gensDits === undefined || gensDits === null
      ? avant.participantIds
      : Array.from(
          new Set([
            ctx.meId,
            ...requirePeople(input, ctx).map((m) => m.id),
          ]),
        );

  const apres: DraftEvent = {
    title: nouveauTitre ?? avant.title,
    emoji: avant.emoji,
    location: lieu ?? avant.location,
    startAt: new Date(start).toISOString(),
    endAt: new Date(end).toISOString(),
    allDay: avant.allDay,
    participantIds,
  };

  await ctx.propose({
    kind: "modify_event",
    eventId: event.id,
    event: apres,
    avant,
    candidats,
  });

  return [
    `Aperçu de modification affiché : « ${asData(avant.title)} » passerait au ${formatDayLong(start)}, de ${formatTime(start)} à ${formatTime(end)}.`,
    candidats > 1
      ? `**${candidats} événements** correspondaient ; c'est le plus proche qui est proposé, et l'aperçu le dit.`
      : "",
    "**Rien n'est modifié.** La personne valide elle-même, ou corrige.",
    "Dis-lui que l'aperçu est à l'écran. Ne dis pas que c'est déplacé ou modifié.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function proposeDelete(input: unknown, ctx: ToolContext): Promise<string> {
  if (!ctx.propose) throw new ToolError("Impossible de préparer un aperçu ici.");

  const { event, candidats } = await resolveTarget(input, ctx);

  await ctx.propose({
    kind: "delete_event",
    eventId: event.id,
    // **Relu en entier depuis la base**, pas reconstruit depuis ce que
    // le modèle a retenu. C'est la seule façon d'être sûr que ce qu'on
    // montre est ce qu'on va supprimer.
    event: asDraftEvent(event),
    candidats,
  });

  return [
    `Aperçu de suppression affiché : « ${asData(visibleTitle(event, owner(event, ctx)))} », ${formatDayLong(event.startAt)}.`,
    candidats > 1
      ? `**${candidats} événements** correspondaient ; l'aperçu montre en entier celui qui a été choisi, pour qu'on puisse refuser.`
      : "",
    "**Rien n'est supprimé.** La personne valide elle-même.",
    "Dis-lui que l'aperçu est à l'écran. Ne dis pas que c'est supprimé ou annulé.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Exécute un tool et rend son résultat, prêt à repartir au modèle.
 *
 * **Ne lève jamais.** Une erreur devient un résultat marqué en erreur :
 * le modèle la lit, se corrige et rappelle le tool — alors qu'une
 * exception ferait tomber toute la conversation pour une date mal
 * écrite. Les vraies pannes, elles, sont journalisées sans contenu
 * d'agenda (§74).
 */
export async function runTool(
  call: { id: string; name: string; input: unknown },
  ctx: ToolContext,
): Promise<AIToolResult> {
  try {
    switch (call.name) {
      case "get_schedule":
        return { id: call.id, content: await getSchedule(call.input, ctx) };
      case "who_is_free":
        return { id: call.id, content: await whoIsFreeTool(call.input, ctx) };
      case "find_moments":
        return { id: call.id, content: await findMomentsTool(call.input, ctx) };
      case "search_events":
        return { id: call.id, content: await searchEvents(call.input, ctx) };
      case "create_event":
        return { id: call.id, content: await proposeEvent(call.input, ctx) };
      case "modify_event":
        return { id: call.id, content: await proposeModify(call.input, ctx) };
      case "delete_event":
        return { id: call.id, content: await proposeDelete(call.input, ctx) };
      default:
        return {
          id: call.id,
          content: `Le tool « ${call.name} » n'existe pas.`,
          isError: true,
        };
    }
  } catch (error) {
    if (error instanceof ToolError || (error as Error | null)?.name === "ToolError") {
      return { id: call.id, content: (error as Error).message, isError: true };
    }
    console.error(`[casa-ai] le tool ${call.name} a échoué`, error);
    return {
      id: call.id,
      content: "Ce tool est tombé en panne. Dis-le simplement, sans inventer de réponse.",
      isError: true,
    };
  }
}
