"use client";

import type { TZDate } from "@date-fns/tz";
import type { CasaEvent, FamilyMember } from "@/types";
import { dayKey, formatDayLong, formatDayNumber, formatDayShort, isSameCasaDay } from "@/lib/date";
import { memberStyle } from "@/lib/design/member-color";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   Le rail des sept jours — la seule chose qui reste à sept (D46).

   **Pourquoi elle seule.** À 375 px, une grille hebdomadaire donne
   (375 − 40) / 7 = 47,86 px par colonne, dont 27,86 px de texte une
   fois les bordures et le padding retirés : quatre caractères, ellipse
   comprise. Dès deux événements qui se chevauchent, le bloc tombe à
   20,4 px et le texte à 1,43 px. Aucun réglage de marge ne récupère
   1,43 px — c'est la division de 375 par sept qui ne marche pas.

   Un rail de pastilles, lui, ne porte aucune prose : un chiffre, trois
   lettres, et des points. Sept y tiennent sans mentir.
   ═══════════════════════════════════════════════════════════════ */

export type WeekStripProps = {
  days: TZDate[];
  events: CasaEvent[];
  members: FamilyMember[];
  now: number;
  /** Le jour ouvert en grille horaire, ou `null` si on est en liste. */
  open: number | null;
  onPick: (day: TZDate) => void;
};

export function WeekStrip({ days, events, members, now, open, onPick }: WeekStripProps) {
  return (
    <div
      role="tablist"
      aria-label="Les jours de la semaine"
      /* `flex-1` remplit exactement à 375 px (52,4 px la pastille) ;
         `min-w-tap` plante le pied à 48 px quand la largeur logique
         tombe à 320 — ce que fait le Zoom d'affichage d'iOS sur
         n'importe quel iPhone — et la rangée défile alors. */
      className="no-scrollbar -mx-4 flex overflow-x-auto border-t border-line px-1"
    >
      {days.map((day) => {
        const today = isSameCasaDay(day, now);
        const opened = open !== null && isSameCasaDay(day, open);

        const busy = members.filter((m) =>
          events.some(
            (e) =>
              isSameCasaDay(e.startAt, day) &&
              e.participants.some((p) => p.userId === m.id && p.status !== "declined"),
          ),
        );

        return (
          <button
            key={dayKey(day)}
            type="button"
            role="tab"
            aria-selected={opened}
            aria-current={today ? "date" : undefined}
            /* Les points ne distinguent personne à 6 px — c'est
               l'`aria-label` qui porte le « qui », en nommant les
               gens, et les rangées de la liste qui l'écrivent à
               16 px. */
            aria-label={
              busy.length === 0
                ? `${formatDayLong(day)} — rien de prévu`
                : `${formatDayLong(day)} — ${busy.map((m) => m.firstName).join(", ")}`
            }
            onClick={() => onPick(day)}
            className="tap flex min-w-tap flex-1 flex-col items-center rounded-casa pb-1.5 pt-1"
          >
            <span className="text-[1rem] font-semibold leading-none text-ink-2">
              {formatDayShort(day).replace(".", "")}
            </span>
            {/* 20 px gras dans un cercle de 36, et ce n'est pas
                cosmétique : blanc sur l'accent donne 3,46:1, qui
                échoue le seuil AA du petit texte (4,5:1). À 20 px
                gras on entre dans le régime « grand texte », dont le
                seuil est 3:1 — la couleur de marque redevient
                utilisable. Lisibilité et conformité tirent au même
                endroit. */}
            <span
              className={cn(
                "mt-0.5 flex h-9 w-9 items-center justify-center rounded-full",
                "text-[1.25rem] font-bold tabular-nums",
                today && opened
                  ? "bg-accent text-white"
                  : today
                    ? "text-accent"
                    : opened
                      ? "bg-ink text-ink-inverse"
                      : "text-ink",
              )}
            >
              {formatDayNumber(day)}
            </span>
            <span aria-hidden="true" className="mt-1 flex h-1.5 items-center gap-[3px]">
              {busy.slice(0, 4).map((m) => (
                <span
                  key={m.id}
                  style={memberStyle(m.color)}
                  className="h-1.5 w-1.5 rounded-full bg-[var(--m)]"
                />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
