import { addDays } from "date-fns";
import type { CasaEvent } from "@/types";
import { casaStartOfDay, minutesFromMidnight } from "@/lib/date";
import { DAY_WINDOW } from "@/lib/availability/availability";

/* ═══════════════════════════════════════════════════════════════
   Placement des événements dans une grille horaire.
   Deux problèmes : convertir une heure en position verticale, et
   répartir horizontalement les événements qui se chevauchent.
   ═══════════════════════════════════════════════════════════════ */

/** Hauteur d'une heure, en pixels. Une demi-heure reste tapable. */
export const HOUR_HEIGHT = 64;

/** Un événement placé dans la grille d'un jour. */
export type PositionedEvent = {
  event: CasaEvent;
  /** Minutes depuis minuit, découpées aux bornes du jour. */
  startMin: number;
  endMin: number;
  /** Colonne occupée, et nombre total de colonnes du groupe. */
  column: number;
  columns: number;
};

/**
 * Bornes verticales de la grille, en heures.
 *
 * On n'affiche pas 24 heures par défaut : une famille n'a rien à faire
 * à 3h du matin, et 24 h de vide donnent une impression d'agenda mort.
 *
 * La fenêtre de base est celle des « heures décentes » du moteur de
 * disponibilités (8h→22h) : c'est cohérent, on ne montre pas des heures
 * qu'on ne proposerait jamais. Elle s'élargit dès qu'un événement
 * déborde — un footing à 7h reste visible.
 *
 * **Les bornes se déduisent de `clampToDay`, jamais d'une seconde
 * lecture des dates** (JON-75). L'ancienne version relisait `e.endAt`
 * pour son propre compte :
 *
 * ```ts
 * const eh = end.getMinutes() > 0 ? end.getHours() + 1 : end.getHours();
 * ```
 *
 * Juste pour « un événement qui finit pile à l'heure ne réclame pas
 * l'heure suivante », et **faux pour la seule heure qui appartient au
 * lendemain** : une fin à `00:00` donne `getHours() === 0`, donc
 * `eh = 0`, donc aucun élargissement. Pendant ce temps `clampToDay`
 * plaçait correctement la fin à la minute 1440. Un `22h00 → 00h00` —
 * une soirée, ce qu'on écrit sans y penser — était dessiné à `top: 896`
 * dans une grille de 896 px : **entièrement en dessous, donc nulle
 * part**, et tous les jours de l'année.
 *
 * Deux moitiés du même calcul qui ne s'accordaient pas sur ce qu'est
 * minuit — la forme exacte de JON-60, où `WeekBoard` recalculait sa
 * propre ancre de semaine. La parade est la même : **une seule
 * fonction décide**, et les deux la consultent.
 *
 * **Et on prend les événements bruts, pas ceux que `layoutDay` a
 * placés.** Ce serait la lecture littérale du ticket, et elle
 * introduirait un défaut : `DayBoard` passe à `layoutDay` les
 * événements **avec l'aperçu du glissement appliqué**. Les bornes en
 * dépendraient donc, la grille se réorganiserait pendant qu'on
 * déplace un bloc, et `use-event-drag` — qui dérive ses minutes d'un
 * décalage en pixels relatif à `startHour` — ferait sauter le bloc
 * sous le doigt. Partager la **fonction de découpe** suffit à fermer
 * le défaut ; partager le **tableau** en ouvrirait un autre.
 */
export function gridBounds(
  events: CasaEvent[],
  dayStartMs: number,
): { startHour: number; endHour: number } {
  let startHour: number = DAY_WINDOW.startHour;
  let endHour: number = DAY_WINDOW.endHour;

  for (const e of events) {
    const [startMin, endMin] = clampToDay(e, dayStartMs);
    // Un événement entièrement hors de la journée affichée ne réclame
    // aucune heure. `clampToDay` le rend replié sur un instant.
    if (endMin <= startMin) continue;

    const s = Math.floor(startMin / 60);
    // `Math.ceil` porte la règle d'origine sans la réécrire : 22h00
    // tombe sur 22, 22h30 sur 23, et minuit — la minute 1440 — sur 24.
    const eh = Math.ceil(endMin / 60);

    if (s < startHour) startHour = Math.max(0, s);
    if (eh > endHour) endHour = Math.min(24, eh);
  }

  return { startHour, endHour };
}

/**
 * Minuit du lendemain vaut 1440, pas 0 — sinon un événement qui va
 * jusqu'au bout de la journée se retrouverait à hauteur négative.
 */
function wallMinutes(ms: number, dayEndMs: number): number {
  return ms >= dayEndMs ? 1440 : minutesFromMidnight(ms);
}

/**
 * Minutes depuis minuit, découpées à la journée [0, 1440].
 *
 * **Des minutes d'horloge, pas des minutes écoulées** (JON-60). Les
 * deux coïncident 363 jours par an et divergent d'une heure les deux
 * dimanches de changement d'heure : le 29 mars 2026 dure 23 heures, le
 * 25 octobre en dure 25. Compter les millisecondes depuis minuit
 * plaçait alors un rendez-vous de 23h30 à la position « 22h30 » au
 * printemps — une heure trop haut, en plein milieu de la grille — et à
 * « 24h30 » à l'automne, c'est-à-dire **sous le bas de la grille**,
 * donc nulle part. La graduation, elle, est en heures d'horloge : c'est
 * `gridBounds` qui la pose, avec `getHours()`.
 *
 * La fin est ramenée au début avant d'être découpée : un événement
 * entièrement antérieur au jour affiché donnerait sinon une borne
 * empruntée à la veille, et un bloc absurde plutôt que rien.
 */
