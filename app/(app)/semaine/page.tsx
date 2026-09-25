import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { addDays } from "date-fns";
import { WeekBoard } from "@/components/calendar/week-board";
import { getCasaContext, getEvents } from "@/lib/data/casa";
import { getMyConnections } from "@/lib/data/calendar";
import { getCatalogue } from "@/lib/data/catalogue";
import { nowMs } from "@/lib/clock";
import { casaStartOfDay, weekAnchor, weekDays } from "@/lib/date";

export const metadata: Metadata = { title: "Semaine" };

/** Bornes raisonnables : ni l'an dernier, ni l'an prochain. */
const MAX_WEEKS = 52;

export default async function WeekPage({
  searchParams,
}: {
  // Next 16 : `searchParams` est une Promise.
  searchParams: Promise<{ s?: string }>;
}) {
  // Cf. /aujourdhui : sans ça, la semaine affichée serait celle du build.
  await connection();

  const context = await getCasaContext();
  if (!context) redirect("/bienvenue");

  const { s } = await searchParams;
  const parsed = Number.parseInt(s ?? "0", 10);
  const weekOffset = Number.isFinite(parsed)
    ? Math.max(-MAX_WEEKS, Math.min(MAX_WEEKS, parsed))
    : 0;

  const now = nowMs();

  /* `weekAnchor` et `addDays`, jamais l'arithmétique en millisecondes
     (JON-60). Une semaine murale fait 167 ou 169 heures quand elle
     enjambe un changement d'heure, et une journée 23 ou 25.

     L'ancre passe par `lib/date.ts` parce que `WeekBoard` la recalcule
     pour dessiner l'en-tête et le rail : deux formules différentes ici
     et là-bas afficheraient une semaine et chargeraient les événements
     d'une autre. */
  const days = weekDays(weekAnchor(now, weekOffset));
  const from = casaStartOfDay(days[0]).getTime();
  const to = addDays(casaStartOfDay(days[6]), 1).getTime();

  const events = await getEvents(context.familyId, from, to);

  // Les raccourcis de la maison, pour la feuille de création (D45).
  const catalogue = await getCatalogue(context.familyId);

  // Cf. /aujourdhui : le rafraîchissement est déclenché par le client.
  const connections = await getMyConnections();

  /* L'en-tête, le rail et le bouton d'écoute sont rendus PAR
     `WeekBoard` et non ici (D46, D47). La portée — « la maison » ou
     « moi » — est un état client, le rail en dépend, et l'en-tête doit
     porter le rail pour qu'il n'y ait qu'un seul élément collant à
     l'écran. Les trois ne peuvent donc pas vivre dans trois arbres
     différents. */
  return (
    <WeekBoard
      members={context.members}
      events={events}
      meId={context.me.id}
      now={now}
      weekOffset={weekOffset}
      catalogue={catalogue}
      hasConnections={connections.length > 0}
      needsReauth={connections.some((c) => c.needsReauth)}
    />
  );
}
