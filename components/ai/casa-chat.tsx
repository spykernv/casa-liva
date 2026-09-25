"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowUp, Bot, RotateCcw, Sparkles } from "lucide-react";
import type { Catalogue, FamilyMember } from "@/types";
import { ActionPreview } from "@/components/ai/action-preview";
import { Listen } from "@/components/ai/listen";
import { MicButton } from "@/components/ai/mic-button";
import type { DraftHandout } from "@/lib/ai/chat";
import { cn } from "@/lib/utils";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  /**
   * L'identifiant en base de la réponse — ce que « Écouter » renvoie
   * au serveur. Absent tant que le message n'est pas enregistré, ce
   * qui n'arrive que pour la question qu'on vient de taper.
   */
  messageId?: string;
  /** Rempli seulement quand ce n'est pas le modèle par défaut qui a répondu. */
  fallback?: boolean;
  /**
   * Le refus d'un tool d'écriture, quand aucun aperçu n'en est sorti.
   *
   * Affiché **à côté** de la réponse, pas dedans : le texte du modèle
   * part en base, et on ne le réécrit pas. Vu sur la Preview, un
   * rendez-vous Google dont on demandait le déplacement — le tool a
   * refusé, et le modèle de repli a répondu « je modifie l'appel avec
   * Matthieu, c'est à valider de ton côté ! ». Rien à valider, rien
   * n'avait bougé, et l'écran ne disait rien.
   */
  refusal?: string;
  /**
   * Ce que le micro a entendu, quand la demande a été dictée (JON-40).
   *
   * **Il reste affiché à côté de l'aperçu, pas seulement avant
   * l'envoi.** Sans lui, on ne peut pas distinguer « le micro a mal
   * entendu » de « Casa AI a mal compris » — deux pannes, deux
   * corrections différentes. Et une personne âgée qui lit « qui est
   * libre semedi » corrige un mot au lieu de recommencer sa phrase.
   */
  heard?: string;
  /**
   * L'aperçu d'action préparé pendant ce tour (D41).
   *
   * **Il ne revient jamais dans l'historique**, et ce n'est pas un
   * oubli : `getLastConversation()` relit `ai_messages`, où rien n'est
   * rangé de l'aperçu. Un brouillon périme en trente minutes, donc
   * réafficher au chargement un aperçu d'hier proposerait de créer un
   * événement dont la date ne veut plus rien dire — et le bouton
   * échouerait au moment précis où on lui fait confiance.
   */
  draft?: DraftHandout;
};

export type CasaChatProps = {
  /** Les raccourcis de la maison, passés au formulaire (D45). */
  catalogue: Catalogue;
  /**
   * On arrive du menu du « + » en ayant choisi de parler (D49).
   * Fait ressortir le micro et annonce ce qu'on peut dire — sans
   * l'ouvrir : voir `app/(app)/ia/page.tsx` pour la raison iOS.
   */
  inviteAuMicro?: boolean;
  suggestions: string[];
  firstName: string;
  /** Pour dessiner les avatars de l'aperçu — jamais pour désigner une cible. */
  members: FamilyMember[];
  meId: string;
};

/**
 * Le fil de Casa AI.
 *
 * **Pas de streaming, et c'est un choix.** Sur une question d'agenda,
 * l'attente vient des deux allers-retours d'outils, pas de la longueur
 * du texte — Casa AI répond en trois phrases. Un curseur qui écrit mot
 * à mot n'aurait rien accéléré ; dire *ce qu'elle est en train de
 * faire*, si. Le jour où la voix lira les réponses (phase 8), la
 * question se reposera dans l'autre sens.
 */
