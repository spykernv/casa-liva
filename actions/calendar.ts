"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { VisibilityMode } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCasaContext } from "@/lib/data/casa";
import { GOOGLE_CALENDAR_SCOPES } from "@/lib/calendar-providers";
import { forgetCredentials } from "@/lib/google/credentials";
import { isGoogleConfigured } from "@/lib/google/token";
import {
  IDENTITY_GUARD_COOKIE,
  IDENTITY_GUARD_MAX_AGE_S,
} from "@/lib/google/oauth-guard";
import {
  STALE_AFTER_MS,
  syncConnection,
  syncUser,
  type SyncOutcome,
} from "@/lib/calendar/sync";
import { nowMs } from "@/lib/clock";
import { appOrigin } from "@/lib/url";

/* ═══════════════════════════════════════════════════════════════
   Connexion et réglages d'un agenda externe.

   « Un bouton, autoriser Google, oui, connecté. » Le reste — choix
   des agendas, confidentialité — vient après le consentement, quand
   la personne voit enfin de quoi on parle.
   ═══════════════════════════════════════════════════════════════ */

export type CalendarResult = { ok: true } | { ok: false; error: string };

const VISIBILITY_MODES: readonly VisibilityMode[] = [
  "availability",
  "titles",
  "full",
] as const;

/**
 * Part demander le consentement Google.
 *
 * Impérativement depuis une Server Action ou un Route Handler :
 * `@supabase/ssr` impose le flux PKCE, qui écrit un cookie de
 * vérification. Depuis un Server Component, `lib/supabase/server.ts`
 * avale silencieusement cette écriture (c'est voulu, HTTP l'interdit
 * après le début du streaming) et l'échange au retour échouerait avec
 * une erreur incompréhensible.
 */
export async function connectGoogleCalendar(): Promise<void> {
  if (!isGoogleConfigured()) {
    redirect("/moi/agenda?erreur=configuration");
  }

  const context = await getCasaContext();
  if (!context) redirect("/connexion");

  const supabase = await createClient();
  const origin = await appOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // Séparés par des espaces — c'est ce qu'attend le paramètre
      // `scope` d'OAuth, et ce que Supabase transmet tel quel.
      scopes: GOOGLE_CALENDAR_SCOPES.join(" "),
      queryParams: {
        // Sans `offline`, Google n'émet aucun refresh token : la
        // synchronisation serait morte au bout d'une heure, et le cron
        // n'a personne devant l'écran pour reconsentir.
        access_type: "offline",
        // Sans `consent`, un second passage ne renvoie pas de refresh
        // token du tout — Google considère que c'est déjà accordé. La
        // connexion se casserait alors en silence.
        prompt: "consent",
        // Oriente Google vers le bon compte quand plusieurs sont
        // ouverts dans le navigateur. Ce n'est pas une garantie, d'où
        // le cookie ci-dessous.
        login_hint: context.me.email,
      },
      redirectTo: `${origin}/auth/callback?suite=${encodeURIComponent("/moi/agenda")}`,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data.url) {
    console.error("[casa] démarrage du consentement Google échoué", error?.message);
    redirect("/moi/agenda?erreur=demarrage");
  }

  const jar = await cookies();
  jar.set(IDENTITY_GUARD_COOKIE, context.me.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IDENTITY_GUARD_MAX_AGE_S,
  });

  // `redirect()` lève : il doit rester hors de tout try/catch.
  redirect(data.url);
}

/**
 * Enregistre les agendas choisis, et la confidentialité qui va avec.
 *
 * Une connexion **est** la ligne qui dit « cet agenda est
 * synchronisé ». Décocher supprime la ligne, donc ses événements par
 * cascade : pas de nettoyage à écrire, pas d'état intermédiaire qui
 * pourrait diverger.
 */
