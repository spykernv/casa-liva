"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { Catalogue, FamilyMember } from "@/types";
import { CreateEventSheet } from "@/components/events/create-event-sheet";
import { valuesFromEvent } from "@/components/events/event-form";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   « ✨ Opportunité Casa » devient un tap (JON-65).

   §36-38 appariait la **suggestion** et l'**action**. On a livré la
   suggestion seule en phase 5, et elle est à l'écran depuis — avec la
   copy exacte du plan, et aucun bouton. Verdict Product Owner : non,
   ça ne compte pas comme fait.

   **Pas de tool, pas de LLM, pas de jeton d'aperçu.** La suggestion
   vient du serveur — `findNextOpportunity` parcourt sept jours, retient
   la première plage d'au moins deux heures où tout le monde est libre,
   et c'est déterministe, local et gratuit. Il n'y a rien à faire
   valider par un humain qu'un humain n'ait déjà sous les yeux : le
   créneau est écrit juste au-dessus du bouton. Ce qui manque, c'est le
   titre — donc un formulaire de création pré-rempli, exactement comme
   dans « Trouver un moment ».
   ═══════════════════════════════════════════════════════════════ */

export type OpportunityActionProps = {
  start: number;
  end: number;
  members: FamilyMember[];
  meId: string;
  /** Les raccourcis de la maison, passés au formulaire (D45). */
  catalogue: Catalogue;
};

export function OpportunityAction({ start, end, members, meId, catalogue }: OpportunityActionProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex min-h-tap flex-1 items-center justify-center gap-1.5 rounded-casa",
          "bg-magic px-4 text-[0.9375rem] font-semibold text-white",
          "shadow-casa-sm transition-transform active:scale-95",
        )}
      >
        <Plus size={18} strokeWidth={2.8} aria-hidden="true" />
        En faire quelque chose
      </button>

      <CreateEventSheet
        open={open}
        onClose={() => setOpen(false)}
        members={members}
        meId={meId}
        catalogue={catalogue}
        defaultStart={start}
        /* Le créneau et tout le monde déjà cochés ; le titre vide, et
           c'est le seul champ qui reste. `valuesFromEvent` plutôt qu'un
           objet écrit à la main : la conversion instant → champs vit à
           un seul endroit, et un fuseau recopié finit toujours par
           diverger. */
        initial={{
          ...valuesFromEvent({
            title: "",
            startAt: new Date(start).toISOString(),
            endAt: new Date(end).toISOString(),
            participantIds: members.map((m) => m.id),
          }),
          emoji: null,
        }}
      />
    </>
  );
}
