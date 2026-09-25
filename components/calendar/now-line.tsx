"use client";

import { useEffect, useState } from "react";
import { HOUR_HEIGHT } from "@/lib/calendar/layout";
import { casaDate } from "@/lib/date";

export type NowLineProps = {
  /** Première heure affichée par la grille. */
  startHour: number;
  /** Instant fourni par le serveur — évite un écart d'hydratation. */
  initialNow: number;
  /** Largeur de la colonne des heures. */
  rail: number;
};

/**
 * Le trait « il est maintenant ».
 *
 * On part de l'heure du serveur pour le premier rendu, puis on repasse
 * sur l'horloge du navigateur après l'hydratation. Sans ça, le HTML
 * serveur et le HTML client différeraient dès qu'une minute s'écoule
 * entre les deux.
 */
export function NowLine({ startHour, initialNow, rail }: NowLineProps) {
  const [now, setNow] = useState(initialNow);

  useEffect(() => {
    // On se cale sur la prochaine minute pleine plutôt que de mettre à
    // jour tout de suite : le trait bouge alors pile au changement de
    // minute, et l'effet ne déclenche pas un rendu en cascade juste
    // après l'hydratation.
    let interval: ReturnType<typeof setInterval>;
    const timeout = setTimeout(
      () => {
        setNow(Date.now());
        interval = setInterval(() => setNow(Date.now()), 60_000);
      },
      60_000 - (Date.now() % 60_000),
    );

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  const d = casaDate(now);
  const minutes = d.getHours() * 60 + d.getMinutes();
  const top = ((minutes - startHour * 60) / 60) * HOUR_HEIGHT;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-4 z-20 flex items-center"
      style={{ top, left: rail + 8 }}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
      <span className="h-px flex-1 bg-accent" />
    </div>
  );
}