export async function chooseCalendars(input: {
  calendars: { id: string; name: string }[];
  visibilityMode: VisibilityMode;
}): Promise<CalendarResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  if (!VISIBILITY_MODES.includes(input.visibilityMode)) {
    return { ok: false, error: "Ce réglage de confidentialité n'existe pas." };
  }

  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("calendar_connections")
    .select("id, external_calendar_id, visibility_mode, sync_generation")
    .eq("user_id", context.me.id)
    .eq("provider", "google");

  if (readError) {
    console.error("[casa] lecture des connexions échouée", readError.message);
    return { ok: false, error: "Impossible de lire tes agendas." };
  }

  const wanted = new Map(input.calendars.map((c) => [c.id, c.name]));
  const before = new Map((existing ?? []).map((c) => [c.external_calendar_id, c.id]));

  const toRemove = [...before.entries()]
    .filter(([externalId]) => !wanted.has(externalId))
    .map(([, id]) => id);

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("calendar_connections")
      .delete()
      .in("id", toRemove)
      .eq("user_id", context.me.id);

    if (error) {
      console.error("[casa] retrait d'un agenda échoué", error.message);
      return { ok: false, error: "Impossible de retirer cet agenda." };
    }
  }

  const toAdd = [...wanted.entries()].filter(([externalId]) => !before.has(externalId));

  if (toAdd.length > 0) {
    const { error } = await supabase.from("calendar_connections").insert(
      toAdd.map(([externalId, name]) => ({
        user_id: context.me.id,
        family_id: context.familyId,
        provider: "google",
        external_calendar_id: externalId,
        name,
        visibility_mode: input.visibilityMode,
      })),
    );

    if (error) {
      console.error("[casa] ajout d'un agenda échoué", error.message);
      return { ok: false, error: "Impossible d'ajouter cet agenda." };
    }
  }

  /* Le mode de confidentialité ne se change que s'il a bougé.

     Le repasser à l'identique déclencherait une relecture complète
     (`resyncAfterVisibilityChange` efface avant de relire), et donc une
     fenêtre pendant laquelle les rendez-vous ont disparu de la maison.
     Cocher un agenda de plus ne mérite pas ça. */
  const modeChanged = (existing ?? []).some(
    (c) => c.visibility_mode !== input.visibilityMode,
  );

  if (modeChanged) {
    /* `sync_generation` prévient le moteur de synchronisation qu'une
       lecture commencée avant ce changement porte l'ancien réglage.
       Sans lui, une synchro en vol terminerait ses écritures avec les
       vrais titres par-dessus les « Occupé » qu'on vient de poser. */
    const { error: modeError } = await supabase
      .from("calendar_connections")
      .update({
        visibility_mode: input.visibilityMode,
        sync_generation: (existing?.[0]?.sync_generation ?? 0) + 1,
      })
      .eq("user_id", context.me.id)
      .eq("provider", "google");

    if (modeError) {
      console.error("[casa] changement de confidentialité échoué", modeError.message);
      return { ok: false, error: "Impossible d'enregistrer ce réglage." };
    }

    const outcomes = await resyncAfterVisibilityChange(context.me.id);
    const problem = describeOutcomes(outcomes);
    if (problem) {
      revalidatePath("/moi/agenda");
      revalidateCalendarViews();
      return { ok: false, error: problem };
    }
  } else {
    // Les nouveaux agendas n'ont pas encore de curseur : leur première
    // lecture est complète, et les anciens ne sont pas touchés.
    const problem = describeOutcomes(await syncUser(context.me.id));
    if (problem) {
      revalidatePath("/moi/agenda");
      revalidateCalendarViews();
      return { ok: false, error: problem };
    }
  }

  revalidatePath("/moi/agenda");
  revalidateCalendarViews();
  return { ok: true };
}

/**
 * Traduit le résultat d'une synchronisation en une phrase, ou `null`
 * si tout s'est bien passé.
 *
 * Ne jamais jeter ces résultats. « C'est enregistré, tes rendez-vous
 * arrivent » affiché en vert alors que la relecture vient d'échouer —
 * après avoir effacé les événements — laisse quelqu'un devant un
 * agenda vide, sans un mot. C'est la promesse la plus explicite de
 * l'écran ; il faut vérifier qu'on la tient avant de l'afficher.
 */
function describeOutcomes(outcomes: SyncOutcome[]): string | null {
  if (outcomes.some((o) => o.status === "reauth")) {
    return "Google redemande ton accord — reconnecte ton agenda pour retrouver tes rendez-vous.";
  }
  if (outcomes.some((o) => o.status === "gone")) {
    return "Un de tes agendas ne répond plus chez Google. Regarde dans tes réglages.";
  }
  if (outcomes.some((o) => o.status === "error")) {
    return "Tes réglages sont enregistrés, mais on n’a pas pu relire ton agenda. Appuie sur « Synchroniser maintenant » dans un moment.";
  }
  return null;
}

/**
 * Un changement de confidentialité doit se voir tout de suite.
 *
 * On efface les événements déjà importés avant de relire : un simple
 * `upsert` laisserait en place les descriptions et lieux stockés sous
 * l'ancien réglage, plus permissif. Ce serait exactement la fuite que
 * le réglage est censé empêcher.
 */
async function resyncAfterVisibilityChange(userId: string): Promise<SyncOutcome[]> {
  const admin = createAdminClient();

  const { data: connections } = await admin
    .from("calendar_connections")
    .select("id")
    .eq("user_id", userId);

  const ids = (connections ?? []).map((c) => c.id);
  if (ids.length > 0) {
    await admin.from("events").delete().in("connection_id", ids);
  }

  return syncUser(userId);
}

