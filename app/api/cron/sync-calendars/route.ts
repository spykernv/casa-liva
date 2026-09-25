import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncConnection } from "@/lib/calendar/sync";
import { sendDigests } from "@/lib/email/cron-digests";
import { nowMs } from "@/lib/clock";
import { appOrigin } from "@/lib/url";

/**
 * **Le** passage quotidien. Il porte tout.
 *
 * `PLAN.md` en prévoyait trois (`daily-digest`, `weekly-digest`,
 * `calendar-sync`) ; Vercel plafonne les crons à **une exécution par
 * jour** sur le plan Hobby (D15). Il n'y en a donc qu'un, qui fait les
 * deux choses dans l'ordre qui compte :
 *
 * 1. **synchroniser** les agendas Google ;
 * 2. **puis** écrire aux habitants.
 *
 * L'ordre n'est pas une commodité : un résumé envoyé avant la
 * synchronisation annoncerait la veille. Autant ne rien envoyer.
 *
 * Le nom de la route reste `sync-calendars` alors qu'elle fait plus
 * que ça. C'est assumé : le renommer changerait le chemin déclaré dans
 * `vercel.json`, et un cron qui pointe vers une route disparue échoue
 * sans bruit — exactement la panne silencieuse que la phase 4 a déjà
 * payée une fois.
 *
 * La synchronisation porte en plus la relecture complète hebdomadaire,
 * celle qui fait avancer l'horizon des événements récurrents.
 */

// Une famille peut avoir une quinzaine d'agendas ; chacun demande un
// ou deux allers-retours chez Google. Les emails s'ajoutent derrière.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  /* Vercel Cron signe ses appels avec `CRON_SECRET`. Sans ce contrôle,
     l'URL serait publique : n'importe qui pourrait déclencher autant de
     synchronisations qu'il veut et nous faire dépasser les quotas
     Google. */
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[casa] CRON_SECRET manquant — synchronisation refusée");
    return NextResponse.json({ error: "cron non configuré" }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: connections, error } = await supabase
    .from("calendar_connections")
    .select("*")
    // Une connexion à reconnecter ne se répare pas toute seule : la
    // retenter à chaque passage pilonnerait Google pour rien, et
    // pourrait finir par nous faire limiter.
    .eq("needs_reauth", false);

  if (error) {
    console.error("[casa] lecture des connexions échouée", error.message);
    return NextResponse.json({ error: "lecture impossible" }, { status: 500 });
  }

  const tally = { ok: 0, reauth: 0, gone: 0, error: 0 };

  for (const connection of connections ?? []) {
    // Séquentiel, volontairement. Une famille a quelques agendas : le
    // parallélisme ne gagnerait que quelques secondes, et rendrait le
    // profil de charge chez Google inutilement pointu.
    const outcome = await syncConnection(connection);
    tally[outcome.status] += 1;

    if (outcome.status === "error") {
      console.error(
        `[casa] synchronisation échouée (${connection.external_calendar_id})`,
        outcome.message,
      );
    }
  }

  /* Les résumés viennent APRÈS, avec des agendas à jour.

     Ils ne dépendent pas du succès de la synchronisation : si Google
     boude, la maison a quand même ses propres événements à annoncer.
     Ce serait une drôle de règle que de se taire sur le déjeuner de
     dimanche parce qu'un jeton OAuth a expiré. */
  const digests = await sendDigests(nowMs(), await appOrigin());

  return NextResponse.json({
    synchronises: connections?.length ?? 0,
    ...tally,
    emails: digests,
  });
}
