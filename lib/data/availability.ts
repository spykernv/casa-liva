import "server-only";
import { addDays } from "date-fns";
import type { CasaEvent, CommonSlot, Interval } from "@/types";
import { getEvents } from "@/lib/data/casa";
import {
  busyIntervalsFor,
  dayWindow,
  everyoneFreeToday,
  findCommonSlots,
  HOUR,
  type FreeBand,
} from "@/lib/availability/availability";
import { clamp, invert } from "@/lib/availability/intervals";
import { casaStartOfDay, parseCasaDay } from "@/lib/date";

/* ═══════════════════════════════════════════════════════════════
   « ✨ Trouver un moment » — la couche lecture.

   Le moteur (`lib/availability/`) est pur : il calcule sur les
   événements qu'on lui donne. Ce module est le seul endroit qui décide
   **lesquels** — et c'est exactement là que se cache le piège de la
   phase 5.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Sur combien de jours on cherche.
 *
 * Le plan demande « au moins 7 » ; on en prend quatorze. Une famille
 * qui cherche un moment ensemble vise rarement les trois jours qui
 * viennent — et deux semaines contiennent deux week-ends, c'est-à-dire
 * deux fois les créneaux que le score favorise réellement.
 */
export const SEARCH_DAYS = 14;

export type FindMomentsInput = {
  familyId: string;
  /** Tout le monde doit être libre — un `userIds` vide ne renvoie rien. */
  userIds: string[];
  durationMinutes: number;
  /** Instant de référence, calculé une seule fois par la page. */
  now: number;
  days?: number;
  limit?: number;
};

/**
 * Les meilleurs moments où tout le monde est libre.
 *
 * **Le piège de cet écran, et il est silencieux.** `findCommonSlots`
 * *prend* les événements en argument, il ne les lit pas. Charger une
 * fenêtre plus étroite que la plage de recherche ferait proposer des
 * créneaux « libres » qui ne le sont pas — simplement parce que
 * l'événement qui les occupe n'était pas dans la liste passée. La
 * réponse aurait l'air parfaitement normale, juste fausse.
 *
 * Les deux bornes sont donc calculées ici, ensemble, à partir de la
 * même variable. Elles ne peuvent pas diverger.
 */
export async function findMoments({
  familyId,
  userIds,
  durationMinutes,
  now,
  days = SEARCH_DAYS,
  limit = 5,
}: FindMomentsInput): Promise<CommonSlot[]> {
  if (userIds.length === 0) return [];

  const today = casaStartOfDay(now);
  const from = today.getTime();
  // `addDays` plutôt que `days * 24h` : deux semaines traversent un
  // changement d'heure deux fois par an, et 24 h n'y font pas un jour.
  const to = addDays(today, days).getTime();

  // `getEvents` retient les événements qui **croisent** l'intervalle :
  // un rendez-vous commencé ce matin et fini ce soir occupe bien la
  // fin d'après-midi, même s'il n'a pas démarré dans la fenêtre.
  const events = await getEvents(familyId, from, to);

  return findCommonSlots({
    userIds,
    events,
    // On cherche à partir de maintenant, pas depuis minuit : proposer
    // « ce matin 9h » à quelqu'un qui regarde son téléphone à 14h est
    // au mieux vexant.
    range: { start: Math.max(now, from), end: to },
    durationMinutes,
    limit,
  });
}

/* ═══════════════════════════════════════════════════════════════
   « Qui est libre le … ? » — la question inverse.

   `findMoments` part d'une envie et cherche quand. Celle-ci part d'une
   date et regarde qui. Les deux servent à organiser, mais pas au même
   moment : on connaît souvent le jour avant de savoir avec qui.

   Elle porte aussi ce que la première ne peut pas montrer — **ce qui
   occupe les gens**. C'est ce qui permet de proposer quand même, et à
   la personne occupée de décider que la nouvelle proposition vaut
   mieux que la sienne.
   ═══════════════════════════════════════════════════════════════ */

/** Ce qui occupe quelqu'un, et par quoi. */
export type Occupation = {
  event: CasaEvent;
  /** L'événement recoupé avec la fenêtre d'heures décentes. */
  interval: Interval;
};

export type PersonDay = {
  userId: string;
  free: Interval[];
  busy: Occupation[];
  /** Rien ne l'occupe entre 8h et 22h. */
  freeAllDay: boolean;
};

export type DayAvailability = {
  /** La fenêtre d'heures décentes de ce jour-là (8h → 22h). */
  window: Interval;
  /** Les plages où **tout le monde** est libre, d'au moins une heure. */
  common: FreeBand[];
  people: PersonDay[];
};

/** Combien de jours à l'avance on accepte de regarder. */
export const HORIZON_DAYS = 365;

/**
 * Lit une date d'URL (`2026-08-08`) et la ramène dans le raisonnable.
 *
 * Renvoie `null` sur tout ce qui n'est pas une vraie date : le
 * paramètre vient de la barre d'adresse, où n'importe qui écrit
 * n'importe quoi. On ne veut pas d'un `Invalid Date` qui se propage
 * jusqu'à un `setHours` et rend une page blanche.
 */
export function parseDay(raw: string | undefined, now: number): number | null {
  // La lecture elle-même — fuseau compris, mois reportés refusés —
  // vit dans `lib/date.ts` : Casa AI lit les mêmes dates, écrites par
  // un modèle plutôt que par une barre d'adresse.
  const time = parseCasaDay(raw, now);
  if (time === null) return null;

  const floor = casaStartOfDay(now).getTime();
  const ceiling = addDays(casaStartOfDay(now), HORIZON_DAYS).getTime();
  if (time < floor || time > ceiling) return null;

  return time;
}

/**
 * Qui est libre ce jour-là, et qu'est-ce qui occupe les autres.
 *
 * On charge la journée **entière** et pas seulement la fenêtre 8h-22h :
 * un rendez-vous commencé à 7h et fini à 10h occupe bien la matinée, et
 * ne pas le charger le ferait disparaître.
 */
export async function whoIsFree({
  familyId,
  userIds,
  day,
}: {
  familyId: string;
  userIds: string[];
  day: number;
}): Promise<DayAvailability> {
  const start = casaStartOfDay(day).getTime();
  const end = addDays(casaStartOfDay(day), 1).getTime();
  const events = await getEvents(familyId, start, end);

  const window = dayWindow(day);

  const people: PersonDay[] = userIds.map((userId) => {
    const busyIntervals = busyIntervalsFor(userId, events);
    const free = invert(busyIntervals, window);

    /* On repart des événements, pas des intervalles fusionnés : ce
       qu'on veut montrer, c'est « Sophie fait les courses », pas
       « Sophie est prise de 14h à 16h ». Le nom de l'occupation est
       toute l'information utile pour décider si elle vaut la peine
       d'être abandonnée. */
    const busy = events
      .filter(
        (e) =>
          e.busy !== false &&
          e.participants.some((p) => p.userId === userId && p.status !== "declined"),
      )
      .map((event) => ({
        event,
        interval: clamp(
          {
            start: new Date(event.startAt).getTime(),
            end: new Date(event.endAt).getTime(),
          },
          window,
        ),
      }))
      .filter((o): o is Occupation => o.interval !== null)
      .sort((a, b) => a.interval.start - b.interval.start);

    return {
      userId,
      free,
      busy,
      freeAllDay: busy.length === 0,
    };
  });

  return {
    window,
    common: everyoneFreeToday(userIds, events, day, HOUR),
    people,
  };
}
