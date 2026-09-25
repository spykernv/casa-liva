"use client";

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { CasaEvent, Catalogue, FamilyMember } from "@/types";
import { AllDayRow } from "@/components/calendar/all-day-row";
import { EventBlock } from "@/components/calendar/event-block";
import { MemberFilter } from "@/components/calendar/member-filter";
import { NowLine } from "@/components/calendar/now-line";
import { CreateChoiceSheet } from "@/components/events/create-choice-sheet";
import { CreateEventSheet } from "@/components/events/create-event-sheet";
import { EventDetailSheet } from "@/components/events/event-detail-sheet";
import { UndoBar } from "@/components/events/undo-bar";
import { restoreEvent } from "@/actions/events";
import { eventBox, gridBounds, HOUR_HEIGHT, layoutDay, shiftEvent } from "@/lib/calendar/layout";
import { defaultEventStart } from "@/lib/calendar/defaults";
import { updateEvent } from "@/actions/events";
import { useEventDrag, type DragMode } from "@/hooks/use-event-drag";
import { casaStartOfDay, isSameCasaDay } from "@/lib/date";
import { cn } from "@/lib/utils";

/** Largeur de la colonne des heures. Assez large pour « 08:00 ». */
const RAIL = 48;

export type DayBoardProps = {
  members: FamilyMember[];
  events: CasaEvent[];
  meId: string;
  /** Instant de référence, calculé sur le serveur. */
  now: number;
  /** Jour affiché (n'importe quel instant de ce jour). */
  day: number;
  /** Les raccourcis de la maison, passés au formulaire (D45). */
  catalogue: Catalogue;
};

