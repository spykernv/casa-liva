import "server-only";
import type { AIProviderName } from "@/types";
import type { AIInput, AIProvider, AIResponse } from "@/lib/ai/types";
import { anthropicProvider } from "@/lib/ai/anthropic";
import { groqProvider } from "@/lib/ai/groq";

/* ═══════════════════════════════════════════════════════════════
   Le routeur — qui répond, et ce qui se passe quand il ne répond pas.

   **Ce que le routeur tranche**, dans l'ordre où les questions se
   posent (JON-51) :

   1. **Quand basculer ?** Trois signaux, trois comportements :
      - *panne* (réseau, 5xx, refus) → on bascule tout de suite ;
      - *lenteur* → un délai est armé sur chaque appel ; dépassé, on
        bascule. Sans lui, une seule requête lente tient la page en
        otage bien au-delà des quinze secondes du produit ;
      - *quota* (429) → on bascule **et** on met le fournisseur au coin
        pour quelques minutes, sinon chaque question suivante repaie le
        même délai avant de retomber au même endroit.

   2. **Une bascule silencieuse est-elle honnête ?** Non, et l'appelant
      reçoit de quoi le dire : `fellBack` remonte jusqu'à l'écran, qui
      mentionne discrètement que la réponse vient du modèle rapide. En
      phase 9, où l'IA proposera des actions, la réponse deviendra plus
      stricte que « on le mentionne ».

   3. **Qui répond en premier ?** Anthropic, pour tout le monde, pour
      l'instant — voir `order()`.

   **La mise au coin ne survit pas au processus**, et c'est assumé :
   sur Vercel, chaque instance a la sienne. Ça suffit pour amortir une
   rafale de questions ; ça ne prétend pas être un compteur de quota.
   ═══════════════════════════════════════════════════════════════ */

/** Au-delà, on n'attend plus : on demande à l'autre. */
const DEADLINE_MS = 20_000;

/** Combien de temps un fournisseur rationné reste au coin. */
const COOLDOWN_MS = 5 * 60_000;

const benched = new Map<AIProviderName, number>();

function available(provider: AIProvider): boolean {
  if (!provider.configured) return false;
  const until = benched.get(provider.name);
  return until === undefined || until < Date.now();
}

/**
 * L'ordre dans lequel on essaie les fournisseurs.
 *
 * **Anthropic d'abord, pour toutes les questions.** C'est le seuil que
 * le ticket invite à discuter : router « résume ma semaine » vers le
 * modèle rapide économiserait des centimes et une seconde. On ne le
 * fait pas encore, et la raison n'est pas la prudence — c'est que la
 * question la plus banale est aussi celle qui demande le plus
 * d'arithmétique de dates, et qu'une réponse fausse sur un agenda
 * familial coûte infiniment plus qu'une réponse lente. On mesurera
 * d'abord.
 *
 * La couture est posée : le jour où l'on aura des mesures, la décision
 * se prend **ici**, une fois, et non recopiée à chaque appel.
 */
function order(providers: AIProvider[]): AIProvider[] {
  const forced = process.env.CASA_AI_PROVIDER as AIProviderName | undefined;
  if (!forced) return providers;
  return [...providers].sort((a, b) =>
    a.name === forced ? -1 : b.name === forced ? 1 : 0,
  );
}

export type AIAnswer = {
  response: AIResponse;
  provider: AIProviderName;
  /** Vrai quand ce n'est pas le fournisseur préféré qui a répondu. */
  fellBack: boolean;
};

export class NoProviderError extends Error {}

/**
 * Pose la question au premier fournisseur qui répond.
 *
 * Ne rend jamais une réponse à moitié : soit un fournisseur a répondu
 * en entier, soit l'appel lève. C'est ce qui permet à l'appelant
 * d'enregistrer un message complet en base, ou rien.
 */
export async function ask(input: AIInput): Promise<AIAnswer> {
  const candidates = order([anthropicProvider(), groqProvider()]).filter(available);

  if (candidates.length === 0) {
    throw new NoProviderError(
      "Aucun fournisseur d'IA n'est configuré (ni ANTHROPIC_API_KEY ni GROQ_API_KEY).",
    );
  }

  let last: unknown;

  for (const [index, provider] of candidates.entries()) {
    const clock = new AbortController();
    const timer = setTimeout(() => clock.abort(), DEADLINE_MS);

    try {
      const response = await provider.generate(input, clock.signal);
      return { response, provider: provider.name, fellBack: index > 0 };
    } catch (error) {
      last = error;

      const reason = String(error);
      if (reason.includes("429")) {
        benched.set(provider.name, Date.now() + COOLDOWN_MS);
      }

      // Le motif, jamais le contenu de la conversation (§74).
      console.error(`[casa-ai] ${provider.name} n'a pas répondu : ${reason.slice(0, 200)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw last instanceof Error ? last : new Error("aucun fournisseur n'a répondu");
}
