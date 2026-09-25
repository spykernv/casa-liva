"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Plus, Sparkles } from "lucide-react";
import type { CasaEvent, Catalogue, FamilyMember, Interval } from "@/types";
import type { DayAvailability } from "@/lib/data/availability";
import { Avatar } from "@/components/ui/avatar";
import { CreateEventSheet } from "@/components/events/create-event-sheet";
import { setParticipation } from "@/actions/events";
import { defaultEventStart } from "@/lib/calendar/defaults";
import { memberStyle } from "@/lib/design/member-color";
import { formatDuration, formatTime } from "@/lib/date";
import { cn } from "@/lib/utils";

export type DayPeopleProps = {
  availability: DayAvailability;
  members: FamilyMember[];
  meId: string;
  day: number;
  now: number;
  /** Les raccourcis de la maison, passés au formulaire (D45). */
  catalogue: Catalogue;
};

/**
 * « Qui est libre ce jour-là ? »
 *
 * Deux services rendus, et le second est le moins évident.
 *
 * **Voir qui est libre**, pour savoir qui inviter — c'est la question
 * qu'on pose à voix haute et que le produit existe pour remplacer.
 *
 * **Voir ce qui occupe les autres**, pour pouvoir proposer quand même.
 * Un agenda qui se contente de dire « Sophie n'est pas libre » ferme
 * la discussion ; en montrant que Sophie fait les courses, il la
 * laisse ouverte. C'est à Sophie de décider si le golf vaut mieux que
 * les courses — et de se désister d'un tap si c'est le cas.
 */
export function DayPeople({ availability, members, meId, day, now, catalogue }: DayPeopleProps) {
  const [creating, setCreating] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const { common, people } = availability;
  const everyone = people.length === members.length;

  /** Se retirer d'un événement : on redevient libre sur ce créneau. */
  function stepAside(event: CasaEvent) {
    setError(null);
    setLeaving(event.id);
    startTransition(async () => {
      const result = await setParticipation(event.id, "declined");
      setLeaving(null);
      if (!result.ok) return setError(result.error);
      // Ici, on rafraîchit : le but du geste est précisément de voir
      // le créneau se libérer.
      router.refresh();
    });
  }

  /* L'heure proposée en créant : le meilleur créneau commun s'il y en
     a un, sinon l'heure habituelle. Quelqu'un qui vient de regarder
     « tout le monde est libre à 17h » ne devrait pas avoir à le
     retaper. */
  const suggested = common.find((b) => b.highlight) ?? common[0];
  const createAt = suggested ? suggested.start : defaultEventStart(day, now);

  return (
    <section className="px-4 pt-7">
      {common.length > 0 ? (
        <div className="rounded-casa-md border border-magic/35 bg-magic-soft p-4">
          <p className="flex items-center gap-1.5 text-[0.8125rem] font-bold uppercase tracking-wide text-magic">
            <Sparkles size={15} strokeWidth={2.6} aria-hidden="true" />
            {everyone ? "Tout le monde est libre" : "Vous êtes tous libres"}
          </p>
          <ul className="mt-2 space-y-1">
            {common.map((band) => (
              <li
                key={band.start}
                className="text-[1.0625rem] font-semibold tabular-nums text-ink"
              >
                {formatTime(band.start)} → {formatTime(band.end)}
                <span className="pl-1.5 text-[0.875rem] font-normal text-ink-2">
                  ({formatDuration((band.end - band.start) / 60_000)})
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="rounded-casa-md border border-dashed border-line-strong bg-surface/60 px-4 py-4 text-center">
          <p className="text-[1.0625rem] font-semibold text-ink">
            Aucun moment où vous êtes tous libres.
          </p>
          <p className="mx-auto mt-1 max-w-xs text-[0.9375rem] leading-relaxed text-ink-2">
            Ce qui occupe chacun est juste en dessous. Rien n’empêche de
            proposer quand même&nbsp;: c’est à chacun de dire si ça vaut mieux.
          </p>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-casa bg-danger-soft px-3 py-2 text-[0.875rem] font-medium text-danger"
        >
          {error}
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {people.map((person) => {
          const member = members.find((m) => m.id === person.userId);
          if (!member) return null;

          return (
            <li key={person.userId}>
              <div
                style={memberStyle(member.color)}
                className="rounded-casa-md border border-line bg-surface p-3.5 shadow-casa-sm"
              >
                <div className="flex items-center gap-3">
                  <Avatar member={member} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[1.0625rem] font-semibold text-ink">
                      {member.firstName}
                      {member.id === meId && (
                        <span className="ml-1.5 text-[0.8125rem] font-normal text-ink-3">
                          toi
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[0.9375rem] text-ink-2">
                      {summarise(person.free, person.freeAllDay)}
                    </p>
                  </div>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-9 w-1.5 shrink-0 rounded-full",
                      person.freeAllDay ? "bg-[var(--m)]" : "bg-line-strong",
                    )}
                  />
                </div>

                {person.busy.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
                    {person.busy.map(({ event, interval }) => {
                      const mine = person.userId === meId;
                      // On ne se désiste que de ses propres
                      // participations, et jamais d'un rendez-vous
                      // Google : le refuser ici le ferait disparaître de
                      // la grille alors qu'il tient toujours (D13).
                      const canLeave = mine && event.source === "casa-liva";

                      return (
                        <li
                          key={event.id}
                          className="flex items-center gap-2.5 text-[0.9375rem]"
                        >
                          <span className="shrink-0 tabular-nums text-ink-3">
                            {formatTime(interval.start)}
                          </span>
                          <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-ink">
                            {event.isPrivate ? (
                              <Lock
                                size={13}
                                strokeWidth={2.6}
                                aria-hidden="true"
                                className="shrink-0 text-ink-3"
                              />
                            ) : event.emoji ? (
                              <span aria-hidden="true">{event.emoji}</span>
                            ) : null}
                            <span className="truncate">
                              {event.isPrivate ? "Occupé" : event.title}
                            </span>
                          </span>
                          {canLeave && (
                            <button
                              type="button"
                              onClick={() => stepAside(event)}
                              disabled={leaving !== null}
                              className="shrink-0 rounded-casa-sm px-2 py-1.5 text-[0.875rem] font-semibold text-accent disabled:opacity-50"
                            >
                              {leaving === event.id ? "…" : "Je me désiste"}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => setCreating(createAt)}
        className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-casa-md bg-accent px-5 text-[1.0625rem] font-semibold text-white shadow-casa-accent transition-transform active:scale-[0.985]"
      >
        <Plus size={20} strokeWidth={2.6} aria-hidden="true" />
        Proposer quelque chose ce jour-là
      </button>

      <CreateEventSheet
        open={creating !== null}
        onClose={() => setCreating(null)}
        members={members}
        meId={meId}
        catalogue={catalogue}
        defaultStart={creating ?? createAt}
      />
    </section>
  );
}

/** « Libre toute la journée », « Libre 8:00→12:00 et 14:00→22:00 ». */
function summarise(free: Interval[], freeAllDay: boolean): string {
  if (freeAllDay) return "Libre toute la journée";
  if (free.length === 0) return "Pris du matin au soir";

  const spans = free
    .slice(0, 2)
    .map((f) => `${formatTime(f.start)}→${formatTime(f.end)}`);
  const rest = free.length - spans.length;

  return `Libre ${spans.join(" et ")}${rest > 0 ? `, +${rest}` : ""}`;
}
