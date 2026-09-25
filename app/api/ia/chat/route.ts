import { NextResponse } from "next/server";
import { askCasaAI } from "@/lib/ai/chat";
import { NoProviderError } from "@/lib/ai/router";
import { getUserId } from "@/lib/data/casa";

/* ═══════════════════════════════════════════════════════════════
   Le chat de Casa AI — la seule porte d'entrée.

   **Aucune clé d'IA ne sort d'ici.** C'est une règle d'`AGENTS.md`,
   pas une préférence : le chemin est toujours
   `navigateur → backend Casa Liva → API externe`, et il n'existe
   aucune variable `NEXT_PUBLIC_*` pour Anthropic ou Groq.

   Cette route est **volontairement absente de `PUBLIC_PREFIXES`** : le
   proxy exige la session avant même d'arriver ici, et le handler la
   revérifie de son côté — le proxy est un filet, pas une frontière.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Une boucle d'outils, c'est deux appels de modèle : le plafond par
 * défaut de Vercel les coupe au milieu. Le routeur, lui, abandonne
 * bien avant — celui-ci n'est qu'une butée.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Il faut être connecté." }, { status: 401 });
  }

  let body: { question?: unknown; conversationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête illisible." }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "Pose une question." }, { status: 400 });
  }

  const conversationId =
    typeof body.conversationId === "string" ? body.conversationId : undefined;

  try {
    const answer = await askCasaAI({ question, conversationId });
    return NextResponse.json(answer);
  } catch (error) {
    /* La clé absente est le seul cas qu'on nomme à l'écran, et c'est
       délibéré : c'est la panne la plus probable d'une mise en
       production (les deux clés n'ont jamais servi côté Vercel), et
       la seule qu'un message générique rendrait indébuggable. Elle ne
       révèle rien — savoir qu'une clé manque n'aide personne à entrer. */
    if (error instanceof NoProviderError) {
      console.error("[casa-ai] aucun fournisseur configuré");
      return NextResponse.json(
        {
          error:
            "Casa AI n’a pas de clé côté serveur — elle ne peut pas répondre pour le moment.",
        },
        { status: 503 },
      );
    }

    // Jamais la question ni la réponse dans les journaux (§74).
    console.error("[casa-ai] la conversation a échoué", error);
    return NextResponse.json(
      { error: "Casa AI n’a pas réussi à répondre. Réessaie dans un instant." },
      { status: 502 },
    );
  }
}
