"use client";

import { Lock } from "lucide-react";
import type { CasaEvent, FamilyMember } from "@/types";
import { memberStyle } from "@/lib/design/member-color";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   Les journées entières, au-dessus de la grille.

   Elles n'ont pas leur place dedans. Un « Vacances à Nice » qui
   s'étire de minuit à minuit forcerait la grille horaire à afficher
   ses 24 heures — pour toute la famille, tous les jours de la semaine
   concernée — et écraserait visuellement les vrais rendez-vous.

   Un bandeau les dit en une ligne, ce qui est exactement leur nature :
   une couleur de fond pour la journée, pas un créneau.
   ═══════════════════════════════════════════════════════════════ */

/** Une journée entière se range dans le bandeau, pas dans la grille. */
export function isAllDayEvent(event: CasaEvent): boolean {
  return event.allDay === true;
}

export type AllDayRowProps = {
  events: CasaEvent[];
  members: FamilyMember[];
  onSelect?: (event: CasaEvent) => void;
  /** Vue semaine : moins de place, on serre. */
  dense?: boolean;
  className?: string;
};

export function AllDayRow({
  events,
  members,
  onSelect,
  dense = false,
  className,
}: AllDayRowProps) {
  if (events.length === 0) return null;

  return (
    <ul
      className={cn(
        "flex flex-wrap gap-1",
        dense ? "px-0.5 pb-1" : "px-4 pb-2",
        className,
      )}
    >
      {events.map((event) => {
        const owner = members.find((m) => m.id === event.creatorId);
        const label = event.isPrivate
          ? `${owner?.firstName ?? "Quelqu’un"} occupé`
          : event.title;

        return (
          <li key={event.id} className={dense ? "w-full" : undefined}>
            <button
              type="button"
              onClick={onSelect ? () => onSelect(event) : undefined}
              style={owner ? memberStyle(owner.color) : undefined}
              className={cn(
                "flex max-w-full items-center gap-1 rounded-full border-l-[3px] bg-[var(--m-soft)] border-[var(--m)]",
                "text-[var(--m-ink)]",
                dense
                  ? "w-full px-1.5 py-0.5 text-[0.625rem] leading-tight"
                  : "px-2.5 py-1 text-[0.8125rem]",
                "font-semibold",
              )}
            >
              {event.isPrivate ? (
                <Lock size={11} strokeWidth={2.6} aria-hidden="true" className="shrink-0" />
              ) : event.emoji ? (
                <span aria-hidden="true">{event.emoji}</span>
              ) : null}
              <span className="truncate">{label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
