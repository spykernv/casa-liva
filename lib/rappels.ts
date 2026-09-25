/**
 * Les délais de rappel proposés, et comment on les dit (D56, JON-79).
 *
 * **Vit hors de `lib/push/`, et c'est délibéré.** Ce module part au
 * navigateur — la feuille de création en a besoin — alors que tout
 * `lib/push/` est `server-only` et manipule la clé de service. Y ranger
 * une liste d'options obligerait à percer cette cloison pour rien.
 *
 * ── Pourquoi la liste s'arrête à deux heures ──
 *
 * Au-delà d'une journée, soustraire des minutes cesse d'être juste :
 * deux fois par an un « jour » fait 23 ou 25 heures d'horloge, et « la
 * veille à la même heure » tomberait à côté (D51). Tant que la borne
 * tient, on reste dans une arithmétique de minutes — que
 * `verify:dates` n'a pas à surveiller, parce qu'elle ne compte ni jour
 * ni semaine.
 *
 * Si « la veille au soir » est demandé un jour, ce ne sera **pas** une
 * valeur de plus dans cette liste : c'est un autre calcul (une heure
 * fixe la veille, pas un décalage), et le mélanger ici ferait
 * exactement le genre de raccourci que JON-60 a payé.
 */

export const RAPPEL_DEFAUT_MINUTES = 30;

export type OptionRappel = { minutes: number | null; libelle: string };

/**
 * Ce que l'organisateur peut choisir. `null` = personne n'est prévenu.
 *
 * Court exprès : cinq choix se lisent d'un coup d'œil, et une action
 * courante doit tenir en moins de quinze secondes.
 */
export const OPTIONS_RAPPEL: readonly OptionRappel[] = [
  { minutes: null, libelle: "Pas de rappel" },
  { minutes: 15, libelle: "15 min avant" },
  { minutes: 30, libelle: "30 min avant" },
  { minutes: 60, libelle: "1 h avant" },
  { minutes: 120, libelle: "2 h avant" },
] as const;

/** Le libellé d'un délai, y compris s'il vient d'ailleurs que de la liste. */
export function libelleRappel(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "Pas de rappel";

  const connu = OPTIONS_RAPPEL.find((o) => o.minutes === minutes);
  if (connu) return connu.libelle;

  // Une valeur hors liste peut exister : la borne de la base va
  // jusqu'à 1440. On sait la dire plutôt que d'afficher un vide.
  if (minutes < 60) return `${minutes} min avant`;
  const heures = Math.round((minutes / 60) * 10) / 10;
  return `${heures} h avant`;
}

/**
 * Le délai réellement écoulé, arrondi, pour l'écrire dans la notification.
 *
 * **On ne réutilise jamais le délai demandé pour le dire.** Le
 * planificateur est un workflow GitHub Actions, et ceux-là sont « au
 * mieux » : ils glissent de plusieurs minutes sous charge (D54). Écrire
 * « dans 30 min » sur un rappel parti avec vingt minutes de retard
 * serait faux — et une notification qui ment une fois fait douter de
 * toutes les suivantes.
 *
 * Arrondi à cinq minutes : personne ne se prépare à la minute près, et
 * « dans 27 min » a l'air d'une machine qui parle.
 */
export function minutesRestantes(debutMs: number, maintenantMs: number): number {
  const minutes = (debutMs - maintenantMs) / 60_000;
  return Math.max(0, Math.round(minutes / 5) * 5);
}
