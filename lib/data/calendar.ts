import "server-only";
import { cache } from "react";
import type { VisibilityMode } from "@/types";
import type { ExternalCalendar } from "@/lib/calendar-providers";
import { getProvider } from "@/lib/calendar-providers";
import { ReauthRequiredError } from "@/lib/calendar-providers/types";
import { createClient } from "@/lib/supabase/server";
import { readCredentials } from "@/lib/google/credentials";
import { withGoogleAccessToken } from "@/lib/google/token";

/* ═══════════════════════════════════════════════════════════════
   Lecture de l'état « agenda connecté ».

   Les connexions se lisent sous RLS (`connections_all_self`) : elles
   sont strictement personnelles, les autres membres n'ont pas à savoir
   quels agendas quelqu'un a branchés — ils en voient seulement le
   résultat.
   ═══════════════════════════════════════════════════════════════ */

export type ConnectedCalendar = {
  id: string;
  externalCalendarId: string;
  name: string;
  visibilityMode: VisibilityMode;
  lastSyncedAt?: string;
  /** Le jeton est mort : il faut repasser par Google. */
  needsReauth: boolean;
  lastError?: string;
};

/** Les agendas que la personne connectée a choisi de synchroniser. */
export const getMyConnections = cache(async (): Promise<ConnectedCalendar[]> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("calendar_connections")
    .select("*")
    .eq("provider", "google")
    .order("created_at");

  if (error) {
    console.error("[casa] lecture des agendas connectés échouée", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    externalCalendarId: row.external_calendar_id,
    name: row.name || "Agenda",
    visibilityMode: row.visibility_mode,
    lastSyncedAt: row.last_synced_at ?? undefined,
    needsReauth: row.needs_reauth,
    lastError: row.last_error ?? undefined,
  }));
});

/** A-t-on un jeton Google utilisable pour cette personne ? */
export const hasGoogleAccess = cache(async (userId: string): Promise<boolean> => {
  try {
    return (await readCredentials(userId)) !== null;
  } catch (error) {
    console.error("[casa] lecture des jetons échouée", error);
    return false;
  }
});

export type AvailableCalendars =
  | { ok: true; calendars: ExternalCalendar[] }
  /** Google a refusé : il faut reconnecter. */
  | { ok: false; reason: "reauth" }
  | { ok: false; reason: "error" };

/**
 * Les agendas proposés par Google, en direct.
 *
 * Volontairement pas mis en cache côté base : quelqu'un qui vient de
 * créer un agenda « Vacances » chez Google doit le voir apparaître
 * immédiatement, sans qu'on lui explique qu'il faut attendre.
 */
export async function listAvailableCalendars(
  userId: string,
): Promise<AvailableCalendars> {
  const provider = getProvider("google");
  if (!provider) return { ok: false, reason: "error" };

  try {
    const calendars = await withGoogleAccessToken(userId, (token) =>
      provider.listCalendars(token),
    );

    // L'agenda principal d'abord — c'est celui qu'on veut cocher en
    // premier —, puis par ordre alphabétique.
    return {
      ok: true,
      calendars: calendars.sort((a, b) => {
        if (a.primary !== b.primary) return a.primary ? -1 : 1;
        return a.name.localeCompare(b.name, "fr");
      }),
    };
  } catch (error) {
    if (error instanceof ReauthRequiredError) return { ok: false, reason: "reauth" };
    console.error("[casa] lecture des agendas Google échouée", error);
    return { ok: false, reason: "error" };
  }
}
