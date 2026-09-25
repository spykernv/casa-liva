import { TZDate } from "@date-fns/tz";
import { addDays, addWeeks, format, startOfDay, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";

/**
 * Fuseau de la maison.
 *
 * Toutes les dates sont stockées en UTC et rendues dans CE fuseau, côté serveur
 * comme côté client. C'est ce qui garantit qu'un rendu serveur et le rendu
 * navigateur produisent exactement le même HTML : sans fuseau explicite, le
 * serveur calculerait en UTC et le téléphone en heure de Paris, et React
 * signalerait une erreur d'hydratation à chaque changement d'heure.
 *
 * TODO(phase 3) : lire le fuseau du membre connecté (`users.timezone`) et ne
 * garder celui-ci que comme valeur par défaut.
 */
export const CASA_TZ = "Europe/Paris";

/** Une date, vue depuis le fuseau de la maison. */
export function casaDate(input: string | number | Date): TZDate {
  // On repasse par un timestamp : les surcharges de `TZDate`
  // n'acceptent pas une union `string | number | Date` telle quelle.
  return new TZDate(new Date(input).getTime(), CASA_TZ);
}

/** Minutes écoulées depuis minuit, dans le fuseau de la maison. */
export function minutesFromMidnight(input: string | number | Date): number {
  const d = casaDate(input);
  return d.getHours() * 60 + d.getMinutes();
}

/** Clé de jour stable (`2026-08-02`) utilisable comme identifiant. */
export function dayKey(input: string | number | Date): string {
  return format(casaDate(input), "yyyy-MM-dd");
}

/** Minuit, dans le fuseau de la maison. */
export function casaStartOfDay(input: string | number | Date): TZDate {
  return startOfDay(casaDate(input)) as TZDate;
}

/** Lundi de la semaine — la semaine française commence le lundi. */
export function casaStartOfWeek(input: string | number | Date): TZDate {
  return startOfWeek(casaDate(input), { weekStartsOn: 1 }) as TZDate;
}

/**
 * Combien de semaines séparent `ms` d'aujourd'hui — l'unité que
 * `/semaine?s=` attend.
 *
 * `Math.round` et non une division exacte : deux semaines d'écart ne
 * font pas 14 × 24 h quand un changement d'heure passe par là.
 *
 * Vit ici plutôt que dans l'écran qui l'a écrite la première : depuis
 * JON-63, deux endroits renvoient vers la semaine d'un événement
 * qu'on vient de créer, et un lien qui ne montre pas ce qu'il promet
 * ne sert à rien.
 */
export function weeksFromNow(ms: number, now: number): number {
  const WEEK = 7 * 24 * 60 * 60_000;
  return Math.round(
    (casaStartOfWeek(ms).getTime() - casaStartOfWeek(now).getTime()) / WEEK,
  );
}

/**
 * L'instant que `/semaine?s=<offset>` désigne — l'inverse de
 * `weeksFromNow`.
 *
 * **Vit ici parce que deux endroits la calculent, et qu'ils l'ont déjà
 * fait différemment.** Le Server Component choisit les événements à
 * charger ; `WeekBoard` dessine l'en-tête et les sept colonnes. Tant
 * que les deux ajoutaient `offset * 7 * 24 h`, ils se trompaient
 * ensemble, donc de façon cohérente — corriger le premier seul aurait
 * été **pire que le défaut** : la grille aurait affiché une semaine et
 * les événements auraient été ceux d'une autre (JON-60).
 *
 * `addWeeks` et non l'arithmétique en millisecondes : une semaine
 * murale fait 167 ou 169 heures quand elle enjambe un changement
 * d'heure, et il ne manque qu'une heure pour retomber sur la semaine
 * d'avant.
 */
export function weekAnchor(now: number, weekOffset: number): TZDate {
  return addWeeks(casaDate(now), weekOffset) as TZDate;
}

/** Les sept jours de la semaine contenant `input`, du lundi au dimanche. */
export function weekDays(input: string | number | Date): TZDate[] {
  const monday = casaStartOfWeek(input);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i) as TZDate);
}

/**
 * Les `count` jours qui suivent celui de `input`, à partir de minuit —
 * le balayage que fait « ✨ Opportunité Casa » pour trouver le
 * prochain créneau libre.
 *
 * **Vit ici, et pas dans la page, pour pouvoir être vérifiée.** C'est
 * l'un des neuf sites de JON-60, et celui dont le défaut était le plus
 * silencieux : écrit `now + offset * 24 h`, le balayage **sautait le
 * 29 mars** — la journée n'était jamais regardée, donc aucune
 * opportunité ne pouvait y être proposée — et regardait **deux fois le
 * 25 octobre**, en laissant le 31 hors fenêtre. Aucune erreur, aucune
 * trace : une liste d'apparence normale, et fausse.
 *
 * Tant que la boucle vivait dans le corps de `CasaPage`, aucun contrôle
 * ne pouvait l'appeler : la page tire toute la lecture de la base
 * derrière elle. Une fonction nommée, elle, se vérifie — et c'est ce
 * que `npm run verify:dates` fait aux deux soirées où les deux
 * écritures fautives divergent (JON-69).
 */
