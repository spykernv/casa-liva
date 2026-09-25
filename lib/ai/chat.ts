import "server-only";
import type { AIProviderName } from "@/types";
import type { AITurn } from "@/lib/ai/types";
import { ask } from "@/lib/ai/router";
import { buildSystem } from "@/lib/ai/context";
import { TOOLS, ToolError, runTool, type ToolContext } from "@/lib/ai/tools";
import { saveDraft, type ActionDraft } from "@/lib/ai/drafts";
import { createClient } from "@/lib/supabase/server";
import { getCasaContext } from "@/lib/data/casa";
import { nowMs } from "@/lib/clock";

/* ═══════════════════════════════════════════════════════════════
   La conversation — ce qui relie une question à une réponse.

   Tout ici passe par `createClient()`, donc sous la session de la
   personne. Deux conséquences, et la seconde vaut d'être vue :

   - une conversation est privée **même entre habitants** de la même
     maison (policy `conversations_all_self`, migration 0001) ;
   - une conversation qui n'appartient pas à l'appelant n'est pas
     « refusée », elle est **introuvable**. C'est le bon échec : rien à
     déduire d'une absence.
   ═══════════════════════════════════════════════════════════════ */

/** Combien de messages du passé repartent avec la question. */
const HISTORY = 12;

/** Ce qu'on accepte de lire. Au-delà, ce n'est plus une question, c'est un collage. */
const MAX_QUESTION = 600;

/**
 * Combien d'allers-retours d'outils au maximum.
 *
 * Trois, parce que deux suffisent à toutes les questions du plan
 * (chercher, puis répondre) et que le troisième couvre la correction
 * d'une date mal écrite. Un compteur, et pas un « tant que » : une
 * boucle d'outils sans borne est une facture sans borne.
 */
const MAX_STEPS = 3;

export type AskResult = {
  conversationId: string;
  /**
   * L'identifiant du message enregistré.
   *
   * Il remonte jusqu'au navigateur parce que « Écouter » le renvoie :
   * la voix ne lit **jamais** un texte fourni par le client, elle relit
   * celui-ci en base. C'est ce qui garantit que le texte lu est passé
   * par le masquage, et pas seulement celui qui s'affiche.
   */
  messageId: string;
  text: string;
  provider: AIProviderName;
  /** Le fournisseur par défaut n'a pas répondu — l'écran le dit. */
  fellBack: boolean;
  /**
   * L'aperçu à montrer, s'il y en a un (D41).
   *
   * **Un canal à part, et pas une phrase dans `text`.** Le modèle écrit
   * la prose ; l'aperçu, lui, est fabriqué par le serveur à partir des
   * arguments qu'il a validés. Laisser le modèle *rédiger* l'aperçu
   * reviendrait à faire valider un texte plutôt qu'une action — et
   * c'est exactement la différence entre « voir ce que ça donnera » et
   * « croire ce qu'on nous dit ».
   */
  draft?: DraftHandout;
  /**
   * Le refus, quand une action a été demandée et n'aura pas lieu.
   *
   * **Un fait que le serveur connaît, et pas une lecture de la prose du
   * modèle.** Il est rempli quand un tool d'écriture a été appelé, a
   * refusé, et qu'aucun aperçu n'en est sorti — trois conditions
   * vérifiables, sans aucune expression régulière sur le français.
   *
   * Vu en essayant sur la Preview : demandé de déplacer un rendez-vous
   * Google, le tool a refusé comme il devait, et **le modèle de repli a
   * répondu « je modifie l'appel avec Matthieu — c'est à valider de ton
   * côté ! »**. Aucun aperçu à l'écran, donc rien à valider, et rien
   * n'a bougé en base : la phrase était simplement fausse. C'est
   * exactement la limite que D41 déclare assumer — sauf qu'ici le
   * serveur, lui, sait. Autant le dire.
   */
  refusal?: string;
};

/** Ce que le navigateur reçoit d'un aperçu : de quoi l'afficher, et de quoi le valider. */
export type DraftHandout = { token: string } & ActionDraft;

