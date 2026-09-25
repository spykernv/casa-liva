import "server-only";
import type { AIInput, AIProvider, AIResponse, AIToolCall } from "@/lib/ai/types";

/* ═══════════════════════════════════════════════════════════════
   Groq — le fournisseur rapide, et le filet (§24, D1).

   **Groq, pas Grok.** La plateforme d'inférence qui sert des modèles
   open source, pas le modèle de xAI. D'où `GROQ_API_KEY`.

   **Et Groq n'a qu'un rôle : celui-ci.** D1 lui destinait aussi la
   transcription de la phase 8, « un fournisseur de moins à installer ».
   L'argument s'est retourné : ElevenLabs est entré dans le projet pour
   la synthèse, et c'est Groq qui serait devenu le fournisseur en trop
   pour ce seul usage. Le micro passe donc par `lib/voice/transcribe.ts`,
   avec la clé d'ElevenLabs (D39).

   Pas de SDK, comme pour Resend : l'API est compatible OpenAI, donc un
   `POST` et un objet JSON. Le paquet ajouterait une dépendance et une
   surface de mise à jour pour envelopper trente lignes de `fetch`.

   Ce qui diffère vraiment d'Anthropic tient en deux points, et c'est
   exactement là que l'interface aurait pu se faire modeler par le
   premier arrivé :

   - les appels d'outils portent leurs arguments en **texte JSON**, pas
     en objet — il faut les relire, et un modèle plus petit produit
     parfois du JSON invalide ;
   - les résultats d'outils voyagent en messages `tool` **séparés**, un
     par appel, là où Anthropic les groupe dans un message `user`.

   Aucun des deux ne remonte plus haut que ce fichier.
   ═══════════════════════════════════════════════════════════════ */

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/** Surchargeable sans redéploiement : le catalogue de Groq bouge plus vite que ce dépôt. */
const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

/**
 * Le niveau `light` de `AITier`, traduit dans le catalogue de Groq.
 *
 * **Il retombe volontairement sur le même modèle.** Ce fichier est le
 * filet : il n'entre en jeu que les jours où le fournisseur principal
 * est déjà tombé, et ce n'est pas le moment de découvrir qu'un modèle
 * plus petit se comporte autrement. Poser `GROQ_MODEL_LIGHT` suffira le
 * jour où on aura mesuré — la couture est là, pas la décision.
 *
 * Ce qui compte ici, c'est que le niveau **ne fuite jamais** d'un
 * fournisseur à l'autre : un identifiant Anthropic envoyé à Groq
 * répondrait `400`, et seulement pendant une panne.
 */
const MODEL_LIGHT = process.env.GROQ_MODEL_LIGHT ?? MODEL;

type GroqMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

type GroqReply = {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: {
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  model?: string;
};

export function groqProvider(): AIProvider {
  const key = process.env.GROQ_API_KEY;

  return {
    name: "groq",
    model: MODEL,
    configured: Boolean(key),

    async generate(input: AIInput, signal?: AbortSignal): Promise<AIResponse> {
      if (!key) throw new Error("GROQ_API_KEY manquante");

      const messages: GroqMessage[] = [
        // Groq n'a pas de point de cache explicite : les deux moitiés
        // du prompt système se recollent, et la coupure ne coûte rien.
        { role: "system", content: `${input.system.stable}\n\n${input.system.live}` },
      ];

      for (const turn of input.turns) {
        if (turn.role === "user") {
          messages.push({ role: "user", content: turn.text });
        } else if (turn.role === "assistant") {
          messages.push({
            role: "assistant",
            content: turn.text || null,
            ...(turn.calls.length > 0
              ? {
                  tool_calls: turn.calls.map((call) => ({
                    id: call.id,
                    type: "function" as const,
                    function: {
                      name: call.name,
                      arguments: JSON.stringify(call.input ?? {}),
                    },
                  })),
                }
              : {}),
          });
        } else {
          for (const result of turn.results) {
            messages.push({
              role: "tool",
              tool_call_id: result.id,
              content: result.content,
            });
          }
        }
      }

      const body = JSON.stringify({
        model: input.tier === "light" ? MODEL_LIGHT : MODEL,
        max_completion_tokens: input.maxTokens,
        messages,
        tools: input.tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input,
          },
        })),
      });

      const post = () =>
        fetch(ENDPOINT, {
          method: "POST",
          signal,
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
          },
          body,
        });

      let response = await post();

      /* `tool_use_failed` : le modèle a voulu appeler un outil et a
         produit du JSON invalide. Ce n'est pas notre requête qui est
         fautive — la même, renvoyée telle quelle, passe la fois
         suivante. Mesuré sur trois séries d'essais, ça arrive environ
         une fois sur six ; sans cette reprise, une question sur six
         échouerait au moment précis où Groq sert de filet, c'est-à-dire
         quand Anthropic est déjà tombé.

         Une seule reprise : si la seconde échoue aussi, ce n'est plus
         de la malchance, et insister coûterait la latence sans rien
         changer. */
      if (response.status === 400) {
        const reason = await response.text();
        if (!reason.includes("tool_use_failed")) {
          console.error(`[casa-ai] Groq a refusé (400)`, reason.slice(0, 200));
          throw new Error("groq 400");
        }
        console.warn("[casa-ai] Groq a raté son appel d'outil — on réessaie une fois");
        response = await post();
      }

      if (!response.ok) {
        // Le motif, jamais le corps de la requête : il porte l'agenda
        // de la maison (§74).
        const reason = await response.text();
        console.error(`[casa-ai] Groq a refusé (${response.status})`, reason.slice(0, 200));
        throw new Error(`groq ${response.status}`);
      }

      const data = (await response.json()) as GroqReply;
      const message = data.choices?.[0]?.message;

      const calls: AIToolCall[] = [];
      for (const call of message?.tool_calls ?? []) {
        if (!call.id || !call.function?.name) continue;
        calls.push({
          id: call.id,
          name: call.function.name,
          // Des arguments illisibles deviennent un objet vide plutôt
          // qu'une exception : le tool répondra « il manque une date »,
          // et le modèle se corrigera. Une conversation ne tombe pas
          // pour une accolade en trop.
          input: safeJson(call.function.arguments),
        });
      }

      return {
        text: (message?.content ?? "").trim(),
        calls,
        model: data.model ?? MODEL,
        usage: {
          input: data.usage?.prompt_tokens ?? 0,
          output: data.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}

function safeJson(raw: string | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    console.warn("[casa-ai] arguments d'outil illisibles côté Groq");
    return {};
  }
}
