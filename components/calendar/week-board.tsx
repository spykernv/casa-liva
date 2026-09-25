"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { CasaEvent, Catalogue, FamilyMember } from "@/types";
import { EventRow } from "@/components/calendar/event-row";
import { ScopeSwitch } from "@/components/calendar/scope-switch";
import { WeekStrip } from "@/components/calendar/week-strip";
import { CreateChoiceSheet } from "@/components/events/create-choice-sheet";
import { CreateEventSheet } from "@/components/events/create-event-sheet";
import { EventDetailSheet } from "@/components/events/event-detail-sheet";
import { UndoBar } from "@/components/events/undo-bar";
import { Listen } from "@/components/ai/listen";
import { PageHeader } from "@/components/shell/page-header";
import { SyncControl } from "@/components/calendar/sync-control";
import { restoreEvent, setParticipation } from "@/actions/events";
import { defaultEventStart } from "@/lib/calendar/defaults";
import { eventsForScope, listenScope, myStatus } from "@/lib/calendar/scope";
import {
  dayKey, formatDayLong,
  formatWeekRange, isSameCasaDay, weekAnchor, weekDays,
} from "@/lib/date";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   La semaine se lit (D46).

   **Pourquoi ce n'est plus une grille à sept colonnes.** À 375 px,
   (375 − 40) / 7 donne 47,86 px par colonne, dont 27,86 px de texte
   une fois bordure, barre de couleur et padding retirés : quatre
   caractères. Et dès deux événements qui se chevauchent, le bloc tombe
   à 20,43 px et le texte à 1,43 px. Ce n'était pas un défaut de marge,
   c'était la division de 375 par sept — aucun réglage ne récupère
   1,43 px.

   Ni Apple Calendar ni Google Agenda ne montrent sept colonnes
   horaires en portrait sur un téléphone : le premier propose une
   liste, le second bascule en « 3 jours » ou en « Planning ».
   Reproduire la grille aurait reproduit le défaut.

   Ici un titre dispose de **255 px**, soit ≈ 31 caractères sur une
   ligne et 62 sur deux — et surtout la lisibilité **cesse de dépendre
   du nombre d'événements** : deux rendez-vous à 9 h sont deux rangées
   de 255 px, pas deux colonnes de 20. Le chevauchement n'est plus un
   problème typographique.

   La grille horaire, elle, n'a pas disparu : elle vit à la journée
   (`/aujourdhui`), pleine largeur, où le glisser-déposer garde son
   sens.
   ═══════════════════════════════════════════════════════════════ */

export type WeekBoardProps = {
  members: FamilyMember[];
  events: CasaEvent[];
  meId: string;
  now: number;
  /** Décalage de semaine porté par l'URL — le serveur a chargé celle-là. */
  weekOffset: number;
  /** Les raccourcis de la maison, passés au formulaire (D45). */
  catalogue: Catalogue;
  hasConnections: boolean;
  needsReauth: boolean;
};

