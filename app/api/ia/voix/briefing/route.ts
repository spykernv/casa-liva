import { NextResponse } from "next/server";
import { NotSpeakableError, TooLongError, speakBriefing } from "@/lib/voice/speech";
import { VoiceUnavailableError } from "@/lib/voice/elevenlabs";
import { NoProviderError } from "@/lib/ai/router";
import type { BriefingAudience, BriefingScope } from "@/lib/voice/briefing";
import { getUserId } from "@/lib/data/casa";
import { nowMs } from "@/lib/clock";
import { addDays } from "date-fns";
import { casaStartOfDay, parseCasaDay } from "@/lib/date";

/* ═══════════════════════════════════════════════════════════════
   Le briefing du jour et de la semaine, à écouter (§27).

   **Cette route reçoit ce qu'il faut lire, jamais le texte à dire.**
   C'est toute la différence entre elle et un proxy vers ElevenLabs, et
   c'est la contrainte que JON-56 rendait non évidente : `speakMessage`
   relit son texte dans `ai_messages`, mais un briefing n'a **aucune
   ligne** là-dedans — personne n'a rien demandé par écrit. La solution
   facile aurait été d'envoyer le résumé affiché depuis le navigateur ;
   elle aurait fait dire à Casa AI exactement ce qu'on lui donne, donc
   n'importe quoi, et le masquage n'aurait plus rien garanti (D36).

   Le navigateur n'envoie donc que deux choses, toutes deux relues :

   - `quoi` — `aujourdhui` ou `semaine`, et rien d'autre ;
   - `jour` — facultatif, `AAAA-MM-JJ`, pour la semaine qu'on regarde ;
   - `pour` — facultatif, `maison` ou `moi` (D48). Le navigateur dit de
     QUI il veut entendre parler, jamais ce qu'il faut dire : le
     filtrage se fait ici, par `mine()`, sur des événements déjà lus
     sous la session de la personne.

   Comme `/api/ia/chat` et `/api/ia/voix`, elle est **volontairement
   absente de `PUBLIC_PREFIXES`** : le proxy exige la session avant même
   d'y arriver, et le handler la revérifie de son côté.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Un briefing coûte un appel au modèle **puis** un appel à ElevenLabs.
 * Le routeur abandonne un fournisseur lent au bout de vingt secondes ;
 * ce plafond doit rester au-dessus de la somme des deux.
 */
export const maxDuration = 60;

/**
 * Jusqu'où on accepte de regarder, dans les deux sens.
 *
 * La vue semaine navigue sur 52 semaines de part et d'autre : la borne
 * doit les couvrir. Au-delà, ce n'est plus quelqu'un qui écoute son
 * agenda, c'est quelqu'un qui balaie le calendrier — et chaque balayage
 * coûte un appel au modèle et un appel à la synthèse.
 */
const HORIZON_DAYS = 400;

const SCOPES: BriefingScope[] = ["aujourdhui", "semaine"];

/* `find` sur une liste fermée, jamais un cast — la même forme que
   `SCOPES`. Et un **défaut** plutôt qu'un 400 quand le champ manque :
   un vieux bundle servi juste après un déploiement n'envoie pas
   `pour`, et doit obtenir le briefing d'hier, pas une erreur. */
const AUDIENCES: BriefingAudience[] = ["maison", "moi"];

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Il faut être connecté." }, { status: 401 });
  }

  let body: { quoi?: unknown; jour?: unknown; pour?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const scope = SCOPES.find((s) => s === body.quoi);
  if (!scope) {
    return NextResponse.json({ error: "Rien à lire." }, { status: 400 });
  }

  const audience = AUDIENCES.find((a) => a === body.pour) ?? "maison";

  const now = nowMs();

  /* `parseCasaDay` refuse ce qui n'est pas une vraie date — report de
     mois compris — et rend minuit **dans le fuseau de la maison**.
     `new Date("2026-08-08")` aurait rendu minuit UTC, soit la veille à
     22 h à Paris : un briefing décalé d'un jour, sans la moindre erreur
     visible. */
  const asked = typeof body.jour === "string" ? body.jour : undefined;
  const day = asked === undefined ? casaStartOfDay(now).getTime() : parseCasaDay(asked, now);

  if (day === null) {
    return NextResponse.json({ error: "Ce jour ne se lit pas." }, { status: 400 });
  }

  /* `addDays` et non `HORIZON_DAYS * 86 400 000` (JON-60, dixième
     site). 400 jours d'horloge ne font pas 400 × 24 h : l'écart d'une
     heure décale la borne, et le jour situé pile à l'horizon se voyait
     refuser un briefing que la borne était censée autoriser. */
  const floor = addDays(casaStartOfDay(now), -HORIZON_DAYS).getTime();
  const ceiling = addDays(casaStartOfDay(now), HORIZON_DAYS).getTime();
  if (day < floor || day > ceiling) {
    return NextResponse.json({ error: "C’est un peu loin pour un briefing." }, { status: 400 });
  }

  try {
    const audio = await speakBriefing(scope, day, now, audience);
    return NextResponse.json(audio);
  } catch (error) {
    /* Les clés absentes sont nommées à l'écran, comme pour Casa AI :
       c'est la panne la plus probable d'une mise en production, et un
       message générique la rendrait indébuggable. Elles ne révèlent
       rien. Deux services, donc deux messages : un briefing peut
       échouer parce qu'il n'a pas été **écrit**, ou parce qu'il n'a pas
       été **dit** — deux pannes, deux corrections différentes. */
    if (error instanceof NoProviderError) {
      /* Le message ne dit pas « clé manquante » tout court, et c'est
         voulu : le routeur lève aussi cette erreur quand **tous** les
         fournisseurs sont au coin après un 429. Accuser la clé serait
         alors faux, et enverrait chercher pendant une heure quelque
         chose qui est en place. */
      console.error("[casa-voix] aucun fournisseur d'IA pour écrire le briefing");
      return NextResponse.json(
        {
          error:
            "Aucun modèle n’est disponible pour écrire ton briefing — clé manquante côté serveur, ou quota atteint.",
        },
        { status: 503 },
      );
    }

    if (error instanceof VoiceUnavailableError) {
      console.error("[casa-voix] clé absente ou refusée", error.message);
      return NextResponse.json(
        {
          /* Même message que les trois autres portes de la voix : ce
             cas couvre une clé absente ET une clé refusée, et « pas de
             clé » enverrait chercher au mauvais endroit. Oublié au
             premier jet — vu en lisant la réponse de production, pas en
             relisant le diff. */
          error: "La voix n’est pas configurée correctement côté serveur. Ce n’est pas toi, c’est nous.",
        },
        { status: 503 },
      );
    }

    if (error instanceof NotSpeakableError) {
      return NextResponse.json({ error: "Il n’y a rien à lire ici." }, { status: 404 });
    }

    if (error instanceof TooLongError) {
      return NextResponse.json(
        { error: "Ce briefing est trop long pour être lu." },
        { status: 413 },
      );
    }

    // Jamais le contenu de l'agenda dans les journaux (§74).
    console.error("[casa-voix] le briefing a échoué", error);
    return NextResponse.json(
      { error: "Casa AI n’a pas réussi à préparer ton briefing. Réessaie." },
      { status: 502 },
    );
  }
}
