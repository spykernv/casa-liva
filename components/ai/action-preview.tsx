"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, Trash2, X } from "lucide-react";
import type { Catalogue, FamilyMember } from "@/types";
import { Button } from "@/components/ui/button";
import { EventCard } from "@/components/events/event-card";
import { UndoBar } from "@/components/events/undo-bar";
import {
  EventForm,
  instantsOf,
  valuesFromEvent,
  type EventFormValues,
} from "@/components/events/event-form";
import { confirmDraft, undoDraft } from "@/actions/ia";
import type { DraftHandout } from "@/lib/ai/chat";
import { formatDayLong, formatTime, weeksFromNow } from "@/lib/date";
import { nowMs } from "@/lib/clock";

/* ═══════════════════════════════════════════════════════════════
   L'aperçu — ce qu'on valide, et pas ce qu'on nous promet.

   **Un bouton dit ce qu'on va faire ; il ne montre pas ce que ça
   donnera** (D22). Le plan proposait `[ Créer le golf ⛳ ]` ; ça
   suffirait si la demande était tapée et relue. Elle ne l'est pas : la
   voix se trompe en silence — un prénom pris pour un mot courant, une
   date pour une autre, une heure sur deux dans une cuisine bruyante.
   Confirmer une interprétation qu'on n'a pas vue revient à signer en
   blanc.

   **« Corriger » n'appelle pas le modèle.** `loadHistory()` jette les
   allers-retours d'outils : au tour suivant, il ne voit plus ni
   l'appel ni son résultat, donc il ne corrigerait pas l'événement, il
   le réinventerait. Les champs s'ouvrent déjà remplis, et c'est tout —
   zéro token, zéro attente, et le budget des quinze secondes tient.
   ═══════════════════════════════════════════════════════════════ */

export type ActionPreviewProps = {
  draft: DraftHandout;
  members: FamilyMember[];
  meId: string;
  /** Les raccourcis de la maison, passés au formulaire (D45). */
  catalogue: Catalogue;
  /** Ce que le micro a entendu, quand la demande a été dictée (JON-40). */
  heard?: string;
};

type Mode = "apercu" | "corriger" | "cree" | "abandonne";

/**
 * Les mots de chaque action.
 *
 * Un seul composant pour les trois, mais **jamais les mêmes mots** :
 * « Créer » sur une suppression serait au mieux déroutant, au pire une
 * erreur de doigt qu'on ne peut pas reprendre.
 */
const MOTS = {
  create_event: {
    titre: "Rien n’est encore enregistré",
    bouton: "Créer",
    fait: "c’est dans l’agenda.",
  },
  modify_event: {
    titre: "Rien n’a encore bougé",
    bouton: "Déplacer",
    fait: "c’est modifié.",
  },
  delete_event: {
    titre: "Rien n’est encore supprimé",
    bouton: "Supprimer",
    fait: "c’est supprimé.",
  },
} as const;