export function casaDays(input: string | number | Date, count: number): TZDate[] {
  const first = casaStartOfDay(input);
  return Array.from({ length: count }, (_, i) => addDays(first, i) as TZDate);
}

/* ── Formats d'affichage ─────────────────────────────────────────
   Toujours en français, toujours sans zéro superflu quand c'est
   naturel à l'oral. « 9:00 » se lit mieux que « 09:00 » dans une
   phrase, mais la grille horaire veut l'alignement : deux fonctions.
   ─────────────────────────────────────────────────────────────── */

/** `09:00` — pour les grilles, où l'alignement compte. */
export function formatTime(input: string | number | Date): string {
  return format(casaDate(input), "HH:mm", { locale: fr });
}

/** `Lundi 3 août` */
export function formatDayLong(input: string | number | Date): string {
  const s = format(casaDate(input), "EEEE d MMMM", { locale: fr });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** `lun.` — en-têtes de la vue semaine. */
export function formatDayShort(input: string | number | Date): string {
  return format(casaDate(input), "EEE", { locale: fr });
}

/** `3` — le numéro du jour. */
export function formatDayNumber(input: string | number | Date): string {
  return format(casaDate(input), "d", { locale: fr });
}

/** `3 – 9 août` ou `29 juin – 5 juil.` pour l'en-tête de semaine. */
export function formatWeekRange(input: string | number | Date): string {
  const days = weekDays(input);
  const first = days[0];
  const last = days[6];
  const sameMonth = first.getMonth() === last.getMonth();
  return sameMonth
    ? `${format(first, "d", { locale: fr })} – ${format(last, "d MMMM", { locale: fr })}`
    : `${format(first, "d MMM", { locale: fr })} – ${format(last, "d MMM", { locale: fr })}`;
}

/**
 * `Lundi 3 août` ou `Du 3 au 5 août` — pour une journée entière.
 *
 * La borne de fin stockée est **exclusive** : un événement du 3 août
 * s'arrête à minuit le 4. Le dernier jour réellement couvert est donc
 * l'instant juste avant — sans cette soustraction, on annoncerait
 * systématiquement un jour de trop.
 */
export function formatAllDayRange(
  startAt: string | number | Date,
  endAt: string | number | Date,
): string {
  const start = casaDate(startAt);
  const endMs = new Date(endAt).getTime();
  const startMs = start.getTime();
  const lastDay = casaDate(Math.max(startMs, endMs - 1));

  if (dayKey(start) === dayKey(lastDay)) return formatDayLong(start);

  const sameMonth = start.getMonth() === lastDay.getMonth();
  return sameMonth
    ? `Du ${format(start, "d", { locale: fr })} au ${format(lastDay, "d MMMM", { locale: fr })}`
    : `Du ${format(start, "d MMM", { locale: fr })} au ${format(lastDay, "d MMM", { locale: fr })}`;
}

/** `2h30`, `45 min` — durée lisible à l'oral. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * Lit une date écrite `2026-08-08` et rend minuit **dans le fuseau de
 * la maison**, ou `null` si ce n'est pas une vraie date.
 *
 * Le passage par une `TZDate` n'est pas de la coquetterie :
 * `new Date("2026-08-08")` rend minuit **UTC**, soit le 7 août à 22h à
 * Paris. Une journée entière décalée d'un cran, sans la moindre erreur
 * visible — c'est le même piège que `end.date` en phase 4.
 *
 * Le report de mois est refusé plutôt que subi : « 31 février » ne
 * doit pas répondre pour le 3 mars sans le dire. Ça compte double ici,
 * où la date peut venir d'une barre d'adresse **ou d'un modèle**, qui
 * invente une date plausible sans jamais signaler qu'il l'a inventée.
 */
export function parseCasaDay(
  raw: string | undefined,
  now: string | number | Date,
): number | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;

  const [y, m, d] = raw.split("-").map(Number);
  const candidate = casaStartOfDay(now);
  candidate.setFullYear(y, m - 1, d);
  candidate.setHours(0, 0, 0, 0);

  const time = candidate.getTime();
  if (Number.isNaN(time)) return null;
  if (candidate.getMonth() !== m - 1 || candidate.getDate() !== d) return null;

  return time;
}

/** Deux dates tombent-elles le même jour, vu depuis la maison ? */
export function isSameCasaDay(
  a: string | number | Date,
  b: string | number | Date,
): boolean {
  return dayKey(a) === dayKey(b);
}
