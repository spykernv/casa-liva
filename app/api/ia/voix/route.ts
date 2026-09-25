import { NextResponse } from "next/server";
import { NotSpeakableError, TooLongError, speakMessage } from "@/lib/voice/speech";
import { VoiceUnavailableError } from "@/lib/voice/elevenlabs";
import { getUserId } from "@/lib/data/casa";

/* ═══════════════════════════════════════════════════════════════
   « Écouter » — la seule porte d'entrée de la synthèse vocale.

   Même forme que `/api/ia/chat`, et pour les mêmes raisons : aucune
   clé ne sort du serveur, et la route est **volontairement absente de
   `PUBLIC_PREFIXES`** — le proxy exige la session avant même d'y
   arriver, et le handler la revérifie de son côté.

   Elle ne prend **que** l'identifiant d'un message. Pas de texte : ce
   qui est lu à voix haute est relu en base, jamais reçu du navigateur.
   ═══════════════════════════════════════════════════════════════ */

/** Une génération dure quelques secondes ; ce plafond n'est qu'une butée. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Il faut être connecté." }, { status: 401 });
  }

  let body: { messageId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  if (!messageId) {
    return NextResponse.json({ error: "Rien à lire." }, { status: 400 });
  }

  try {
    const audio = await speakMessage(messageId);
    return NextResponse.json(audio);
  } catch (error) {
    /* La clé absente est nommée à l'écran, comme pour Casa AI : c'est
       la panne la plus probable d'une mise en production — celle-ci
       n'a jamais servi, nulle part — et un message générique la
       rendrait indébuggable. Elle ne révèle rien. */
    if (error instanceof VoiceUnavailableError) {
      console.error("[casa-voix] clé absente ou refusée", error.message);
      return NextResponse.json(
        { error: "La voix n’est pas configurée correctement côté serveur. Ce n’est pas toi, c’est nous." },
        { status: 503 },
      );
    }

    if (error instanceof NotSpeakableError) {
      // Introuvable et interdit se répondent pareil : il n'y a rien à
      // déduire d'une absence.
      return NextResponse.json({ error: "Il n’y a rien à lire ici." }, { status: 404 });
    }

    if (error instanceof TooLongError) {
      return NextResponse.json(
        { error: "Cette réponse est trop longue pour être lue." },
        { status: 413 },
      );
    }

    // Jamais le texte lu dans les journaux (§74).
    console.error("[casa-voix] la lecture a échoué", error);
    return NextResponse.json(
      { error: "Casa AI n’a pas réussi à se faire entendre. Réessaie." },
      { status: 502 },
    );
  }
}
