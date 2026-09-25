import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AIInput, AIProvider, AIResponse, AIToolCall } from "@/lib/ai/types";

/* ═══════════════════════════════════════════════════════════════
   Anthropic — le fournisseur par défaut (§24).

   Trois choix qui méritent leur ligne, parce qu'ils se paient
   silencieusement quand on les prend à l'envers :

   1. **Le raisonnement reste allumé, à effort bas.** Le couper
      raccourcirait la latence, mais sur ce modèle un raisonnement
      désactivé fait parfois écrire l'appel d'outil *dans le texte* au
      lieu de l'émettre comme appel : le tour réussit, le tool n'est
      jamais exécuté, et rien ne le signale. Exactement la panne
      silencieuse que ce projet a déjà payée deux fois (le cron de la
      phase 4, le désabonnement de la phase 6). L'effort bas donne la
      même économie sans le risque.

   2. **Les blocs du modèle repartent inchangés.** Un tour porteur d'un
      appel d'outil doit revenir avec ses blocs de raisonnement et leur
      signature ; reconstruit à la main, il est refusé. D'où l'écho
      opaque de `AITurn`.

   3. **Le prompt système est coupé en deux, et la coupure est un point
      de cache.** La moitié stable (les règles) est identique à chaque
      question ; l'autre porte l'heure. Mélangées, l'horodatage seul
      ferait repayer les règles à chaque phrase.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Les deux modèles, un par niveau. Surchargeables sans redéploiement —
 * voir D31, et le raisonnement complet en **D40**.
 *
 * **Sonnet pour le courant, et non Opus.** Le premier réglage demandait
 * Opus pour tout, y compris pour dire « il te reste trois choses
 * aujourd'hui » — pris le jour où personne n'avait de mesure. Mesuré
 * depuis, sur une requête triviale : Opus 3 561 ms, Sonnet 1 817,
 * Haiku 751. Sur un téléphone, ça se voit.
 *
 * **Haiku pour le briefing**, parce que le briefing n'a aucun tool : le
 * fuseau, les jours révolus, l'événement à cheval sur minuit et le
 * masquage sont réglés par notre code avant que le modèle ne voie quoi
 * que ce soit. Il ne reste qu'un exercice de style très contraint.
 *
 * L'identifiant est **daté**, pas l'alias : `claude-haiku-4-5` résout
 * aujourd'hui vers `claude-haiku-4-5-20251001`, et un changement
 * silencieux sous nos pieds se verrait à l'oreille avant de se voir
 * dans les journaux.
 */
const MODELS = {
  standard: {
    id: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
    /* Le raisonnement à effort bas — voir le point 1 de l'en-tête. */
    effort: true,
  },
  light: {
    id: process.env.ANTHROPIC_MODEL_LIGHT ?? "claude-haiku-4-5-20251001",
    /* **Et surtout pas ici.** Haiku 4.5 refuse le paramètre :
       `400 — This model does not support the effort parameter`. Envoyé
       quand même, *chaque* briefing aurait échoué et serait retombé sur
       Groq — c'est-à-dire exactement la panne de JON-61, mais causée par
       nous, invisible à l'écran, et payée deux fois. Trouvé en appelant
       le vrai code, pas en le relisant.

       Un petit modèle n'a de toute façon pas de molette de raisonnement
       à baisser : le réglage n'est pas seulement refusé, il n'a pas
       d'objet. Le drapeau appartient donc au **niveau**, pas au modèle —
       surcharger `ANTHROPIC_MODEL_LIGHT` par un modèle qui accepterait
       l'effort le priverait d'un réglage, ce qui ne casse rien. */
    effort: false,
  },
} as const;

/**
 * Plafond de sortie. Il couvre le raisonnement **et** le texte : trop
 * juste, la réponse se coupe au milieu d'une phrase. Casa AI répond en
 * trois phrases, donc l'essentiel de ce budget sert de marge.
 */
const MAX_TOKENS = 4000;

