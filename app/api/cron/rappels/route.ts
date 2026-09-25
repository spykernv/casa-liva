import { NextResponse, type NextRequest } from "next/server";
import { envoyerRappels } from "@/lib/push/rappels";
import { nowMs } from "@/lib/clock";

/**
 * Le passage des quinze minutes (D54, D56, JON-79).
 *
 * **Une route séparée de `sync-calendars`, et il fallait y penser.**
 * Celle-là tourne une fois par jour et porte les résumés et la
 * synchronisation Google ; y greffer les rappels les rendrait
 * quotidiens, c'est-à-dire inutiles. Et l'inverse — passer tout le
 * quotidien au quart d'heure — ferait quatre-vingt-seize
 * synchronisations Google par jour pour rien.
 *
 * ── Qui l'appelle, et pourquoi pas Vercel ──
 *
 * **Le plan Hobby de Vercel plafonne ses crons à une exécution par
 * jour.** Un rappel « dans 30 minutes » ne peut structurellement pas en
 * sortir. C'est donc un workflow GitHub Actions
 * (`.github/workflows/rappels.yml`) qui frappe cette route toutes les
 * quinze minutes avec le secret partagé : Vercel ne plafonne que *ses*
 * crons, pas les appels entrants. Tranché avec le commanditaire
 * le 25 août (D54), contre le rappel du matin et le plan Pro.
 *
 * Cette route n'est donc **pas** dans `vercel.json` — l'y déclarer
 * ferait un second appel quotidien qui ne servirait à rien.
 *
 * ── La panne à ne pas rejouer ──
 *
 * `/api/cron/` doit rester **hors** du matcher de `proxy.ts`, sinon le
 * proxy répond avant le handler et l'appelant reçoit un `307` vers
 * `/connexion` au lieu d'exécuter quoi que ce soit. C'est arrivé au
 * cron de la phase 4, au désabonnement de la phase 6, à `sw.js` en
 * phase 11, puis aux vidéos d'installation. Le contrôle qui tranche
 * n'est pas « la route est-elle protégée » mais **« répond-elle 401 et
 * non 307 »** — un 307 veut dire injoignable.
 */

// Une famille, une fenêtre de deux heures : c'est court. Mais chaque
// destinataire peut avoir plusieurs appareils, et chaque envoi est un
// aller-retour chiffré vers Apple ou Google.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[casa] CRON_SECRET manquant — rappels refusés");
    return NextResponse.json({ error: "cron non configuré" }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }

  const tally = await envoyerRappels(nowMs());

  /* Le décompte est rendu à l'appelant, et c'est ce que le workflow
     journalise. Sans ça, « les rappels ont cessé » ne se verrait
     nulle part — la panne silencieuse que JON-79 annonce. */
  return NextResponse.json(tally);
}