export function DayBoard({ members, events, meId, now, day, catalogue }: DayBoardProps) {
  const [selected, setSelected] = useState<string[]>(() => members.map((m) => m.id));
  /* Le menu du « + » (D49), à part du formulaire. Les deux autres
     portes de création — le tap sur un créneau vide de la grille, et
     l'état vide — ouvrent le formulaire DIRECTEMENT : on y a déjà
     désigné une heure, redemander « à l'oral ou à la main ? » à ce
     moment-là serait une question de trop. Seul le « + », qui ne
     désigne rien, pose le choix. */
  const [choix, setChoix] = useState<number | null>(null);
  const [creating, setCreating] = useState<number | null>(null);
  /* Deux états plutôt qu'un : `detailOpen` pilote l'animation, et
     `detailEvent` survit à la fermeture le temps que le panneau
     redescende avec son contenu. */
  const [detailEvent, setDetailEvent] = useState<CasaEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleted, setDeleted] = useState<CasaEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const gridRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  /* Déplacement optimiste : l'événement bouge tout de suite, le serveur
     suit (§70). Si l'écriture échoue, `useOptimistic` remet
     automatiquement l'état serveur en place à la fin de la transition. */
  const [shown, applyOptimistic] = useOptimistic(
    events,
    (state: CasaEvent[], patch: { id: string; startAt: string; endAt: string }) =>
      state.map((e) =>
        e.id === patch.id ? { ...e, startAt: patch.startAt, endAt: patch.endAt } : e,
      ),
  );

  const commitDrag = useCallback(
    (id: string, mode: DragMode, deltaMin: number) => {
      const target = shown.find((e) => e.id === id);
      if (!target) return;
      const next = shiftEvent(target, mode, deltaMin);

      setError(null);
      startTransition(async () => {
        applyOptimistic({ id, ...next });
        const result = await updateEvent({ id, ...next });
        if (!result.ok) setError(result.error);
        router.refresh();
      });
    },
    [shown, applyOptimistic, router],
  );

  const { drag, containerHandlers, onPointerDown, isDragging } = useEventDrag({
    containerRef: gridRef,
    onCommit: commitDrag,
  });

  const visibleEvents = useMemo(
    () =>
      shown.filter((e) =>
        e.participants.some(
          (p) => p.status !== "declined" && selected.includes(p.userId),
        ),
      ),
    [shown, selected],
  );

  /* Les journées entières sortent de la grille : sans ça, un
     « Vacances » de minuit à minuit ferait afficher les 24 heures à
     toute la famille. Elles vont dans le bandeau du haut. */
  const allDayEvents = useMemo(
    () => visibleEvents.filter((e) => e.allDay),
    [visibleEvents],
  );
  const timedEvents = useMemo(
    () => visibleEvents.filter((e) => !e.allDay),
    [visibleEvents],
  );

  const dayStartMs = useMemo(() => casaStartOfDay(day).getTime(), [day]);

  /* `timedEvents` et non `previewed` : les bornes ne doivent PAS suivre
     l'aperçu du glissement, sinon la grille se réorganise pendant
     qu'on déplace un bloc et `use-event-drag`, qui dérive ses minutes
     d'un décalage relatif à `startHour`, le fait sauter sous le doigt
     (JON-75). */
  const { startHour, endHour } = useMemo(
    () => gridBounds(timedEvents, dayStartMs),
    [timedEvents, dayStartMs],
  );

  /* Aperçu du glissement : on applique le décalage au rendu, sans
     toucher au state serveur — sinon chaque pixel parcouru
     déclencherait une écriture. */
  const previewed = useMemo(() => {
    if (!drag) return timedEvents;
    return timedEvents.map((e) =>
      e.id === drag.id ? { ...e, ...shiftEvent(e, drag.mode, drag.deltaMin) } : e,
    );
  }, [timedEvents, drag]);

  const positioned = useMemo(
    () => layoutDay(previewed, dayStartMs),
    [previewed, dayStartMs],
  );

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const gridHeight = (endHour - startHour) * HOUR_HEIGHT;
  const isToday = isSameCasaDay(day, now);

  // On repart des données fraîches quand elles existent : après un
  // « Je viens », le panneau doit afficher le nouveau statut, pas
  // l'instantané pris au moment du tap.
  const openEvent = detailEvent
    ? (shown.find((e) => e.id === detailEvent.id) ?? detailEvent)
    : null;

  /* À l'ouverture, on cadre la page autour de l'heure actuelle.
     Personne ne veut atterrir sur 8h du matin quand il est 17h. */
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const anchorHour = isToday ? new Date(now).getHours() : 9;
    const offsetInGrid = Math.max(0, (anchorHour - startHour - 1) * HOUR_HEIGHT);
    const gridTop = grid.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: gridTop + offsetInGrid - 12, behavior: "instant" });
  }, [isToday, now, startHour]);

  /** Tap sur un créneau vide : on ouvre la création à cette heure-là. */
  function createAt(clientY: number) {
    const grid = gridRef.current;
    if (!grid) return;
    const offset = clientY - grid.getBoundingClientRect().top;
    const minutes = startHour * 60 + (offset / HOUR_HEIGHT) * 60;
    setCreating(dayStartMs + Math.max(0, minutes) * 60_000);
  }

  return (
    <>
      <MemberFilter members={members} selected={selected} onChange={setSelected} />

      {error && (
        <p role="alert" className="mx-4 mb-2 rounded-casa bg-danger-soft px-3 py-2 text-[0.875rem] font-medium text-danger">
          {error}
        </p>
      )}

      <AllDayRow
        events={allDayEvents}
        members={members}
        onSelect={(event) => {
          setDetailEvent(event);
          setDetailOpen(true);
        }}
      />

      {visibleEvents.length === 0 ? (
        <EmptyDay
          filtered={selected.length < members.length}
          onCreate={() => setCreating(defaultEventStart(day, now))}
        />
      ) : (
        <div
          ref={gridRef}
          className="relative px-4 pb-8"
          style={{ height: gridHeight + 32 }}
          {...containerHandlers}
        >
          {/* Fond tapable : créer un événement là où on a touché. */}
          <button
            type="button"
            aria-label="Créer un événement à cette heure"
            onClick={(e) => {
              if (!isDragging) createAt(e.clientY);
            }}
            className="absolute inset-0 cursor-copy"
            tabIndex={-1}
          />

          {hours.map((h, i) => (
            <div
              key={h}
              className="pointer-events-none absolute left-4 right-4 flex items-start"
              style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
            >
              <span className="w-10 shrink-0 -translate-y-1.5 pr-2 text-right text-[0.6875rem] font-medium tabular-nums text-ink-3">
                {String(h).padStart(2, "0")}:00
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>
          ))}


          <div className="absolute inset-y-0 right-4" style={{ left: RAIL + 16 }}>
            {positioned.map((p) => {
              const box = eventBox(p, startHour);
              return (
                <EventBlock
                  key={p.event.id}
                  event={p.event}
                  members={members}
                  meId={meId}
                  height={box.height}
                  dragging={drag?.id === p.event.id}
                  onSelect={() => {
                    if (isDragging) return;
                    setDetailEvent(p.event);
                    setDetailOpen(true);
                  }}
                  onDragStart={(e, mode) =>
                    onPointerDown(e, p.event.id, mode, p.endMin - p.startMin)
                  }
                  style={{
                    top: box.top,
                    height: box.height,
                    left: box.left,
                    width: box.width,
                  }}
                />
              );
            })}
          </div>

          {isToday && <NowLine startHour={startHour} initialNow={now} rail={RAIL} />}
        </div>
      )}

      <button
        type="button"
        aria-label="Créer un événement"
        onClick={() => setChoix(defaultEventStart(day, now))}
        className={cn(
          "fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-5 z-30 md:bottom-8",
          "flex h-14 w-14 items-center justify-center rounded-full",
          "bg-accent text-white shadow-casa-accent",
          "transition-transform active:scale-95",
        )}
      >
        <Plus size={26} strokeWidth={2.6} aria-hidden="true" />
      </button>

      <CreateChoiceSheet
        open={choix !== null}
        onClose={() => setChoix(null)}
        onManuel={() => setCreating(choix)}
      />

      <CreateEventSheet
        open={creating !== null}
        onClose={() => setCreating(null)}
        members={members}
        meId={meId}
        catalogue={catalogue}
        defaultStart={creating ?? day}
      />

      <EventDetailSheet
        catalogue={catalogue}
        event={openEvent}
        open={detailOpen}
        members={members}
        meId={meId}
        onClose={() => setDetailOpen(false)}
        onDeleted={setDeleted}
      />

      {/* `restoreEvent` et non `createEvent` : l'annulation ne doit
          renvoyer aucune invitation, ni effacer les réponses, ni
          perdre `allDay` — voir JON-66. */}
      <UndoBar
        label={deleted ? `« ${deleted.title} » supprimé` : null}
        onUndo={async () => {
          if (deleted) await restoreEvent(deleted);
        }}
        onDismiss={() => setDeleted(null)}
      />
    </>
  );
}

function EmptyDay({
  filtered,
  onCreate,
}: {
  filtered: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="mx-4 mt-6 rounded-casa-lg border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center">
      <p className="text-lg font-semibold text-ink">Rien de prévu.</p>
      <p className="mx-auto mt-2 max-w-xs text-[0.9375rem] leading-relaxed text-ink-2">
        {filtered
          ? "Avec ce filtre, en tout cas. Les autres ont peut-être une vie."
          : "Soit une journée extrêmement calme, soit quelqu’un a oublié de remplir son agenda."}
      </p>
      {!filtered && (
        <button
          type="button"
          onClick={onCreate}
          className="mt-5 inline-flex h-12 items-center justify-center rounded-casa bg-accent px-5 font-semibold text-white shadow-casa-accent"
        >
          Proposer quelque chose
        </button>
      )}
    </div>
  );
}
