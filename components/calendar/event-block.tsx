"use client";

import { Lock } from "lucide-react";
import type { CasaEvent, FamilyMember } from "@/types";
import type { DragMode } from "@/hooks/use-event-drag";
import { AvatarStack } from "@/components/ui/avatar";
import { memberStyle } from "@/lib/design/member-color";
import { formatTime } from "@/lib/date";
import { cn } from "@/lib/utils";

/** À partir de 3 participants, ce n'est plus l'agenda de quelqu'un :
 *  c'est un événement de la maison. Il prend alors une teinte neutre
 *  chaude plutôt que la couleur de son créateur — sinon « Déjeuner
 *  Casa » créé par Mamie ressemblerait à un rendez-vous de Mamie. */
const CASA_EVENT_THRESHOLD = 3;

export function isCasaEvent(event: CasaEvent): boolean {
  return (
    event.participants.filter((p) => p.status !== "declined").length >=
    CASA_EVENT_THRESHOLD
  );
}

export type EventBlockProps = {
  event: CasaEvent;
  members: FamilyMember[];
  /** Qui regarde — seul le créateur peut déplacer son événement (D21). */
  meId: string;
  /** Hauteur disponible, en pixels — décide de la densité affichée. */
  height: number;
  onSelect?: () => void;
  onDragStart?: (e: React.PointerEvent, mode: DragMode) => void;
  dragging?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export function EventBlock({
  event,
  members,
  meId,
  height,
  onSelect,
  onDragStart,
  dragging = false,
  className,
  style,
}: EventBlockProps) {
  const participants = event.participants
    .filter((p) => p.status !== "declined")
    .map((p) => members.find((m) => m.id === p.userId))
    .filter((m): m is FamilyMember => Boolean(m));

  const owner = members.find((m) => m.id === event.creatorId) ?? participants[0];
  const casa = isCasaEvent(event);

  // Trois densités : sous 34 px on ne met que le titre, sous 58 px on
  // ajoute l'heure, au-delà on peut afficher les participants.
  const compact = height < 34;
  const roomy = height >= 58;

  /* Deux raisons de ne pas laisser glisser un événement, et la même
     conséquence : le geste ne doit pas répondre du tout.

     **Importé** — la synchronisation suivante remettrait la version
     Google en place, et le geste aurait donc menti (D13).

     **Celui de quelqu'un d'autre** — seul le créateur modifie son
     événement (D21). La base refuse déjà, mais elle refuse en silence,
     en ne renvoyant aucune ligne : sans ce garde-fou, l'événement
     glisserait joliment sous le doigt avant de revenir en place au
     rafraîchissement suivant.

     Dans les deux cas le panneau de détail dit pourquoi — un geste
     mort sans explication serait juste une panne. */
  const editable = event.source === "casa-liva" && event.creatorId === meId;

  // Sous 40 px, les poignées de redimensionnement se chevaucheraient.
  const resizable = editable && height >= 40 && !event.isPrivate;

  const pending = event.participants.some((p) => p.status === "pending");

  const label = event.isPrivate
    ? `${owner?.firstName ?? "Quelqu’un"} occupé`
    : event.title;

  return (
    <div
      style={{ ...style, ...(owner ? memberStyle(owner.color) : undefined) }}
      className={cn(
        "group absolute overflow-hidden rounded-casa-sm",
        "transition-shadow",
        casa
          ? "border border-line-strong bg-surface"
          : "border-l-[3px] bg-[var(--m-soft)] border-[var(--m)]",
        pending && "border-dashed",
        dragging && "z-30 shadow-casa-lg ring-2 ring-accent",
        className,
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        onPointerDown={editable ? (e) => onDragStart?.(e, "move") : undefined}
        className={cn(
          "block h-full w-full text-left",
          compact ? "px-2 py-0.5" : "px-2 py-1",
          // `touch-action: pan-y` laisse le défilement vertical
          // fonctionner tant que l'appui long n'a pas armé le
          // déplacement.
          "touch-pan-y",
        )}
      >
        <span
          className={cn(
            "flex items-center gap-1 truncate text-[0.8125rem] font-semibold leading-tight",
            casa ? "text-ink" : "text-[var(--m-ink)]",
          )}
        >
          {event.isPrivate ? (
            <Lock size={11} strokeWidth={2.6} aria-hidden="true" className="shrink-0" />
          ) : event.emoji ? (
            <span aria-hidden="true">{event.emoji}</span>
          ) : null}
          <span className="truncate">{label}</span>
        </span>

        {!compact && (
          <span
            className={cn(
              "block truncate text-[0.6875rem] leading-tight tabular-nums",
              casa ? "text-ink-3" : "text-[var(--m-ink)] opacity-70",
            )}
          >
            {formatTime(event.startAt)} → {formatTime(event.endAt)}
          </span>
        )}

        {roomy && participants.length > 1 && (
          <span className="mt-1 flex">
            <AvatarStack
              members={participants}
              size="sm"
              max={4}
              className="scale-[0.72] origin-left"
            />
          </span>
        )}
      </button>

      {resizable && onDragStart && (
        <>
          <span
            role="presentation"
            onPointerDown={(e) => {
              e.stopPropagation();
              onDragStart(e, "resize-start");
            }}
            className="absolute inset-x-0 top-0 h-3 cursor-ns-resize touch-none"
          />
          <span
            role="presentation"
            onPointerDown={(e) => {
              e.stopPropagation();
              onDragStart(e, "resize-end");
            }}
            className="absolute inset-x-0 bottom-0 flex h-3 cursor-ns-resize items-end justify-center touch-none"
          >
            <span
              aria-hidden="true"
              className={cn(
                "mb-0.5 h-0.5 w-6 rounded-full opacity-0 transition-opacity group-hover:opacity-60",
                casa ? "bg-ink-3" : "bg-[var(--m-ink)]",
              )}
            />
          </span>
        </>
      )}
    </div>
  );
}
