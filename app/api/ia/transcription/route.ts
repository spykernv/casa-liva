import { NextResponse } from "next/server";
import {
  MAX_BYTES,
  NothingHeardError,
  transcribeAudio,
} from "@/lib/voice/transcribe";
import { VoiceUnavailableError } from "@/lib/voice/elevenlabs";
import { getUserId } from "@/lib/data/casa";

/* ═══════════════════════════════════════════════════════════════
   « Parler plutôt que taper » — la seule porte d'entrée du micro.

   Même forme que `/api/ia/voix` et pour les mêmes raisons : aucune clé
   ne sort du serveur, et la route est **volontairement absente de
   `PUBLIC_PREFIXES`** — le proxy exige la session avant même d'y
   arriver, et le handler la revérifie de son côté.

   **La seule différence de forme du dépôt** : elle lit un
   `multipart/form-data`, pas du JSON. C'est la première route à le
   faire, et la raison est bête — on envoie un fichier.

   **Ce qui sort d'ici est un texte, et rien d'autre.** Pas
   d'identifiant de transcription, pas de durée, pas de score de
   confiance. Ce que la personne a dicté s'affiche dans son champ de
   saisie ; le reste ne sert qu'à facturer, et n'a rien à faire dans un
   navigateur.
   ═══════════════════════════════════════════════════════════════ */

/** Une transcription prend moins d'une seconde ; ce plafond n'est qu'une butée. */
export const maxDuration = 30;

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Il faut être connecté." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Je n’ai rien reçu à écouter." }, { status: 400 });
  }

  /* Le plafond est **ici**, pas seulement dans le navigateur : celui-ci
     décide de la durée d'enregistrement, et un client bricolé n'a aucune
     raison de s'en tenir à la minute qu'on lui demande. ElevenLabs
     facture à la durée de l'audio. */
  if (audio.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "C’est un peu long pour une question. Réessaie plus court." },
      { status: 413 },
    );
  }

  try {
    const text = await transcribeAudio(audio);
    return NextResponse.json({ text });
  } catch (error) {
    /* La clé absente est nommée à l'écran, comme partout ailleurs dans
       la voix : c'est la panne la plus probable d'une mise en
       production, et un message générique la rendrait indébuggable.

       Depuis D39, cette clé est **la même** que celle de la synthèse :
       un compte à sec rend Casa AI sourde et muette d'un coup, sans le
       repli dont l'écrit bénéficie. D'où deux phrases qui ne se
       confondent pas — « t'entendre » et « se faire entendre » ne se
       corrigent pas au même endroit. */
    if (error instanceof VoiceUnavailableError) {
      console.error("[casa-voix] clé absente ou refusée", error.message);
      return NextResponse.json(
        {
          /* « pas configurée » et non « pas de clé » : depuis le
             26 août, ce cas couvre aussi une clé PRÉSENTE et refusée.
             Dire « il n'y en a pas » enverrait chercher au mauvais
             endroit — c'est ce qui a fait durer la panne trois
             semaines. */
          error: "La voix n’est pas configurée correctement côté serveur. Ce n’est pas toi, c’est nous.",
        },
        { status: 503 },
      );
    }

    /* Rien d'audible : **ce n'est pas une erreur technique**, c'est un
       micro effleuré ou une phrase avalée. Ça arrivera tous les jours,
       et la réponse doit donner envie de recommencer plutôt que
       d'annoncer une panne. */
    if (error instanceof NothingHeardError) {
      return NextResponse.json(
        { error: "Je n’ai rien entendu. Réessaie en parlant un peu plus fort ?" },
        { status: 422 },
      );
    }

    // Jamais ce qui a été dicté dans les journaux (§74).
    console.error("[casa-voix] la transcription a échoué", error);
    return NextResponse.json(
      { error: "Casa AI n’a pas réussi à t’entendre. Réessaie." },
      { status: 502 },
    );
  }
}
