import type { CasaEvent, CommonSlot, Interval } from "@/types";
import { casaDate } from "@/lib/date";
import { atLeast, clamp, intersectAll, invert, normalize } from "./intervals";

/* ═══════════════════════════════════════════════════════════════
   Moteur de disponibilités.
   Casa Events + Google Events → busy → free → créneaux communs.
   ═══════════════════════════════════════════════════════════════ */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;

/**
 * Fenêtre de vie quotidienne. On ne propose jamais un apéro à 4h du
 * matin sous prétexte que tout le monde est techniquement « libre ».
 */
export const DAY_WINDOW = { startHour: 8, endHour: 22 } as const;

/**
 * Les durées proposées par « ✨ Trouver un moment » (§21-22). Trois
 * choix, pas un champ libre : une famille cherche « une heure », « une
 * après-midi » ou « une soirée », pas quarante-cinq minutes.
 *
 * Ces constantes vivent ici, avec le moteur, et **pas** avec la couche
 * de lecture : `lib/data/availability.ts` porte `server-only`, et un
 * formulaire client qui y piocherait une constante embarquerait tout
 * le client Supabase dans le bundle du navigateur.
 */
export const DURATIONS = [60, 120, 180] as const;
export type Duration = (typeof DURATIONS)[number];
export const DEFAULT_DURATION: Duration = 120;

export function isDuration(value: number): value is Duration {
  return (DURATIONS as readonly number[]).includes(value);
}

/** Les plages où `userId` est occupé, d'après les événements fournis. */
export function busyIntervalsFor(userId: string, events: CasaEvent[]): Interval[] {
  const mine = events.filter(
    (e) =>
      // Un événement importé marqué « Disponible » chez le fournisseur
      // s'affiche mais n'occupe personne : un anniversaire ou un jour
      // férié ne remplit pas une journée (§21-22).
      e.busy !== false &&
      e.participants.some((p) => p.userId === userId && p.status !== "declined"),
  );
  return normalize(
    mine.map((e) => ({
      start: new Date(e.startAt).getTime(),
      end: new Date(e.endAt).getTime(),
    })),
  );
}

/** Les plages où `userId` est libre à l'intérieur de `within`. */
export function freeIntervalsFor(
  userId: string,
  events: CasaEvent[],
  within: Interval,
): Interval[] {
  return invert(busyIntervalsFor(userId, events), within);
}

/**
 * La fenêtre « heures décentes » d'une journée donnée, exprimée en
 * millisecondes epoch. `day` peut être n'importe quel instant du jour.
 */
export function dayWindow(day: string | number | Date): Interval {
  const start = casaDate(day);
  start.setHours(DAY_WINDOW.startHour, 0, 0, 0);
  const end = casaDate(day);
  end.setHours(DAY_WINDOW.endHour, 0, 0, 0);
  return { start: start.getTime(), end: end.getTime() };
}

/**
 * Les moments où **tout le monde** dans `userIds` est libre.
 * Un `userIds` vide renvoie une liste vide : « personne » n'est pas
 * la même chose que « tout le monde ».
 */
export function commonFreeIntervals(
  userIds: string[],
  events: CasaEvent[],
  within: Interval,
): Interval[] {
  if (userIds.length === 0) return [];
  return intersectAll(userIds.map((id) => freeIntervalsFor(id, events, within)));
}

export type FreeBand = Interval & {
  score: number;
  /**
   * Ce bandeau mérite-t-il d'être annoncé ?
   *
   * Un dimanche calme produit trois ou quatre créneaux communs. Les
   * annoncer tous transformerait « ✨ tout le monde est libre » en
   * papier peint. On n'écrit donc la phrase que sur les mieux notés
   * (§38 : « 1 à 2 suggestions pertinentes », jamais agressives) ; les
   * autres restent une teinte discrète, informative sans être bavarde.
   */
  highlight: boolean;
};

/**
 * Les créneaux d'une journée où tout le monde est libre.
 *
 * `minimumMs` écarte les trous trop courts : vingt minutes entre deux
 * rendez-vous, ce n'est pas une occasion.
 */
export function everyoneFreeToday(
  userIds: string[],
  events: CasaEvent[],
  day: string | number | Date,
  minimumMs: number = HOUR,
  highlightCount = 1,
): FreeBand[] {
  const window = dayWindow(day);
  const bands = atLeast(commonFreeIntervals(userIds, events, window), minimumMs);

  const scored = bands.map((band) => ({ ...band, score: scoreSlot(band, window) }));
  const best = new Set(
    [...scored]
      .sort((a, b) => b.score - a.score || a.start - b.start)
      .slice(0, highlightCount)
      .map((b) => b.start),
  );

  return scored
    .map((b) => ({ ...b, highlight: best.has(b.start) }))
    .sort((a, b) => a.start - b.start);
}

/* ── ✨ Trouver un moment ────────────────────────────────────── */

