import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Listen } from "@/components/ai/listen";
import { InstallInvite } from "@/components/pwa/install-invite";
import { SyncControl } from "@/components/calendar/sync-control";
import { DayBoard } from "@/components/calendar/day-board";
import { PageHeader } from "@/components/shell/page-header";
import { getCasaContext, getEvents } from "@/lib/data/casa";
import { getMyConnections } from "@/lib/data/calendar";
import { getCatalogue } from "@/lib/data/catalogue";
import { addDays } from "date-fns";
import { nowMs } from "@/lib/clock";
import { casaStartOfDay, formatDayLong } from "@/lib/date";

export const metadata: Metadata = { title: "Aujourd’hui" };

export default async function TodayPage({
  searchParams,
}: {
  // Next 16 : `searchParams` est une Promise.
  searchParams: Promise<{ arrivee?: string }>;
}) {
  // Sans `connection()`, Next pré-rendrait cette page au build et
  // « aujourd'hui » resterait figé au jour du déploiement. Lire
  // l'horloge ne suffit pas à rendre une page dynamique.
  await connection();

  const context = await getCasaContext();
  if (!context) redirect("/bienvenue");

  // `now` est calculé ici, côté serveur, et transmis aux composants
  // client : c'est la seule horloge de vérité du premier rendu.
  const now = nowMs();
  const dayStart = casaStartOfDay(now).getTime();
  // `addDays` plutôt que 24 heures : les deux dimanches de changement
  // d'heure en font 23 ou 25 (JON-60).
  const dayEnd = addDays(casaStartOfDay(now), 1).getTime();
  const events = await getEvents(context.familyId, dayStart, dayEnd);

  // Les raccourcis de la maison, pour la feuille de création (D45).
  const catalogue = await getCatalogue(context.familyId);

  /* Le rafraîchissement des agendas est déclenché depuis le
     navigateur (`SyncControl`), et non par `after()`.

     `after()` tournait bien, mais après l'envoi de la réponse : la
     page qu'on regardait avait déjà été rendue avec les anciennes
     données. Ça marchait sans se voir, ce qui revient au même. */
  const connections = await getMyConnections();

  // Rejoindre une maison ne provoquait aucun mot : on atterrissait sur
  // l'agenda sans savoir si ça avait marché.
  const { arrivee } = await searchParams;

  return (
    <>
      <PageHeader
        title={formatDayLong(now)}
        actions={
          connections.length > 0 ? (
            <SyncControl needsReauth={connections.some((c) => c.needsReauth)} />
          ) : undefined
        }
      />
      {arrivee === "1" && (
        <p
          role="status"
          className="mx-4 mt-4 rounded-casa-md border border-success/30 bg-success-soft px-4 py-3 text-[0.9375rem] leading-relaxed text-ink"
        >
          Ça y est, tu es chez <strong>{context.familyName}</strong>. Voilà ce
          que la maison a prévu.
        </p>
      )}

      {/* Le bon moment n'est pas la première seconde : ce composant ne
          se montre qu'à partir de la deuxième ouverture, jamais si l'app
          tourne déjà depuis l'écran d'accueil, et plus du tout si on l'a
          masqué (JON-18). */}
      <InstallInvite emplacement="bandeau" />

      {/* Au-dessus de la grille, pas dans l'en-tête : c'est la raison
          d'ouvrir l'app un matin où on n'a pas les mains libres (§27).
          Il n'envoie que « aujourdhui » — le texte est écrit côté
          serveur, à partir d'événements déjà masqués. */}
      <div className="px-4 pt-4">
        {/* « La journée de la maison » et non « ma journée » (D48).
            Le libellé disait « ma », et la route lit l'agenda de TOUTE
            la maison — c'est ce que la grille en dessous montre. Un
            bouton qui promet une chose et en prononce une autre est
            exactement ce que D36 interdit à l'écrit ; il n'y a aucune
            raison que ce soit moins vrai à l'oral. La portée « moi »
            existe désormais, mais cet écran n'a pas encore le sélecteur
            qui la rendrait cohérente avec ce qui est affiché. */}
        <Listen
          source={{ kind: "briefing", quoi: "aujourdhui", pour: "maison" }}
          label="Écouter la journée de la maison"
          variant="carte"
        />
      </div>

      <DayBoard
        members={context.members}
        events={events}
        meId={context.me.id}
        now={now}
        day={now}
        catalogue={catalogue}
      />
    </>
  );
}
