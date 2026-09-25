import type { AIProviderName } from "@/types";

/* ═══════════════════════════════════════════════════════════════
   L'interface entre Casa AI et un fournisseur de modèle (§24).

   **Écrite pour ce dont l'application a besoin, pas pour la moyenne de
   deux SDK.** C'est le piège que D10 avait évité pour `CalendarProvider`
   et que JON-51 rappelle dans l'autre sens : une interface modelée sur
   Anthropic serait un emballage Anthropic déguisé, et le second
   fournisseur devrait la casser pour entrer dedans.

   Ce qui diffère le plus entre les deux SDK, ce sont les *tool calls*
   et le *streaming*. Les deux sont traités ici de la même façon :

   - **Tool calls.** Un tour d'assistant porte du texte *et* une liste
     d'appels ; les résultats reviennent dans un tour à part. Anthropic
     les range en blocs dans un message `user`, Groq en messages `tool`
     séparés — les deux se construisent depuis cette forme sans que
     l'une des deux ait à mentir.

   - **Streaming.** `generate()` rend la réponse **entière**. Ce n'est
     pas un oubli : sur une question d'agenda, la latence vient de la
     boucle d'outils (deux allers-retours), pas de la longueur du
     texte — et Casa AI répond court par construction. Le jour où la
     voix (phase 8) en aura besoin, l'ajout se fera par un rappel
     optionnel, sans changer la garantie « la réponse complète est
     rendue » dont dépend l'enregistrement en base.
   ═══════════════════════════════════════════════════════════════ */

/** Schéma JSON de l'objet d'entrée d'un tool. Volontairement lâche : les deux SDK le repassent tel quel. */
export type AIToolSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type AIToolSpec = {
  name: string;
  /** Ce que le tool fait **et quand l'appeler** — c'est la description qui décide du déclenchement. */
  description: string;
  input: AIToolSchema;
};

export type AIToolCall = {
  /** Identifiant rendu par le fournisseur ; il rattache le résultat à l'appel. */
  id: string;
  name: string;
  input: unknown;
};

export type AIToolResult = {
  id: string;
  /** Le résultat, déjà mis en texte par le backend. */
  content: string;
  isError?: boolean;
};

/**
 * Un tour de conversation, dans la forme de Casa Liva.
 *
 * `results` est un rôle à part plutôt qu'un `user` porteur de blocs :
 * c'est ce qui permet à chaque fournisseur de le traduire dans sa
 * propre convention sans qu'aucune des deux ne fuite ici.
 */
export type AITurn =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      calls: AIToolCall[];
      /**
       * L'écho brut du fournisseur, qu'il est seul à savoir relire.
       *
       * Ce n'est pas une fuite d'abstraction, c'est une contrainte
       * réelle : Anthropic exige que les blocs de raisonnement d'un
       * tour lui reviennent **inchangés** avec leur signature, sinon
       * il refuse le tour suivant de la boucle d'outils. Reconstruire
       * le tour depuis `text` + `calls` ne suffit donc pas.
       *
       * Le `provider` est là pour que personne ne relise l'écho d'un
       * autre : si le routeur bascule en cours de boucle, l'écho
       * devient illisible et doit être ignoré, pas traduit.
       */
      raw?: { provider: AIProviderName; blocks: unknown };
    }
  | { role: "results"; results: AIToolResult[] };

/**
 * Le prompt système, coupé en deux **parce que la moitié ne bouge
 * jamais**.
 *
 * `stable` est identique d'une requête à l'autre ; `live` porte
 * l'heure, les habitants et les deux jours qui viennent. La coupure
 * n'est pas une préférence de fournisseur : c'est un fait sur nos
 * données, et chacun l'exploite à sa façon (Anthropic y pose un point
 * de cache, Groq se contente de concaténer). Mélangés, le seul
 * horodatage suffirait à faire payer plein tarif le reste à chaque
 * question — c'est l'invalidateur silencieux n°1 du cache de prompt.
 */
export type AISystem = { stable: string; live: string };

/**
 * Ce que la tâche demande — **pas le nom d'un modèle**.
 *
 * La tentation était d'ajouter `model?: string` et de laisser l'appelant
 * écrire « claude-haiku-4-5 ». Ça marche jusqu'au premier repli : le
 * routeur bascule sur Groq, qui reçoit un identifiant Anthropic et
 * répond `400`. La panne n'arriverait donc **que** les jours où le
 * fournisseur principal est déjà en difficulté — le pire moment, et le
 * plus difficile à reproduire.
 *
 * Chaque fournisseur traduit ce niveau dans son propre catalogue. C'est
 * la même règle que le reste de cette interface : elle décrit le besoin
 * de l'application, jamais la forme d'un SDK.
 *
 * - `standard` — il faut choisir un tool, écrire une date, lire un
 *   résultat, recommencer. Une réponse fausse sur un agenda familial
 *   coûte cher.
 * - `light` — le travail difficile est **déjà fait par notre code** : on
 *   tend une feuille de faits et on demande deux phrases. C'est le cas
 *   du briefing, et c'est exactement ce qu'un petit modèle fait bien.
 */
export type AITier = "light" | "standard";

export type AIInput = {
  system: AISystem;
  turns: AITurn[];
  tools: AIToolSpec[];
  /** Plafond de sortie. Casa AI répond court : le budget sert de garde-fou de coût, pas d'objectif. */
  maxTokens: number;
  /** Défaut : `standard`. Voir `AITier`. */
  tier?: AITier;
};

/** Suivi de coût (§72). Ces deux nombres finissent dans `ai_messages`. */
export type AIUsage = { input: number; output: number };

export type AIResponse = {
  text: string;
  calls: AIToolCall[];
  usage: AIUsage;
  /** L'identifiant exact du modèle qui a répondu — pas la famille. Sans lui, une réponse bizarre est inimputable. */
  model: string;
  /** L'écho à replacer tel quel dans le tour d'assistant — voir `AITurn`. */
  raw?: { provider: AIProviderName; blocks: unknown };
};

export interface AIProvider {
  readonly name: AIProviderName;
  readonly model: string;
  /** `false` quand la clé manque — le routeur passe au suivant sans tenter un appel voué à l'échec. */
  readonly configured: boolean;
  generate(input: AIInput, signal?: AbortSignal): Promise<AIResponse>;
}