/**
 * Note de confort d'un créneau, entre 0 et 1. Sert uniquement à
 * ordonner les propositions — jamais à en écarter.
 *
 * On récompense : le week-end, les fins d'après-midi et les soirées
 * (quand une famille se retrouve réellement), et la marge autour du
 * créneau. On pénalise : le tout début de matinée.
 */
function scoreSlot(slot: Interval, container: Interval): number {
  const start = casaDate(slot.start);
  const hour = start.getHours() + start.getMinutes() / 60;
  const weekday = start.getDay();

  let score = 0.5;

  if (weekday === 0 || weekday === 6) score += 0.2;
  if (hour >= 17 && hour <= 21) score += 0.2;
  else if (hour >= 10 && hour < 17) score += 0.1;
  else if (hour < 9) score -= 0.2;

  // De la marge de part et d'autre = moins de stress qu'un créneau
  // coincé pile entre deux obligations.
  const slack = container.end - container.start - (slot.end - slot.start);
  score += Math.min(slack / (2 * HOUR), 1) * 0.1;

  // Un long créneau vaut mieux qu'un court, à heure égale. Sans ce
  // terme, une matinée entière se ferait battre par vingt minutes
  // bien placées.
  score += Math.min((slot.end - slot.start) / (4 * HOUR), 1) * 0.1;

  return Math.max(0, Math.min(1, score));
}

export type FindSlotsInput = {
  userIds: string[];
  events: CasaEvent[];
  /** Sur quelle plage chercher — typiquement les 7 prochains jours. */
  range: Interval;
  durationMinutes: number;
  /** Nombre maximum de propositions renvoyées. */
  limit?: number;
};

/** Pas d'échantillonnage des heures de début proposées. */
const STEP = 30 * MINUTE;

/**
 * Les heures de début envisageables à l'intérieur d'un trou.
 *
 * **Ne pas se contenter du début du trou.** C'était le cas, et ça
 * vidait le score de tout son sens : sur des agendas peu remplis, le
 * trou commence à 8h tous les jours, donc *toutes* les propositions
 * tombaient à 8h — précisément l'heure que `scoreSlot` pénalise. Une
 * liste de « meilleurs moments » qui répond « 08:00 » cinq fois de
 * suite n'a rien choisi du tout.
 *
 * On échantillonne donc le trou à la demi-heure, sur des heures rondes
 * (personne ne propose « 10:47 »), et on garde aussi le tout début du
 * trou : dans un créneau serré entre deux rendez-vous, c'est parfois la
 * seule position qui rentre.
 */
function candidateStarts(free: Interval, needed: number): number[] {
  const latest = free.end - needed;
  if (latest < free.start) return [];

  const starts = [free.start];

  // Première demi-heure ronde au niveau ou après le début du trou.
  const rounded = casaDate(free.start);
  rounded.setSeconds(0, 0);
  const minutes = rounded.getMinutes();
  rounded.setMinutes(minutes === 0 ? 0 : minutes <= 30 ? 30 : 60);

  // `t >= free.start` n'est pas superflu : arrondir efface les
  // secondes, et un trou qui commence à 10:00:30 verrait sinon naître
  // un candidat à 10:00:00 — trente secondes avant d'être libre.
  for (let t = rounded.getTime(); t <= latest; t += STEP) {
    if (t > free.start) starts.push(t);
  }
  return starts;
}

/**
 * Cherche les meilleurs créneaux où tout le monde est libre.
 *
 * On découpe la recherche jour par jour pour appliquer la fenêtre
 * d'heures décentes, puis on ne garde qu'**une** proposition par
 * demi-journée : trois créneaux samedi matin qui se chevauchent, ce
 * n'est pas trois choix, c'est du bruit.
 */
export function findCommonSlots({
  userIds,
  events,
  range,
  durationMinutes,
  limit = 5,
}: FindSlotsInput): CommonSlot[] {
  const needed = durationMinutes * MINUTE;
  const candidates: CommonSlot[] = [];

  const cursor = casaDate(range.start);
  cursor.setHours(0, 0, 0, 0);

  while (cursor.getTime() < range.end) {
    const window = clamp(dayWindow(cursor), range);
    if (window) {
      for (const free of commonFreeIntervals(userIds, events, window)) {
        for (const start of candidateStarts(free, needed)) {
          const slot: Interval = { start, end: start + needed };
          candidates.push({ ...slot, userIds, score: scoreSlot(slot, free) });
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  // Une seule proposition par demi-journée.
  const seen = new Set<string>();
  const deduped: CommonSlot[] = [];
  for (const c of candidates.sort((a, b) => b.score - a.score || a.start - b.start)) {
    const d = casaDate(c.start);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours() < 13 ? "am" : "pm"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
    if (deduped.length >= limit) break;
  }

  return deduped.sort((a, b) => a.start - b.start);
}