export type StaleSyncResult =
  /** Rien à faire : pas d'agenda connecté, ou données encore fraîches. */
  | { status: "skipped" }
  | { status: "done"; changed: boolean }
  | { status: "reauth" }
  | { status: "error" };

/**
 * Rafraîchit les agendas si ça fait un moment — appelé à l'ouverture
 * d'une vue d'agenda.
 *
 * Remplace l'ancien `after()` posé sur les pages. `after()` s'exécutait
 * bien, mais **après l'envoi de la réponse** : la page qu'on regardait
 * avait déjà été rendue avec les anciennes données, et les nouveaux
 * rendez-vous n'apparaissaient qu'au chargement suivant. Ça marchait,
 * mais ça ne se voyait pas — ce qui revient au même pour la personne
 * devant l'écran.
 *
 * Appelé depuis le navigateur, il peut au contraire dire au client de
 * se rafraîchir, et **seulement** si quelque chose a bougé.
 */
export async function syncIfStale(): Promise<StaleSyncResult> {
  const context = await getCasaContext();
  if (!context) return { status: "skipped" };

  const admin = createAdminClient();
  const { data: connections } = await admin
    .from("calendar_connections")
    .select("*")
    .eq("user_id", context.me.id);

  if (!connections || connections.length === 0) return { status: "skipped" };

  // Une connexion morte ne se répare pas toute seule : la retenter à
  // chaque ouverture de page pilonnerait Google pour rien.
  if (connections.some((c) => c.needs_reauth)) return { status: "reauth" };

  const threshold = nowMs() - STALE_AFTER_MS;
  const due = connections.filter(
    (c) => !c.last_synced_at || new Date(c.last_synced_at).getTime() <= threshold,
  );

  if (due.length === 0) return { status: "skipped" };

  let changed = false;
  let reauth = false;
  let failed = false;

  for (const connection of due) {
    const outcome = await syncConnection(connection);
    if (outcome.status === "ok") {
      if (outcome.imported > 0 || outcome.removed > 0) changed = true;
    } else if (outcome.status === "reauth") {
      reauth = true;
    } else {
      failed = true;
    }
  }

  // On ne revalide que si l'agenda a réellement bougé : refaire le
  // rendu de toutes les vues pour rien coûterait plus cher que la
  // synchronisation elle-même.
  if (changed) revalidateCalendarViews();

  if (reauth) return { status: "reauth" };
  if (failed) return { status: "error" };
  return { status: "done", changed };
}

/** Synchroniser maintenant, sans attendre le passage suivant. */
export async function syncNow(): Promise<CalendarResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  const admin = createAdminClient();
  const { data: connections } = await admin
    .from("calendar_connections")
    .select("*")
    .eq("user_id", context.me.id);

  if (!connections || connections.length === 0) {
    return { ok: false, error: "Aucun agenda connecté." };
  }

  const outcomes: SyncOutcome[] = [];
  for (const connection of connections) {
    outcomes.push(await syncConnection(connection));
  }

  revalidatePath("/moi/agenda");
  revalidateCalendarViews();

  // Les quatre issues passent par la même traduction : oublier `gone`
  // ici, comme c'était le cas, faisait répondre « c'est à jour » alors
  // qu'un agenda venait d'être mis hors service.
  const problem = describeOutcomes(outcomes);
  if (problem) {
    const failure = outcomes.find((o) => o.status === "error");
    if (failure && failure.status === "error") {
      console.error("[casa] synchronisation manuelle échouée", failure.message);
    }
    return { ok: false, error: problem };
  }

  return { ok: true };
}

/**
 * Déconnecte tout : les jetons, les agendas, et les événements
 * importés (par cascade sur `connection_id`).
 *
 * On ne garde rien « au cas où ». Quelqu'un qui déconnecte son agenda
 * demande que ses rendez-vous disparaissent de la maison, pas qu'ils
 * y dorment.
 */
export async function disconnectGoogleCalendar(): Promise<CalendarResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("calendar_connections")
    .delete()
    .eq("user_id", context.me.id)
    .eq("provider", "google");

  if (error) {
    console.error("[casa] déconnexion Google échouée", error.message);
    return { ok: false, error: "Impossible de déconnecter l'agenda." };
  }

  try {
    await forgetCredentials(context.me.id);
  } catch (credentialsError) {
    console.error("[casa] suppression des jetons échouée", credentialsError);
    return { ok: false, error: "Les agendas sont retirés, mais pas les jetons. Réessaie." };
  }

  revalidatePath("/moi/agenda");
  revalidateCalendarViews();
  return { ok: true };
}

/** Toutes les vues qui affichent des événements. */
function revalidateCalendarViews() {
  revalidatePath("/aujourdhui");
  revalidatePath("/semaine");
  revalidatePath("/casa");
}
