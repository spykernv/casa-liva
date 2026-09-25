"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Catalogue, FamilyMember } from "@/types";
import { Sheet } from "@/components/ui/sheet";
import {
  EventForm,
  instantsOf,
  valuesFromSlot,
  type EventFormValues,
} from "@/components/events/event-form";
import { createEvent } from "@/actions/events";

export type CreateEventSheetProps = {
  open: boolean;
  onClose: () => void;
  members: FamilyMember[];
  meId: string;
  /** Les raccourcis de la maison, passés au formulaire (D45). */
  catalogue: Catalogue;
  /** Jour et heure pré-remplis (tap sur un créneau vide, sinon le jour affiché). */
  defaultStart: number;
  /**
   * Le formulaire déjà rempli — « ✨ Opportunité Casa » s'en sert
   * (JON-65). Quand il est absent, on part de `defaultStart`.
   */
  initial?: EventFormValues;
};

export function CreateEventSheet({
  open,
  onClose,
  members,
  meId,
  catalogue,
  defaultStart,
  initial,
}: CreateEventSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Créer un événement">
      {/* Le formulaire vit et meurt avec le panneau : sa fermeture le
          démonte, donc rouvrir repart d'une feuille blanche sans qu'on
          ait à réinitialiser quoi que ce soit à la main. */}
      <CreateEventBody
        onClose={onClose}
        members={members}
        meId={meId}
        catalogue={catalogue}
        values={initial ?? valuesFromSlot(defaultStart, meId)}
      />
    </Sheet>
  );
}

function CreateEventBody({
  onClose,
  members,
  meId,
  catalogue,
  values,
}: {
  onClose: () => void;
  members: FamilyMember[];
  meId: string;
  catalogue: Catalogue;
  values: EventFormValues;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(v: EventFormValues) {
    setError(null);
    startTransition(async () => {
      const result = await createEvent({
        title: v.title,
        emoji: v.emoji ?? undefined,
        location: v.location || undefined,
        ...instantsOf(v),
        participantIds: v.invited,
        rappelMinutes: v.rappelMinutes,
      });

      if (!result.ok) return setError(result.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2">
      <EventForm
        members={members}
        meId={meId}
        catalogue={catalogue}
        initial={values}
        submitLabel="C’est parti"
        pendingLabel="On enregistre…"
        pending={pending}
        error={error}
        onSubmit={submit}
      />
    </div>
  );
}