function clampToDay(event: CasaEvent, dayStartMs: number): [number, number] {
  const dayEndMs = addDays(casaStartOfDay(dayStartMs), 1).getTime();
  const start = Math.max(new Date(event.startAt).getTime(), dayStartMs);
  const end = Math.min(Math.max(new Date(event.endAt).getTime(), start), dayEndMs);
  return [wallMinutes(start, dayEndMs), wallMinutes(end, dayEndMs)];
}

/**
 * Répartit les événements d'une journée en colonnes.
 *
 * On regroupe d'abord les événements qui se chevauchent de proche en
 * proche (A chevauche B, B chevauche C → même groupe, même si A et C
 * ne se touchent pas), puis on assigne à chacun la première colonne
 * libre. Le nombre de colonnes du groupe donne la largeur de chacun,
 * ce qui évite qu'un événement isolé soit inutilement étriqué.
 */
export function layoutDay(events: CasaEvent[], dayStartMs: number): PositionedEvent[] {
  const items = events
    .map((event) => {
      const [startMin, endMin] = clampToDay(event, dayStartMs);
      return { event, startMin, endMin };
    })
    // Une hauteur plancher de 20 minutes : sinon un événement de 5 min
    // devient une ligne invisible et intapable.
    .map((i) => ({ ...i, endMin: Math.max(i.endMin, i.startMin + 20) }))
    .filter((i) => i.endMin > i.startMin)
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const positioned: PositionedEvent[] = [];
  let group: typeof items = [];
  let groupEnd = -Infinity;

  const flush = () => {
    if (group.length === 0) return;

    // Colonnes du groupe : chaque colonne retient la fin de son dernier
    // événement ; on prend la première où ça rentre.
    const columnEnds: number[] = [];
    const assigned = group.map((item) => {
      let column = columnEnds.findIndex((end) => end <= item.startMin);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(item.endMin);
      } else {
        columnEnds[column] = item.endMin;
      }
      return { ...item, column };
    });

    for (const item of assigned) {
      positioned.push({ ...item, columns: columnEnds.length });
    }
    group = [];
    groupEnd = -Infinity;
  };

  for (const item of items) {
    if (item.startMin >= groupEnd) flush();
    group.push(item);
    groupEnd = Math.max(groupEnd, item.endMin);
  }
  flush();

  return positioned;
}

/**
 * Marge de préhension autour d'un bloc, en pixels.
 *
 * **14 et pas 10**, et le nombre se démontre : le plus petit bloc
 * possible mesure 22 px de haut (`Math.max(height, 22)` dans
 * `eventBox`), et 22 + 2 × 14 = 50 ≥ 48. C'est cette marge qui rend la
 * cible conforme, pas la hauteur du bloc — augmenter `HOUR_HEIGHT`
 * pour y arriver aurait déplacé le problème dans `use-event-drag.ts`,
 * qui en dérive ses minutes.
 */
export const GRAB_SLOP = 14;

/**
 * Le bloc que le doigt visait, ou `null` — le fond crée alors.
 *
 * Le fond de la grille est un bouton plein écran qui crée un événement
 * là où l'on tape. Sans ce test, il **vole** tous les taps qui ratent
 * un petit bloc de quelques pixels : on croit ouvrir son rendez-vous,
 * on se retrouve devant un formulaire de création. Le plus proche du
 * centre gagne, pour que deux blocs voisins se départagent sans
 * ambiguïté.
 */
export function hitTest(
  boxes: { id: string; top: number; height: number }[],
  y: number,
): string | null {
  const touches = boxes.filter(
    (b) => y >= b.top - GRAB_SLOP && y <= b.top + b.height + GRAB_SLOP,
  );
  if (touches.length === 0) return null;

  return touches.sort(
    (a, b) =>
      Math.abs(y - (a.top + a.height / 2)) - Math.abs(y - (b.top + b.height / 2)),
  )[0].id;
}

/** Ce qu'un glissement modifie : l'événement entier, ou l'une de ses bornes. */
export type ShiftMode = "move" | "resize-start" | "resize-end";

/**
 * Applique un décalage en minutes à un événement.
 *
 * Renvoie des chaînes ISO plutôt que des `Date` : c'est ce que la base
 * et les Server Actions attendent, et ça évite qu'un fuseau se glisse
 * dans la conversion au passage.
 */
export function shiftEvent(
  event: CasaEvent,
  mode: ShiftMode,
  deltaMin: number,
): { startAt: string; endAt: string } {
  const delta = deltaMin * 60_000;
  const start = new Date(event.startAt).getTime();
  const end = new Date(event.endAt).getTime();

  switch (mode) {
    case "resize-start":
      return {
        startAt: new Date(start + delta).toISOString(),
        endAt: event.endAt,
      };
    case "resize-end":
      return {
        startAt: event.startAt,
        endAt: new Date(end + delta).toISOString(),
      };
    default:
      return {
        startAt: new Date(start + delta).toISOString(),
        endAt: new Date(end + delta).toISOString(),
      };
  }
}

/** Position et taille CSS d'un événement, en pixels. */
export function eventBox(
  p: PositionedEvent,
  startHour: number,
): { top: number; height: number; left: string; width: string } {
  const offset = startHour * 60;
  const top = ((p.startMin - offset) / 60) * HOUR_HEIGHT;
  const height = ((p.endMin - p.startMin) / 60) * HOUR_HEIGHT;

  // 2 px de gouttière entre colonnes, pris sur la largeur.
  const widthPct = 100 / p.columns;
  return {
    top,
    height: Math.max(height, 22),
    left: `calc(${p.column * widthPct}% + ${p.column > 0 ? 2 : 0}px)`,
    width: `calc(${widthPct}% - ${p.columns > 1 ? 3 : 0}px)`,
  };
}
