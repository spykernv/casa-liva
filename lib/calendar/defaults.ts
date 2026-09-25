import { casaDate, isSameCasaDay } from "@/lib/date";
import { DAY_WINDOW } from "@/lib/availability/availability";

/** L'heure proposée quand « maintenant » n'est pas une réponse utile. */
const FALLBACK_HOUR = 18;

/**
 * Le créneau pré-rempli quand on appuie sur « + ».
 *
 * Arrondir bêtement l'heure courante ne marche pas : à 23h45, la
 * demi-heure suivante tombe le lendemain à minuit, et le formulaire
 * propose de créer un événement un autre jour que celui qu'on regarde.
 *
 * La règle : si on regarde aujourd'hui et qu'il reste de la place dans
 * la journée, on part de la prochaine demi-heure. Sinon on propose 18h
 * — l'heure à laquelle une famille organise réellement quelque chose.
 */
export function defaultEventStart(day: number, now: number): number {
  const target = casaDate(day);

  if (isSameCasaDay(day, now)) {
    const rounded = casaDate(now);
    rounded.setSeconds(0, 0);
    rounded.setMinutes(rounded.getMinutes() > 30 ? 60 : 30);

    // On garde la proposition seulement si elle reste dans la journée
    // regardée et à une heure décente.
    const stillToday = isSameCasaDay(rounded.getTime(), now);
    if (stillToday && rounded.getHours() < DAY_WINDOW.endHour) {
      return rounded.getTime();
    }
  }

  target.setHours(FALLBACK_HOUR, 0, 0, 0);
  return target.getTime();
}