export function ActionPreview({ draft, members, meId, catalogue, heard }: ActionPreviewProps) {
  const [mode, setMode] = useState<Mode>("apercu");
  const [error, setError] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const [annule, setAnnule] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirm(corrections?: Parameters<typeof confirmDraft>[1]) {
    setError(null);
    startTransition(async () => {
      const result = await confirmDraft(draft.token, corrections);
      if (!result.ok) {
        setError(result.error);
        // « C'est déjà fait » n'est pas un échec dont on se relève en
        // réappuyant : on ferme l'aperçu plutôt que de laisser un
        // bouton qui ne peut plus rien faire.
        if ("deja" in result && result.deja) setMode("cree");
        return;
      }
      setMode("cree");
      setCreatedAt(new Date(corrections?.startAt ?? draft.event.startAt).getTime());
      /* La grille est revalidée par `createEvent` ; `/ia`, non — elle
         n'affiche aucun événement. Ce rafraîchissement-ci sert à ce
         que revenir sur la conversation plus tard reparte d'un état
         juste plutôt que du cache d'avant la création. */
      router.refresh();
    });
  }

  if (mode === "abandonne") return null;

  if (mode === "cree") {
    return (
      <div className="mt-2 rounded-casa-md border border-success/40 bg-success-soft px-4 py-3">
        {/* `UndoBar` n'est montée que sur les deux grilles — jamais sur
            `/ia`, qui est pourtant l'écran où les suppressions vont
            devenir fréquentes (JON-66). Le filet suit donc l'action,
            pas l'écran. Et il ne s'affiche que sur une suppression :
            une création qu'on regrette se supprime, elle ne s'annule
            pas — le chemin existe déjà, dans la grille. */}
        {draft.kind === "delete_event" && (
          <UndoBar
            label={annule ? null : `« ${draft.event.title} » supprimé`}
            onUndo={async () => {
              const remis = await undoDraft(draft.token);
              if (!remis.ok) setError(remis.error);
              else setAnnule(true);
            }}
            onDismiss={() => setAnnule(true)}
          />
        )}
        <p className="flex items-center gap-2 text-[0.9375rem] font-semibold text-success">
          <Check size={18} strokeWidth={2.8} aria-hidden="true" />
          {draft.event.emoji ? `${draft.event.emoji} ` : ""}
          {draft.event.title} — {MOTS[draft.kind].fait}
        </p>
        {createdAt !== null && draft.kind !== "delete_event" && (
          <Link
            href={`/semaine?s=${weeksFromNow(createdAt, nowMs())}`}
            className="mt-1 inline-block text-[0.875rem] font-semibold text-accent"
          >
            Voir dans la semaine
          </Link>
        )}
        {error && (
          <p role="alert" className="mt-1 text-[0.875rem] text-ink-2">
            {error}
          </p>
        )}
      </div>
    );
  }

  if (mode === "corriger") {
    return (
      <div className="mt-2 rounded-casa-md border border-line bg-surface px-4 pb-4 pt-3 shadow-casa-sm">
        <EventForm
          members={members}
          meId={meId}
          catalogue={catalogue}
          initial={valuesFromEvent(draft.event)}
          submitLabel={MOTS[draft.kind].bouton}
          pendingLabel="On enregistre…"
          pending={pending}
          error={error}
          autoFocusTitle={false}
          onSubmit={(v: EventFormValues) =>
            confirm({
              title: v.title,
              emoji: v.emoji ?? "",
              location: v.location,
              ...instantsOf(v),
              participantIds: v.invited,
              rappelMinutes: v.rappelMinutes,
            })
          }
          secondary={
            <Button
              variant="secondary"
              size="lg"
              block
              disabled={pending}
              onClick={() => setMode("apercu")}
            >
              Retour
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-casa-md border border-line bg-surface px-4 pb-4 pt-3 shadow-casa-sm">
      {/* La phrase qui rend impossible la contradiction entre l'écran
          et ce que le modèle a écrit au-dessus. S'il conclut « c'est
          créé ! » — ce que le prompt lui interdit trois fois — la
          personne a la vérité sous les yeux, au même endroit que le
          bouton. */}
      {/* « J'ai entendu : … », **à côté de l'aperçu et pas seulement
          avant l'envoi** (D22, JON-40). C'est ce qui permet de dire, en
          un regard, si l'erreur vient du micro ou de la compréhension —
          deux pannes, deux corrections différentes. Et corriger un mot
          coûte moins cher que redire toute sa phrase. */}
      {heard && (
        <p className="mb-2.5 text-[0.875rem] italic leading-relaxed text-ink-2">
          J’ai entendu&nbsp;: «&nbsp;{heard}&nbsp;»
        </p>
      )}

      <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-ink-3">
        {MOTS[draft.kind].titre}
      </p>

      <div className="mt-2">
        <EventCard
          event={preview(draft)}
          members={members}
          // Le statut ne s'affiche que si on l'a **vraiment** : sur une
          // suppression, l'événement a été relu en base et ces réponses
          // sont ce qu'on s'apprête à effacer. Sur une création,
          // personne n'a rien répondu — afficher « n'a pas répondu »
          // pour tout le monde serait exact et inutile ; l'afficher sur
          // une suppression sans les avoir lues serait faux.
          showStatus={Boolean(draft.event.participants)}
        />
      </div>

      {/* Ce que ça remplace. Sans cette ligne, « décale le golf à 14h »
          affiche un événement à 14h — et on n'a aucun moyen de voir
          s'il s'agit bien de celui qu'on voulait déplacer. */}
      {draft.kind === "modify_event" && (
        <p className="mt-3 text-[0.875rem] text-ink-2">
          Aujourd’hui&nbsp;: <s>{quand(draft.avant)}</s>
        </p>
      )}

      {/* Le second garde-fou de la suppression (D41) : dire que le
          serveur a dû **choisir**. « Supprime le déjeuner de dimanche »
          dans une maison qui déjeune tous les dimanches n'a pas une
          réponse, elle en a cinquante-deux. */}
      {"candidats" in draft && draft.candidats > 1 && (
        <p className="mt-3 rounded-casa border border-danger/30 bg-danger-soft px-3 py-2 text-[0.875rem] text-ink">
          <strong className="font-semibold">{draft.candidats} événements</strong> portent
          ce nom. C’est le plus proche qui est montré ici&nbsp;— vérifie que c’est
          le bon.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 text-[0.875rem] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          className="flex-1"
          variant={draft.kind === "delete_event" ? "danger" : "primary"}
          disabled={pending}
          onClick={() => confirm()}
        >
          {draft.kind === "delete_event" ? (
            <Trash2 size={18} strokeWidth={2.2} aria-hidden="true" />
          ) : (
            <Check size={18} strokeWidth={2.4} aria-hidden="true" />
          )}
          {pending ? "…" : MOTS[draft.kind].bouton}
        </Button>
        {/* Pas de « Corriger » sur une suppression : il n'y a rien à
            corriger dans « supprimer ceci ». Si ce n'est pas le bon,
            on laisse tomber et on le redit autrement. */}
        {draft.kind !== "delete_event" && (
          <Button
            variant="secondary"
            className="flex-1"
            disabled={pending}
            onClick={() => {
              setError(null);
              setMode("corriger");
            }}
          >
            <Pencil size={17} strokeWidth={2.2} aria-hidden="true" />
            Corriger
          </Button>
        )}
        {/* Jamais en icône seule, et jamais en rouge : abandonner un
            aperçu ne détruit rien — il n'y a rien à détruire. */}
        <Button
          variant="ghost"
          className="w-full"
          disabled={pending}
          onClick={() => setMode("abandonne")}
        >
          <X size={17} strokeWidth={2.2} aria-hidden="true" />
          Laisser tomber
        </Button>
      </div>
    </div>
  );
}

/**
 * Le brouillon, dans la forme que `EventCard` affiche.
 *
 * Tout le monde en `pending` : un aperçu montre **qui est convié**, pas
 * qui a déjà répondu — personne n'a encore été invité. `showStatus`
 * masque la colonne, ce champ n'est là que pour ne pas griser les
 * avatars.
 */
function preview(draft: DraftHandout) {
  return {
    title: draft.event.title,
    emoji: draft.event.emoji,
    location: draft.event.location,
    startAt: draft.event.startAt,
    endAt: draft.event.endAt,
    allDay: draft.event.allDay,
    participants:
      draft.event.participants ??
      draft.event.participantIds.map((userId) => ({
        userId,
        status: "pending" as const,
      })),
  };
}

/** « Samedi 8 août · 10:00 → 12:00 », pour la ligne « aujourd'hui ». */
function quand(event: { startAt: string; endAt: string; allDay?: boolean }): string {
  if (event.allDay) return `${formatDayLong(event.startAt)} · toute la journée`;
  return `${formatDayLong(event.startAt)} · ${formatTime(event.startAt)} → ${formatTime(event.endAt)}`;
}