/** Ce qu'on affiche quand le modèle a tourné sans jamais conclure. */
const GAVE_UP =
  "J’ai regardé les agendas mais je n’arrive pas à en tirer une réponse claire. Repose-moi la question autrement ?";

export async function askCasaAI({
  question,
  conversationId,
}: {
  question: string;
  conversationId?: string;
}): Promise<AskResult> {
  const context = await getCasaContext();
  if (!context) throw new Error("aucune maison");

  const trimmed = question.trim().slice(0, MAX_QUESTION);
  if (!trimmed) throw new Error("question vide");

  const supabase = await createClient();
  const id = await resolveConversation(conversationId, context.familyId, context.me.id);

  /* **Un seul aperçu par question**, et le refus est explicite.
     Sans cette borne, « ajoute un golf samedi et un ciné dimanche »
     rangerait deux brouillons dont un seul s'afficherait : l'autre
     resterait en base, invisible, jusqu'à sa péremption. Deux aperçus
     empilés à l'écran seraient pires encore — on valide le premier en
     croyant valider les deux. Le modèle est renvoyé vers « un à la
     fois », ce qui est aussi la bonne façon de le demander. */
  let proposed: DraftHandout | undefined;
  let refused: string | undefined;

  const ctx: ToolContext = {
    familyId: context.familyId,
    members: context.members,
    meId: context.me.id,
    casa: context,
    now: nowMs(),
    propose: async (draft: ActionDraft) => {
      if (proposed) {
        throw new ToolError(
          "Un aperçu est déjà prêt pour cette demande. On n'en prépare qu'un à la fois : propose celui-ci, et l'autre viendra après.",
        );
      }
      const token = await saveDraft({
        draft,
        familyId: context.familyId,
        conversationId: id,
      });
      proposed = { token, ...draft };
      return token;
    },
  };

  const past = await loadHistory(id);

  // La question est enregistrée **avant** l'appel au modèle : si le
  // fournisseur tombe, la conversation garde une trace de ce qui a été
  // demandé plutôt qu'un trou.
  await supabase.from("ai_messages").insert({
    conversation_id: id,
    role: "user",
    content: trimmed,
  });

  const system = await buildSystem(ctx);
  const turns: AITurn[] = [...past, { role: "user", text: trimmed }];

  let text = "";
  let provider: AIProviderName = "anthropic";
  let model = "";
  let fellBack = false;
  let input = 0;
  let output = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    const last = step === MAX_STEPS - 1;

    /* Au dernier tour, on retire les outils. Le modèle n'a alors plus
       le choix : il doit conclure avec ce qu'il a lu. Sans ça, il en
       redemandait un de plus, sa réponse restait vide, et la personne
       recevait « je n'arrive pas à en tirer une réponse claire » alors
       que tout était déjà sous ses yeux. Vu sur les deux fournisseurs. */
    const answer = await ask({
      system,
      turns,
      tools: last ? [] : TOOLS,
      maxTokens: 4000,
    });

    provider = answer.provider;
    model = answer.response.model;
    fellBack = fellBack || answer.fellBack;
    input += answer.response.usage.input;
    output += answer.response.usage.output;

    turns.push({
      role: "assistant",
      text: answer.response.text,
      calls: answer.response.calls,
      raw: answer.response.raw,
    });

    if (answer.response.calls.length === 0) {
      text = answer.response.text;
      break;
    }

    /* Les tools d'un même tour partent ensemble : le modèle en demande
       souvent deux d'un coup (« que fait Papa demain **et** qui est
       libre samedi »), et les enchaîner doublerait l'attente pour rien.
       `runTool` ne lève pas, donc `all` ne peut pas casser la boucle. */
    const results = await Promise.all(
      answer.response.calls.map((call) => runTool(call, ctx)),
    );

    /* On retient le dernier refus d'un tool **d'écriture**. Un refus de
       lecture ne se retient pas : le modèle corrige sa date et rappelle,
       c'est le fonctionnement normal. Un refus d'écriture, lui, veut
       dire qu'il n'y aura pas d'aperçu — et c'est ce que l'écran doit
       dire si la prose ne le dit pas. */
    answer.response.calls.forEach((call, i) => {
      if (!ECRITURE.has(call.name)) return;
      if (results[i]?.isError) refused = results[i].content;
    });

    turns.push({ role: "results", results });
  }

  const finalText = text.trim() || GAVE_UP;

  /* `provider`, `model` et les deux compteurs de tokens sont remplis
     dès le premier appel, pas « plus tard » (§72). Sans eux, une
     réponse bizarre est inimputable — on ne saurait même pas quel
     modèle l'a produite — et personne ne verrait le contexte grossir. */
  const { data: saved, error: saveError } = await supabase
    .from("ai_messages")
    .insert({
      conversation_id: id,
      role: "assistant",
      content: finalText,
      provider,
      model,
      input_tokens: input,
      output_tokens: output,
    })
    .select("id")
    .single();

  if (saveError || !saved) {
    throw new Error(`réponse non enregistrée : ${saveError?.message}`);
  }

  return {
    conversationId: id,
    messageId: saved.id,
    text: finalText,
    provider,
    fellBack,
    draft: proposed,
    // Un aperçu prêt l'emporte : un refus survenu avant qu'il ne le
    // soit (une date d'abord fausse, puis corrigée) n'a plus rien à
    // annoncer.
    refusal: proposed ? undefined : refused,
  };
}

