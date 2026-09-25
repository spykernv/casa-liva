import { NextResponse } from "next/server";
import { NotSpeakableError, previewVoice } from "@/lib/voice/speech";
import { VoiceUnavailableError } from "@/lib/voice/elevenlabs";
import { getUserId } from "@/lib/data/casa";

/* ═══════════════════════════════════════════════════════════════
   L'aperçu de cinq secondes — on écoute une voix avant de la prendre.

   Deux choses ne viennent **pas** du navigateur, et c'est ce qui
   distingue cette route d'un proxy vers ElevenLabs :

   - **la phrase**, écrite dans `lib/voice/voices.ts` ;
   - **la voix**, qui doit figurer dans la liste ou être refusée.

   Sans ces deux verrous, n'importe qui ferait dire n'importe quoi à
   n'importe quelle voix du catalogue, sur le quota du compte.
   ═══════════════════════════════════════════════════════════════ */

export const maxDuration = 60;

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Il faut être connecté." }, { status: 401 });
  }

  let body: { voiceId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const voiceId = typeof body.voiceId === "string" ? body.voiceId : "";

  try {
    const audio = await previewVoice(voiceId);
    return NextResponse.json(audio);
  } catch (error) {
    if (error instanceof VoiceUnavailableError) {
      console.error("[casa-voix] clé absente ou refusée", error.message);
      return NextResponse.json(
        { error: "La voix n’est pas configurée correctement côté serveur. Ce n’est pas toi, c’est nous." },
        { status: 503 },
      );
    }

    if (error instanceof NotSpeakableError) {
      return NextResponse.json({ error: "Cette voix n’existe pas." }, { status: 400 });
    }

    console.error("[casa-voix] aperçu impossible", error);
    return NextResponse.json(
      { error: "L’aperçu n’a pas pu être créé. Réessaie." },
      { status: 502 },
    );
  }
}
