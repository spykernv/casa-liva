import type { Interval } from "@/types";

/* ═══════════════════════════════════════════════════════════════
   Algèbre d'intervalles — fonctions pures, aucune notion de domaine.
   Convention : demi-ouvert [start, end). Deux événements 9→10 et
   10→11 ne se chevauchent donc pas, ce qui est le comportement
   attendu d'un agenda.
   ═══════════════════════════════════════════════════════════════ */

export function duration(i: Interval): number {
  return i.end - i.start;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function contains(outer: Interval, inner: Interval): boolean {
  return outer.start <= inner.start && inner.end <= outer.end;
}

/**
 * Trie, fusionne les chevauchements et supprime les intervalles vides.
 * Les intervalles adjacents (`fin === début`) sont fusionnés : deux
 * réunions collées forment bien une seule plage occupée.
 */
export function normalize(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);

  const out: Interval[] = [];
  for (const current of sorted) {
    const last = out[out.length - 1];
    if (last && current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      out.push({ start: current.start, end: current.end });
    }
  }
  return out;
}

/** Le complément de `busy` à l'intérieur de `within` : les trous. */
export function invert(busy: Interval[], within: Interval): Interval[] {
  const merged = normalize(busy);
  const out: Interval[] = [];
  let cursor = within.start;

  for (const b of merged) {
    if (b.end <= within.start) continue;
    if (b.start >= within.end) break;
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, within.end) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= within.end) break;
  }

  if (cursor < within.end) out.push({ start: cursor, end: within.end });
  return out.filter((i) => i.end > i.start);
}

/** Intersection de deux ensembles d'intervalles. Balayage linéaire. */
export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const left = normalize(a);
  const right = normalize(b);
  const out: Interval[] = [];

  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const start = Math.max(left[i].start, right[j].start);
    const end = Math.min(left[i].end, right[j].end);
    if (end > start) out.push({ start, end });

    // On avance celui qui se termine le plus tôt : l'autre peut encore
    // croiser l'intervalle suivant.
    if (left[i].end < right[j].end) i++;
    else j++;
  }
  return out;
}

/**
 * Intersection de N ensembles. Un ensemble vide rend le résultat vide —
 * c'est voulu : si une personne n'est libre nulle part, il n'y a pas de
 * créneau commun.
 */
export function intersectAll(sets: Interval[][]): Interval[] {
  if (sets.length === 0) return [];
  return sets.reduce((acc, set) => intersect(acc, set));
}

/** Ne garde que les intervalles d'au moins `minMs`. */
export function atLeast(intervals: Interval[], minMs: number): Interval[] {
  return intervals.filter((i) => duration(i) >= minMs);
}

/** Découpe un intervalle sur les bornes de `within`. */
export function clamp(i: Interval, within: Interval): Interval | null {
  const start = Math.max(i.start, within.start);
  const end = Math.min(i.end, within.end);
  return end > start ? { start, end } : null;
}
