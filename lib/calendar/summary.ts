import type { CasaEvent } from "@/types";
import { busyIntervalsFor, dayWindow, freeIntervalsFor, HOUR } from "@/lib/availability/availability";
import { formatTime } from "@/lib/date";
import { duration } from "@/lib/availability/intervals";

/**
 * Une phrase qui résume la journée de quelqu'un.
 *
 * C'est du texte lu en diagonale sur une carte : il doit répondre à
 * « je peux le/la solliciter ou pas ? » en un coup d'œil, pas énumérer
 * l'agenda. Le résumé riche et nuancé, c'est le travail de Casa AI.
 */
export function summarizeDay(
  userId: string,
  events: CasaEvent[],
  day: string | number | Date,
): string {
  const window = dayWindow(day);
  const busy = busyIntervalsFor(userId, events).filter(
    (i) => i.end > window.start && i.start < window.end,
  );

  if (busy.length === 0) return "Libre toute la journée";

  const free = freeIntervalsFor(userId, events, window).filter((i) => duration(i) >= HOUR);
  const totalBusy = busy.reduce((sum, i) => sum + duration(i), 0);
  const fullDay = totalBusy >= duration(window) * 0.8;

  if (fullDay || free.length === 0) return "Occupé toute la journée";

  // Le premier vrai trou est l'information la plus utile.
  const first = free[0];
  const last = free[free.length - 1];

  if (first.start <= window.start) {
    return `Libre jusqu’à ${formatTime(first.end)}`;
  }
  if (last.end >= window.end) {
    return `Libre à partir de ${formatTime(last.start)}`;
  }
  return `Libre ${formatTime(first.start)} → ${formatTime(first.end)}`;
}