export function WeekBoard({
  members, events, meId, now, weekOffset, catalogue, hasConnections, needsReauth,
}: WeekBoardProps) {
  const [scope, setScope] = useState<string>("maison");
  /* Deux états, et non un seul : `choix` porte le menu du « + »
     (D49), `creating` porte le formulaire. Les confondre aurait fait
     revenir le menu chaque fois qu'on rouvre le formulaire depuis une
     bande « tout le monde est libre », qui n'a aucune raison de
     redemander le chemin. */
  const [choix, setChoix] = useState<number | null>(null);
  const [creating, setCreating] = useState<number | null>(null);
  const [detailEvent, setDetailEvent] = useState<CasaEvent | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleted, setDeleted] = useState<CasaEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const goToWeek = useCallback(
    (offset: number) => {
      router.push(offset === 0 ? "/semaine" : `/semaine?s=${offset}`, { scroll: false });
    },
    [router],
  );

  /* La MÊME fonction que le Server Component qui a chargé les
     événements (JON-60) : deux formules différentes afficheraient une
     semaine et chargeraient les événements d'une autre. */
  const anchor = useMemo(() => weekAnchor(now, weekOffset).getTime(), [now, weekOffset]);
  const days = useMemo(() => weekDays(anchor), [anchor]);

  const visible = useMemo(
    () => eventsForScope(events, scope, meId),
    [events, scope, meId],
  );

  const [picked, setPicked] = useState<number | null>(null);

  /* Faire défiler jusqu'au jour, plutôt que de recharger quoi que ce
     soit : la page porte déjà toute la semaine, un aller-retour serveur
     ne rendrait rien de plus.

     Par `id` et non par une carte de refs : lire `ref.current` pendant
     le rendu est ce que le React Compiler refuse, et il a raison — un
     nœud lu au rendu peut être celui d'avant. */
  const pick = useCallback((day: Date) => {
    setPicked(new Date(day).getTime());
    document
      .getElementById(`jour-${dayKey(day)}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  function repondre(event: CasaEvent, viens: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setParticipation(event.id, viens ? "accepted" : "declined");
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  /* Les jours, préparés une fois : leurs événements, et s'ils sont
     vides.

     **Plus de bande « tout le monde est libre » ici** (D57) : le
     commanditaire l'a retirée après l'avoir vue sur son téléphone. Elle
     reste sur `/casa` (« ✨ Opportunité Casa ») et à la journée, où on
     est allé la chercher — c'est sur l'écran qu'on ouvre pour LIRE sa
     semaine qu'elle n'avait pas sa place. */
  const jours = useMemo(
    () =>
      days.map((day) => {
        const liste = visible
          .filter((e) => isSameCasaDay(e.startAt, day))
          .sort((a, b) => Number(b.allDay ?? false) - Number(a.allDay ?? false)
            || a.startAt.localeCompare(b.startAt));

        return { day, key: dayKey(day), liste };
      }),
    [days, visible],
  );

  /* Les jours vides consécutifs se replient en une ligne. Sept
     en-têtes suivis de rien font défiler pour rien, et « Aucun
     événement » sept fois est exactement l'état vide que le projet
     s'interdit. */
  const blocs = useMemo(() => {
    const out: (
      | { type: "jour"; jour: (typeof jours)[number] }
      | { type: "vides"; jours: (typeof jours) }
    )[] = [];
    for (const j of jours) {
      if (j.liste.length > 0) {
        out.push({ type: "jour", jour: j });
      } else {
        const dernier = out[out.length - 1];
        if (dernier?.type === "vides") dernier.jours.push(j);
        else out.push({ type: "vides", jours: [j] });
      }
    }
    return out;
  }, [jours]);

  const toutVide = jours.every((j) => j.liste.length === 0);

  return (
    <>
      <PageHeader
        title="La semaine"
        subtitle={formatWeekRange(anchor)}
        actions={
          <>
            {hasConnections && <SyncControl needsReauth={needsReauth} />}
            <button
              type="button"
              onClick={() => goToWeek(weekOffset - 1)}
              aria-label="Semaine précédente"
              className="tap flex items-center justify-center rounded-casa text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <ChevronLeft size={22} strokeWidth={2.2} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => goToWeek(weekOffset + 1)}
              aria-label="Semaine suivante"
              className="tap flex items-center justify-center rounded-casa text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <ChevronRight size={22} strokeWidth={2.2} aria-hidden="true" />
            </button>
          </>
        }
        /* Le rail vit DANS l'en-tête collant. Il y avait auparavant deux
           éléments collants — celui-ci en `top-0` et les en-têtes de jour
           en `top-[5.5rem]`, soit 88 px pour un en-tête qui en mesure
           ~104 : les jours passaient dessous. On supprime la notion
           plutôt que de recalculer le nombre. */
        below={
          <WeekStrip
            days={days}
            events={visible}
            members={members}
            now={now}
            open={picked}
            onPick={pick}
          />
        }
      />

      <ScopeSwitch members={members} meId={meId} value={scope} onChange={setScope} />

      <div className="px-4 pb-1">
        {/* **Un seul lecteur, jamais deux** (D48). Chaque `Player`
            possède son propre élément `audio` et il n'existe aucun
            registre global : deux boutons côte à côte, deux taps, et
            deux voix parleraient en même temps. Le libellé suit donc la
            portée active, et changer de portée remonte le lecteur —
            la `key` de `Listen` sérialise le corps de la requête, donc
            `pour` en fait partie, donc l'audio en cours se coupe au
            lieu de se superposer. Sans une ligne de plus.

            Une pastille de MEMBRE laisse le libellé sur « la maison » :
            la route ne connaît que deux portées, on n'en fabrique pas
            une troisième pour un filtre visuel — et surtout on ne
            laisse pas le libellé mentir sur ce qui va être prononcé. */}
        <Listen
          source={{
            kind: "briefing",
            quoi: "semaine",
            jour: dayKey(days[0]),
            pour: listenScope(scope),
          }}
          label={
            listenScope(scope) === "moi"
              ? "Écouter ma semaine"
              : "Écouter la semaine de la maison"
          }
          variant="carte"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="mx-4 mb-2 rounded-casa bg-danger-soft px-3 py-2 text-[0.875rem] font-medium text-danger"
        >
          {error}
        </p>
      )}

      <div
        className="px-4 pb-28"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touchStart.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          // Un swipe horizontal franc, sinon c'est un défilement.
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
            goToWeek(weekOffset + (dx < 0 ? 1 : -1));
          }
        }}
      >
        {toutVide ? (
          <div className="mt-8 rounded-casa-md border border-dashed border-line-strong px-5 py-8 text-center">
            <p className="text-[1.0625rem] font-semibold text-ink">
              Une semaine complètement blanche.
            </p>
            <p className="mt-1.5 text-[1rem] leading-relaxed text-ink-2">
              {scope === "maison"
                ? "Soit vous êtes très reposés, soit personne n’a rien noté."
                : "Rien à ton nom cette semaine. Celle de la maison est peut-être plus animée."}
            </p>
            <button
              type="button"
              onClick={() =>
                scope === "maison"
                  ? setCreating(defaultEventStart(days[0].getTime(), now))
                  : setScope("maison")
              }
              className="tap mt-4 inline-flex items-center rounded-casa-xl border border-accent bg-accent-soft px-4 text-[1rem] font-semibold text-accent-ink"
            >
              {scope === "maison" ? "Proposer quelque chose" : "Voir la maison"}
            </button>
          </div>
        ) : (
          blocs.map((bloc) => {
            if (bloc.type === "vides") {
              const noms = bloc.jours.map((j) => formatDayLong(j.day).split(" ")[0]);
              const libelle =
                noms.length === 1
                  ? noms[0]
                  : `${noms.slice(0, -1).join(", ")} et ${noms[noms.length - 1]}`;
              return (
                <button
                  key={`vides-${bloc.jours[0].key}`}
                  type="button"
                  onClick={() =>
                    setCreating(defaultEventStart(bloc.jours[0].day.getTime(), now))
                  }
                  className="mt-4 flex min-h-12 w-full items-center rounded-casa border border-dashed border-line-strong px-4 text-left text-[1rem] text-ink-2"
                >
                  {libelle}&nbsp;: rien de prévu.
                </button>
              );
            }

            const { day, key, liste } = bloc.jour;
            const today = isSameCasaDay(day, now);

            return (
              <section
                key={key}
                id={`jour-${key}`}
                className="scroll-mt-48"
              >
                {/* 16 px et en casse normale, pas 13 px en capitales.
                    Les intitulés de section du projet sont des
                    étiquettes qu'on survole ; ceux-ci sont les repères
                    principaux de l'écran — on les LIT pour se situer
                    dans la semaine. Le plancher de 16 px d'`AGENTS.md`
                    s'applique donc pleinement, et « Lundi 24 août » se
                    lit mieux que « LUNDI 24 AOÛT » à taille égale. */}
                <h2
                  className={cn(
                    "pb-2 pt-5 text-[1rem] font-bold",
                    today ? "text-accent" : "text-ink",
                  )}
                >
                  {formatDayLong(day)}
                  {today && (
                    <span className="font-semibold text-ink-2"> · aujourd’hui</span>
                  )}
                </h2>

                <ul className="flex flex-col gap-2">
                  {liste.map((event) => {
                    const statut = myStatus(event, meId);
                    const importe = event.source !== "casa-liva";

                    return (
                      <li key={event.id}>
                        <EventRow
                          event={event}
                          members={members}
                          meId={meId}
                          onSelect={() => {
                            setDetailEvent(event);
                            setDetailOpen(true);
                          }}
                          /* Rejoindre ou se retirer sans demander (D50).
                             Le droit existait déjà — `refusalFor` passe
                             `ownerOnly: false` depuis D21 — il était
                             seulement enterré dans la feuille de détail,
                             à trois taps. Pas sur un événement importé :
                             répondre « pas dispo » à son propre
                             rendez-vous Google libérerait le créneau pour
                             toute la maison alors qu'il tient toujours. */
                          action={
                            importe ? undefined : (
                              <button
                                type="button"
                                onClick={() => repondre(event, statut !== "accepted")}
                                aria-pressed={statut === "accepted"}
                                className={cn(
                                  "tap flex items-center rounded-casa-xl px-3 text-[0.9375rem] font-bold",
                                  statut === "accepted"
                                    ? "bg-success-soft text-success"
                                    : "bg-surface-2 text-ink-2",
                                )}
                              >
                                {statut === "accepted" ? "Je viens" : "Rejoindre"}
                              </button>
                            )
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>

      <button
        type="button"
        aria-label="Créer un événement"
        onClick={() => {
          const anchorDay = days.find((d) => isSameCasaDay(d, now)) ?? days[0];
          setChoix(defaultEventStart(anchorDay.getTime(), now));
        }}
        className={cn(
          "fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-5 z-30 md:bottom-8",
          "flex h-14 w-14 items-center justify-center rounded-full",
          "bg-accent text-white shadow-casa-accent transition-transform active:scale-95",
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
        defaultStart={creating ?? now}
      />

      <EventDetailSheet
        catalogue={catalogue}
        event={
          detailEvent
            ? (events.find((e) => e.id === detailEvent.id) ?? detailEvent)
            : null
        }
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
