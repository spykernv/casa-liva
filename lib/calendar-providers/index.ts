import type { CalendarProvider } from "./types";
import { googleCalendarProvider } from "./google";

export * from "./types";
export { GOOGLE_CALENDAR_SCOPES } from "./google";

/**
 * Les fournisseurs d'agenda connus.
 *
 * Un seul aujourd'hui. Le jour où quelqu'un réclamera iCloud ou
 * Outlook, ce sera une entrée de plus dans cet objet et un fichier à
 * côté de `google.ts` — pas une réécriture (DECISIONS.md, D10). On ne
 * les construit pas avant que la demande existe (§77).
 */
const PROVIDERS: Record<string, CalendarProvider> = {
  [googleCalendarProvider.name]: googleCalendarProvider,
};

/** Le fournisseur nommé, ou `null` si la base contient une valeur inconnue. */
export function getProvider(name: string): CalendarProvider | null {
  return PROVIDERS[name] ?? null;
}