export function CasaChat({
  inviteAuMicro = false,
  suggestions,
  firstName,
  members,
  meId,
  catalogue,
}: CasaChatProps) {
  /* **On repart toujours d'un fil vide** (D44). L'écran ne reprend plus
     la conversation de la veille : `/ia` s'ouvre sur l'accueil et ses
     suggestions, qui sont précisément ce qui apprend ce qu'on peut
     demander — et qu'on ne revoyait jamais après la première question. */
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * La dernière transcription, tant qu'elle n'a pas été retouchée.
   *
   * Comparée au texte envoyé plutôt que suivie par un drapeau : si on
   * corrige un mot avant d'envoyer, ce n'est plus ce que le micro a
   * entendu, et l'afficher comme tel induirait en erreur au moment
   * précis où l'on cherche d'où vient la faute.
   */
  const [heard, setHeard] = useState<string | null>(null);

  const bottom = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  async function send(text: string) {
    const asked = text.trim();
    if (!asked || pending) return;

    const dicte = heard !== null && heard.trim() === asked ? asked : undefined;

    setError(null);
    setQuestion("");
    setPending(true);
    setMessages((prev) => [
      ...prev,
      { id: `moi-${Date.now()}`, role: "user", text: asked },
    ]);

    try {
      const response = await fetch("/api/ia/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: asked, conversationId }),
      });

      /* La session peut avoir expiré pendant que la page était
         ouverte : le proxy répond alors par une redirection vers
         `/connexion`, donc du HTML. Lire ça comme du JSON donnerait
         une erreur incompréhensible à la place de la vraie. */
      if (response.redirected || !response.headers.get("content-type")?.includes("json")) {
        setError("Ta session a expiré. Recharge la page pour te reconnecter.");
        return;
      }

      const data = (await response.json()) as {
        conversationId?: string;
        messageId?: string;
        text?: string;
        fellBack?: boolean;
        draft?: DraftHandout;
        refusal?: string;
        error?: string;
      };

      if (!response.ok || !data.text) {
        setError(data.error ?? "Casa AI n’a pas réussi à répondre.");
        return;
      }

      setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId ?? `casa-${Date.now()}`,
          role: "assistant",
          text: data.text!,
          messageId: data.messageId,
          fallback: data.fellBack,
          draft: data.draft,
          refusal: data.refusal,
          heard: dicte,
        },
      ]);
    } catch {
      setError("Connexion perdue. Réessaie dans un instant.");
    } finally {
      setPending(false);
      field.current?.focus();
    }
  }

  const empty = messages.length === 0;

  /* Repartir de zéro, c'est **oublier l'identifiant** : `askCasaAI` en
     ouvre une neuve dès que le navigateur n'en fournit pas
     (`resolveConversation`). Rien n'est supprimé en base — « Écouter »
     relit le message par son identifiant (D36), et les compteurs de
     tokens y vivent (§72). */
  function repartir() {
    setMessages([]);
    setConversationId(undefined);
    setQuestion("");
    setHeard(null);
    setError(null);
    field.current?.focus();
  }

  return (
    <>
      {/* **En haut du fil, et c'est délibéré** : l'aperçu d'action vit
          en bas, à côté de « Créer ». Un bouton qui efface tout, posé
          près de celui qui valide, finirait par être tapé à sa place —
          et un aperçu abandonné n'est plus validable. */}
      {!empty && (
        <div className="flex justify-end px-4 pt-3">
          <button
            type="button"
            onClick={repartir}
            disabled={pending}
            className={cn(
              "flex min-h-tap items-center gap-1.5 rounded-casa px-3",
              "text-[0.875rem] font-semibold text-ink-2",
              "transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-45",
            )}
          >
            <RotateCcw size={16} strokeWidth={2.4} aria-hidden="true" />
            Nouvelle conversation
          </button>
        </div>
      )}

      {empty ? (
        <Welcome firstName={firstName} />
      ) : (
        <ul className="flex flex-col gap-3 px-4 pt-4">
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn(
                // L'aperçu porte un formulaire et trois boutons de
                // 48 px : à 85 % de la largeur, « Laisser tomber »
                // passait à la ligne au milieu d'un mot.
                message.draft ? "w-full" : "max-w-[85%]",
                message.role === "user" ? "self-end" : "self-start",
              )}
            >
              <div
                className={cn(
                  "whitespace-pre-wrap rounded-casa-md px-4 py-3 text-base leading-relaxed",
                  message.draft && "max-w-[85%]",
                  message.role === "user"
                    ? "bg-accent text-white shadow-casa-accent"
                    : "border border-line bg-surface text-ink shadow-casa-sm",
                )}
              >
                {message.text}
              </div>
              {message.draft && (
                <ActionPreview
                  catalogue={catalogue}
                  draft={message.draft}
                  members={members}
                  meId={meId}
                  heard={message.heard}
                />
              )}
              {message.role === "assistant" && message.messageId && (
                <Listen source={{ kind: "message", messageId: message.messageId }} />
              )}
              {message.refusal && (
                /* Le seul fait dont le serveur soit sûr : une action a
                   été demandée, elle a été refusée, et il n'y a aucun
                   aperçu. Trois conditions vérifiables — pas une
                   lecture du français que le modèle a écrit. */
                <p className="mt-2 rounded-casa border border-line bg-surface-2/70 px-3 py-2 text-[0.875rem] leading-relaxed text-ink-2">
                  <strong className="font-semibold text-ink">Rien n’a été préparé.</strong>{" "}
                  {message.refusal}
                </p>
              )}
              {message.fallback && (
                /* La bascule ne se fait pas en douce : répondre avec un
                   modèle plus faible sans le dire, c'est laisser
                   quelqu'un juger Casa AI sur un essai qu'elle n'a pas
                   passé. */
                <p className="mt-1 px-1 text-[0.8125rem] text-ink-3">
                  Répondu par le modèle rapide — le principal ne répondait pas.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Pas d'`AnimatePresence` ici, et c'est un correctif, pas un
          oubli. Avec elle, l'animation de sortie se jouait bien mais
          le nœud n'était jamais démonté : il restait à `opacity: 0`
          — donc invisible, donc « réparé » en apparence — tout en
          gardant son `role="status"` dans l'arbre d'accessibilité.
          Une liseuse d'écran continuait d'annoncer « Casa AI regarde
          les agendas » longtemps après la réponse. Vu en essayant
          pour de vrai, jamais en relisant le code. */}
      {pending && (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          role="status"
          className="mx-4 mt-3 flex items-center gap-2 self-start rounded-casa-md border border-dashed border-line-strong bg-surface-2/60 px-4 py-3 text-[0.9375rem] text-ink-2"
        >
          <Sparkles size={16} strokeWidth={2.4} className="text-magic" aria-hidden="true" />
          Casa AI regarde les agendas…
        </motion.p>
      )}

      {error && (
        <p
          role="alert"
          className="mx-4 mt-3 rounded-casa bg-danger-soft px-3 py-2.5 text-[0.9375rem] font-medium text-danger"
        >
          {error}
        </p>
      )}

      {empty && (
        <ul className="mt-7 flex flex-col gap-2 px-4">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => send(suggestion)}
                disabled={pending}
                className="flex min-h-12 w-full items-center rounded-casa-md border border-line bg-surface px-4 text-left text-[0.9375rem] font-medium text-ink shadow-casa-sm transition-colors hover:border-line-strong disabled:opacity-45"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div ref={bottom} className="h-4" />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(question);
        }}
        className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-20 mt-6 px-4 md:bottom-6"
      >
        {/* `relative` porte l'état du micro (« J'écoute… 0:04 »), qui
            se pose au-dessus de la rangée plutôt que dedans : un
            message qui s'insère entre les boutons les déplace, et on
            rate celui qu'on visait. */}
        <div className="relative flex items-center gap-2 rounded-casa-xl border border-line bg-bg-elevated p-2 pl-4 shadow-casa-md">
          <label htmlFor="casa-ai-question" className="sr-only">
            Ta question pour Casa AI
          </label>
          <input
            id="casa-ai-question"
            ref={field}
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              // Retouché à la main : ce n'est plus ce que le micro a
              // entendu, et le prétendre ferait chercher la faute au
              // mauvais endroit.
              if (heard !== null && e.target.value.trim() !== heard.trim()) setHeard(null);
            }}
            placeholder="Pose ta question à Casa AI…"
            enterKeyHint="send"
            autoComplete="off"
            maxLength={600}
            disabled={pending}
            className="h-11 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
          />

          {/* **À côté du bouton d'envoi, pas à sa place** : taper reste
              le chemin par défaut dans un train, et parler celui de la
              cuisine. Le texte entendu atterrit dans le champ — il ne
              part pas tout seul, pour qu'on puisse le relire et le
              corriger (D22). */}
          <MicButton
            invite={inviteAuMicro}
            disabled={pending}
            onTexte={(texte) => {
              setQuestion(texte);
              setHeard(texte);
              field.current?.focus();
            }}
          />

          <button
            type="submit"
            disabled={pending || !question.trim()}
            aria-label="Envoyer"
            className={cn(
              // 48×48 comme le micro : la règle du projet est 48 (§48),
              // et deux cibles de tailles différentes côte à côte se
              // ratent d'autant plus qu'on vise la petite.
              "flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-full transition-colors",
              "bg-accent text-white shadow-casa-accent active:scale-95",
              "disabled:bg-surface-2 disabled:text-ink-3 disabled:shadow-none",
            )}
          >
            <ArrowUp size={20} strokeWidth={2.6} aria-hidden="true" />
          </button>
        </div>
      </form>
    </>
  );
}

function Welcome({ firstName }: { firstName: string }) {
  return (
    <section className="flex flex-col items-center px-4 pt-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Bot size={30} strokeWidth={2} aria-hidden="true" />
      </span>
      <h2 className="mt-4 font-display text-[1.375rem] font-semibold text-ink">
        Que veux-tu savoir, {firstName}&nbsp;?
      </h2>
      <p className="mt-1.5 max-w-xs text-[0.9375rem] leading-relaxed text-ink-2">
        Casa AI lit les agendas de la maison, répond, et prépare tes
        événements&nbsp;— tu regardes, et c’est toi qui valides.
      </p>
    </section>
  );
}