export function anthropicProvider(): AIProvider {
  const key = process.env.ANTHROPIC_API_KEY;

  return {
    name: "anthropic",
    // Ce que le fournisseur annonce, c'est son modèle courant ; celui
    // qui a réellement répondu remonte dans `AIResponse.model`, et c'est
    // celui-là qui finit en base (§72).
    model: MODELS.standard.id,
    configured: Boolean(key),

    async generate(input: AIInput, signal?: AbortSignal): Promise<AIResponse> {
      if (!key) throw new Error("ANTHROPIC_API_KEY manquante");

      /* **L'adresse est écrite ici, pas héritée.** Sans `baseURL`, le
         SDK lit `ANTHROPIC_BASE_URL` dans l'environnement — donc celui
         du **processus parent**, qui gagne toujours sur `.env.local`.
         C'est exactement le piège que ce projet a déjà payé une fois,
         avec la clé qui finissait par `0QAA` : un serveur de dev lancé
         depuis un outil qui pose cette variable enverrait les
         questions ailleurs, et le symptôme — des réponses bizarres, ou
         un repli silencieux sur Groq — ne ressemblerait en rien à sa
         cause. En production, Vercel ne pose pas cette variable : rien
         ne change là-bas, et c'est bien le but. */
      const client = new Anthropic({
        apiKey: key,
        baseURL: "https://api.anthropic.com",
        maxRetries: 1,
      });
      const choisi = MODELS[input.tier ?? "standard"];

      const response = await client.messages.create(
        {
          model: choisi.id,
          max_tokens: input.maxTokens || MAX_TOKENS,
          // Effort bas : une question d'agenda ne demande pas une
          // réflexion profonde, et la latence se voit sur un téléphone.
          // Absent sur le niveau léger, qui n'en veut pas — voir `MODELS`.
          ...(choisi.effort ? { output_config: { effort: "low" as const } } : {}),
          system: [
            {
              type: "text",
              text: input.system.stable,
              cache_control: { type: "ephemeral" },
            },
            { type: "text", text: input.system.live },
          ],
          tools: input.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.input,
          })),
          messages: input.turns.map(toMessage),
        },
        { signal },
      );

      /* Un refus de classificateur revient en 200, pas en erreur. Le
         lire comme une réponse rendrait une bulle vide ; on le fait
         remonter pour que le routeur essaie l'autre fournisseur. */
      if (response.stop_reason === "refusal") {
        throw new Error("réponse refusée par le fournisseur");
      }

      const calls: AIToolCall[] = [];
      let text = "";

      for (const block of response.content) {
        if (block.type === "text") text += block.text;
        else if (block.type === "tool_use") {
          calls.push({ id: block.id, name: block.name, input: block.input });
        }
      }

      const usage = response.usage;

      return {
        text: text.trim(),
        calls,
        model: response.model,
        usage: {
          /* Le prompt **entier**, cache compris. Ces colonnes servent à
             répondre à « est-ce qu'on envoie trop de contexte ? »
             (§71-72) ; ne compter que le non-caché ferait disparaître
             le contexte le jour où le cache marche bien — soit le jour
             où l'on cesserait de voir qu'il grossit. */
          input:
            usage.input_tokens +
            (usage.cache_read_input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0),
          output: usage.output_tokens,
        },
        raw: { provider: "anthropic", blocks: response.content },
      };
    },
  };
}

/** Un tour de Casa Liva, dans la forme d'Anthropic. */
function toMessage(turn: AIInput["turns"][number]): Anthropic.MessageParam {
  if (turn.role === "user") {
    return { role: "user", content: turn.text };
  }

  if (turn.role === "results") {
    // Les résultats d'outils voyagent dans un message `user` : c'est la
    // convention d'Anthropic, et elle ne remonte pas plus haut que ce
    // fichier.
    return {
      role: "user",
      content: turn.results.map((result) => ({
        type: "tool_result" as const,
        tool_use_id: result.id,
        content: result.content,
        ...(result.isError ? { is_error: true } : {}),
      })),
    };
  }

  /* L'écho brut d'abord — c'est le seul chemin qui préserve les blocs
     de raisonnement et leur signature. On ne relit que le nôtre : un
     écho produit par Groq n'a aucun sens ici, et le traduire à moitié
     serait pire que de le jeter. */
  if (turn.raw?.provider === "anthropic") {
    return { role: "assistant", content: turn.raw.blocks as Anthropic.ContentBlockParam[] };
  }

  const content: Anthropic.ContentBlockParam[] = [];
  if (turn.text) content.push({ type: "text", text: turn.text });
  for (const call of turn.calls) {
    content.push({
      type: "tool_use",
      id: call.id,
      name: call.name,
      input: call.input as Record<string, unknown>,
    });
  }
  return { role: "assistant", content: content.length > 0 ? content : "…" };
}
