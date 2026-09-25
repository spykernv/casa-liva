"use client";

import { Lock } from "lucide-react";
import type { CasaEvent, FamilyMember, ParticipantStatus } from "@/types";
import { isCasaEvent } from "@/components/calendar/event-block";
import { formatTime } from "@/lib/date";
import { visibleLocation, visibleTitle } from "@/lib/calendar/visible";
import { memberStyle } from "@/lib/design/member-color";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   Une rangée d'événement — pleine largeur (D46).

   **C'est la ligne qui résout le défaut de la recette du 5 août.**
   Dans la grille à sept colonnes, un titre disposait de 27,86 px, soit
   quatre caractères — « Co… », « Rel… » — et de 1,43 px dès que deux
   événements se chevauchaient. Ici :

     375 − 32 (px-4)                              = 343 px de carte
      − 2 bordures − 16 pl-4 − 48 (colonne d'heure)
      − 10 (gap) − 12 (pr-3)                      = 255 px pour le titre

   À 16 px semi-gras, ≈ 31 caractères sur une ligne et ≈ 62 sur deux.
   **27,86 px → 255 px.** Et surtout, la lisibilité ne dépend plus du
   nombre d'événements : deux rendez-vous à 9 h sont deux rangées de
   255 px, pas deux colonnes de 20 px. Le chevauchement cesse d'être un
   problème typographique.

   Le « qui » est écrit **en toutes lettres**, jamais en pile d'avatars
   réduite : c'est le seul écran du produit qui s'appelle « Qui fait
   quoi, et quand ».
   ═══════════════════════════════════════════════════════════════ */

export type EventRowProps = {
  event: CasaEvent;
  members: FamilyMember[];
  meId: string;
  onSelect: () => void;
  /** Rendu à droite — « Je viens » / « Pas dispo » (D50). */
  action?: React.ReactNode;
};

export function EventRow({ event, members, meId, onSelect, action }: EventRowProps) {
  const going = members.filter((m) =>
    event.participants.some((p) => p.userId === m.id && p.status !== "declined"),
  );
  const owner = members.find((m) => m.id === event.creatorId) ?? going[0];
  const casa = isCasaEvent(event);

  const mien: ParticipantStatus | null =
    event.participants.find((p) => p.userId === meId)?.status ?? null;

  const label = visibleTitle(event, owner);
  const lieu = visibleLocation(event);
  const qui = going.map((m) => m.firstName).join(", ");

  return (
    <div
      style={owner ? memberStyle(owner.color) : undefined}
      className="relative overflow-hidden rounded-casa border border-line bg-surface shadow-casa-sm"
    >
      {/* La barre du propriétaire devient neutre dès trois
          participants : au-delà, l'événement est celui de la maison,
          et le teindre aux couleurs d'une personne raconterait autre
          chose que ce qui se passe. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          casa ? "bg-line-strong" : "bg-[var(--m)]",
        )}
      />

      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onSelect}
          className="flex min-h-[4.25rem] min-w-0 flex-1 items-start gap-2.5 py-2.5 pl-4 pr-2 text-left"
        >
          <span className="w-12 shrink-0">
            {event.allDay ? (
              <span className="block text-[1rem] font-semibold text-ink-2">—</span>
            ) : (
              <>
                <span className="block text-[1rem] font-semibold tabular-nums text-ink">
                  {formatTime(event.startAt)}
                </span>
                <span className="mt-0.5 block text-[1rem] tabular-nums text-ink-2">
                  {formatTime(event.endAt)}
                </span>
              </>
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "flex items-start gap-1 text-[1rem] font-semibold leading-tight",
                mien === "declined" ? "text-ink-2 line-through" : "text-ink",
              )}
            >
              {event.isPrivate ? (
                <Lock
                  size={16}
                  strokeWidth={2.4}
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                />
              ) : event.emoji ? (
                <span aria-hidden="true">{event.emoji}</span>
              ) : null}
              <span className="line-clamp-2">{label}</span>
            </span>
            <span className="mt-0.5 block truncate text-[1rem] leading-tight text-ink-2">
              {event.allDay ? "Toute la journée · " : ""}
              {qui}
              {lieu ? ` · ${lieu}` : ""}
            </span>
          </span>
        </button>

        {action && (
          <div className="flex shrink-0 items-center pr-2">{action}</div>
        )}
      </div>
    </div>
  );
}