/**
 * Les tools dont un refus veut dire « il ne se passera rien ».
 *
 * Écrite ici et pas dérivée de `TOOLS` : c'est une décision de
 * comportement, pas une liste technique. `verify:ai` garde par ailleurs
 * la classification complète, et la CI échoue le jour où un tool entre
 * sans avoir été rangé d'un côté ou de l'autre.
 */
const ECRITURE = new Set(["create_event", "modify_event", "delete_event"]);

/**
 * La conversation en cours, ou une neuve.
 *
 * L'identifiant reçu du navigateur n'est pas cru sur parole : on le
 * relit sous la session, et la RLS répond « rien » s'il appartient à
 * quelqu'un d'autre. On repart alors d'une conversation neuve plutôt
 * que d'échouer — l'important est qu'aucun message n'atterrisse dans
 * le fil d'autrui.
 */
async function resolveConversation(
  wanted: string | undefined,
  familyId: string,
  userId: string,
): Promise<string> {
  const supabase = await createClient();

  if (wanted) {
    const { data } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", wanted)
      .maybeSingle();
    if (data) return data.id;
  }

  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({ user_id: userId, family_id: familyId })
    .select("id")
    .single();

  if (error || !data) throw new Error(`conversation impossible : ${error?.message}`);
  return data.id;
}

/**
 * Les derniers échanges, remis dans la forme du modèle.
 *
 * **Les allers-retours d'outils ne sont pas conservés**, seulement les
 * questions et les réponses. Ce n'est pas une économie de place : un
 * agenda relu il y a dix minutes est déjà faux, et le renvoyer
 * apprendrait au modèle à répondre depuis un souvenir périmé plutôt
 * qu'à rappeler le tool. Il relit, c'est le comportement voulu.
 */
async function loadHistory(conversationId: string): Promise<AITurn[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY);

  const rows = (data ?? []).reverse();
  const turns: AITurn[] = [];

  for (const row of rows) {
    if (row.role === "user") turns.push({ role: "user", text: row.content });
    else if (row.role === "assistant") {
      turns.push({ role: "assistant", text: row.content, calls: [] });
    }
  }

  /* Un fournisseur refuse un historique qui commence par l'assistant.
     Ça arrive pour de vrai : la fenêtre de douze messages peut tomber
     juste après une question. On coupe en tête plutôt que de laisser
     l'appel échouer avec un message que personne ne saura relier à ça. */
  while (turns.length > 0 && turns[0].role !== "user") turns.shift();

  return turns;
}
