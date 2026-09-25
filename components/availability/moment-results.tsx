"use client";

import { useState, useTransition } from "react";
import { addDays } from "date-fns";
import { Check, Plus, Sparkles } from "lucide-react";
import type { CommonSlot, FamilyMember } from "@/types";
import { AvatarStack } from "@/components/ui/avatar";
import { UndoBar } from "@/components/events/undo-bar";
import { createEvent, deleteEvent } from "@/actions/events";
import { guessEmoji } from "@/lib/calendar/emoji";
import {
  casaStartOfDay,
  formatDayLong,
  formatDuration,
  formatTime,
  isSameCasaDay,
  weeksFromNow,
} from "@/lib/date";
import { cn } from "@/lib/utils";

export type MomentResultsProps = {
  slots: CommonSlot[];
  members: FamilyMember[];
  /** Ce qu'on cherchait à faire — c'est le titre de l'événement créé. */
  title: string;
  /** Instant de référence du rendu serveur, pour « aujourd'hui » / « demain ». */
  now: number;
};

type Created = { eventId: string; emoji?: string };

/**
 * Les meilleurs moments, et un tap pour en faire un événement.
 *
 * **Cette liste est gelée au premier rendu**, et c'est voulu.
 *
 * `createEvent` appelle `revalidatePath`, et une Server Action qui
 * revalide fait re-rendre la route en cours par-dessus le marché. La
 * liste se recalculait donc juste après le tap : le créneau qu'on
 * venait de prendre étant désormais occupé, sa ligne était remplacée
 * par la suivante — au moment précis où l'on regardait si ça avait
 * marché. On tapait « samedi 10:00 » et on se retrouvait devant
 * « samedi 12:00 », sans coche, sans rien.
 *
 * On garde donc le premier tableau reçu. La page passe une `key` qui
 * change avec la recherche : une nouvelle recherche remonte le
 * composant et repart de résultats frais, un simple rafraîchissement
 * ne touche à rien.
 */
export function MomentResults({ slots, members, title, now }: MomentResultsProps) {
  const [shown] = useState(slots);
  const [created, setCreated] = useState<Record<number, Created>>({});
  const [last, setLast] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingSlot, setPendingSlot] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  function create(slot: CommonSlot) {
    setError(null);
    setPendingSlot(slot.start);
    startTransition(async () => {
      const emoji = guessEmoji(title);
      const result = await createEvent({
        title,
        emoji,
        startAt: new Date(slot.start).toISOString(),
        endAt: new Date(slot.end).toISOString(),
        participantIds: slot.userIds,
      });
      setPendingSlot(null);

      if (!result.ok) return setError(result.error);
      setCreated((prev) => ({ ...prev, [slot.start]: { eventId: result.id, emoji } }));
      setLast(slot.start);
    });
  }

  function undo(slotStart: number) {
    const done = created[slotStart];
    if (!done) return;
    startTransition(async () => {
      const result = await deleteEvent(done.eventId);
      if (!result.ok) return setError(result.error);
      setCreated((prev) => {
        const next = { ...prev };
        delete next[slotStart];
        return next;
      });
      setLast(null);
    });
  }

  return (
    <section className="px-4 pt-7">
      <h2 className="flex items-center gap-1.5 pb-3 text-[0.8125rem] font-bold uppercase tracking-wide text-magic">
        <Sparkles size={15} strokeWidth={2.6} aria-hidden="true" />
        Les meilleurs moments
      </h2>

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-casa bg-danger-soft px-3 py-2 text-[0.875rem] font-medium text-danger"
        >
          {error}
        </p>
      )}

      <ul className="space-y-2">
        {shown.map((slot) => {
          const done = created[slot.start];
          const people = members.filter((m) => slot.userIds.includes(m.id));
          const label = dayLabel(slot.start, now);

          return (
            <li key={slot.start}>
              <div
                className={cn(
                  "flex items-center gap-3 rounded-casa-md border bg-surface p-3 shadow-casa-sm transition-colors",
                  done ? "border-success/40 bg-success-soft" : "border-line",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[1.0625rem] font-semibold text-ink">
                    {label}
                  </p>
                  <p className="truncate text-[0.9375rem] tabular-nums text-ink-2">
                    {formatTime(slot.start)} → {formatTime(slot.end)}
                    <span className="text-ink-3">
                      {" · "}
                      {formatDuration((slot.end - slot.start) / 60_000)}
                    </span>
                  </p>
                </div>

                <AvatarStack members={people} size="sm" max={4} />

                {done ? (
                  <span className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-casa px-2.5 text-[0.9375rem] font-bold text-success">
                    <Check size={18} strokeWidth={2.8} aria-hidden="true" />
                    Prévu
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => create(slot)}
                    disabled={pendingSlot !== null}
                    className={cn(
                      "flex min-h-11 shrink-0 items-center gap-1 rounded-casa bg-accent px-3.5",
                      "text-[0.9375rem] font-semibold text-white shadow-casa-accent",
                      "transition-transform active:scale-95 disabled:opacity-45",
                    )}
                  >
                    <Plus size={18} strokeWidth={2.8} aria-hidden="true" />
                    {pendingSlot === slot.start ? "…" : "Créer"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Le « Annuler » obligatoire après une action qui écrit (§49).
          Il compte double ici : la création tient en un seul tap, donc
          une erreur de doigt coûte un événement à toute la maison.

          **La barre était refaite à la main ici**, sans rien partager
          avec celle des grilles — deux endroits où corriger un défaut,
          un seul où on pense à le faire. JON-66 n'en garde qu'une.

          Le lien pointe la semaine du créneau, pas la semaine en cours :
          un apéro calé dans quinze jours n'est visible nulle part sur
          « aujourd'hui », et un lien qui ne montre pas ce qu'il promet
          ne sert à rien. */}
      <UndoBar
        label={
          last !== null && created[last]
            ? `${created[last].emoji ? `${created[last].emoji} ` : ""}${title} · ${dayLabel(last, now).toLowerCase()}`
            : null
        }
        href={last !== null ? `/semaine?s=${weeksFromNow(last, now)}` : undefined}
        onUndo={() => {
          if (last !== null) undo(last);
        }}
        onDismiss={() => setLast(null)}
      />
    </section>
  );
}

/** « Aujourd'hui », « Demain », sinon « Samedi 8 août ». */
function dayLabel(ms: number, now: number): string {
  if (isSameCasaDay(ms, now)) return "Aujourd’hui";
  // `addDays` sur le minuit du jour, et non « maintenant + 24 h »
  // (JON-60) : le 25 octobre dure 25 heures, et « maintenant + 24 h »
  // y désigne encore aujourd'hui — « Demain » ne s'affichait plus.
  if (isSameCasaDay(ms, addDays(casaStartOfDay(now), 1))) return "Demain";
  return formatDayLong(ms);
}
