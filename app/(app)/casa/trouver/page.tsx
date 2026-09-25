import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { addDays } from "date-fns";
import { CalendarSearch } from "lucide-react";
import { DayForm } from "@/components/availability/day-form";
import { DayPeople } from "@/components/availability/day-people";
import { MomentForm } from "@/components/availability/moment-form";
import { MomentResults } from "@/components/availability/moment-results";
import { PageHeader } from "@/components/shell/page-header";
import { getCasaContext } from "@/lib/data/casa";
import { getCatalogue } from "@/lib/data/catalogue";
import {
  HORIZON_DAYS,
  SEARCH_DAYS,
  findMoments,
  parseDay,
  whoIsFree,
} from "@/lib/data/availability";
import { DEFAULT_DURATION, isDuration } from "@/lib/availability/availability";
import { nowMs } from "@/lib/clock";
import { casaStartOfDay, dayKey, formatDayLong } from "@/lib/date";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Trouver un moment" };

type SearchParams = Promise<{
  quoi?: string;
  /** Répété une fois par personne : `?qui=a&qui=b`. */
  qui?: string | string[];
  duree?: string;
  /** `2026-08-08` — bascule l'écran sur « qui est libre ce jour-là ? ». */
  jour?: string;
}>;

export default async function FindMomentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // La recherche part de « maintenant » : sans ça, Next figerait la
  // page au moment du build et proposerait des créneaux du jour du
  // déploiement.
  await connection();

  const context = await getCasaContext();
  if (!context) redirect("/bienvenue");

  const catalogue = await getCatalogue(context.familyId);
  const params = await searchParams;
  const known = new Set(context.members.map((m) => m.id));

  const title = (params.quoi ?? "").trim();

  /* Les paramètres viennent de l'URL : n'importe qui peut y écrire
     n'importe quoi. On ne garde que des identifiants de la maison, et
     la personne connectée en fait toujours partie — le créneau proposé
     doit être un créneau où *elle* est libre, puisque c'est elle qui
     organise.

     `qui` absent veut dire « toute la maison », pas « moi seul ». Sans
     ça, `/casa/trouver?quoi=Golf` — l'URL qu'on partage par message, et
     celle qu'on tape à la main — chercherait pour une seule personne
     tout en affichant un écran qui, lui, part de la maison entière.
     Deux réponses différentes pour la même question. */
  const asked = params.qui === undefined ? null : [params.qui].flat();
  const chosen =
    asked === null
      ? context.members.map((m) => m.id)
      : asked.filter((id) => known.has(id));
  const userIds = Array.from(new Set([context.me.id, ...chosen]));

  const duration = Number(params.duree);
  const durationMinutes = isDuration(duration) ? duration : DEFAULT_DURATION;

  const now = nowMs();

  /* Deux questions, un écran.

     « Trouver un moment » part d'une envie et cherche quand. « Qui est
     libre ? » part d'une date et regarde qui — c'est la question qu'on
     pose le plus souvent à voix haute, parce qu'on connaît presque
     toujours le jour avant de savoir avec qui.

     Le mode se lit dans l'URL comme le reste : `?jour=` bascule. Un
     jour illisible ou hors horizon retombe sur l'autre mode plutôt que
     d'afficher une erreur — personne n'écrit une date à la main dans
     une barre d'adresse par accident. */
  const day = parseDay(params.jour, now);
  const askingWho = params.jour !== undefined;

  const slots =
    !askingWho && title
      ? await findMoments({
          familyId: context.familyId,
          userIds,
          durationMinutes,
          now,
        })
      : [];

  const availability =
    day !== null
      ? await whoIsFree({
          familyId: context.familyId,
          // Ici on regarde **toute la maison**, toujours : la question
          // est « qui est libre », pas « est-ce que ceux que j'ai
          // cochés le sont ». Filtrer d'avance reviendrait à répondre
          // avant d'avoir demandé.
          userIds: context.members.map((m) => m.id),
          day,
        })
      : null;

  /* La recherche, résumée en une chaîne. Elle sert de `key` au
     formulaire et aux résultats, et c'est elle qui décide quand leur
     état local doit repartir de zéro.

     Les deux en ont besoin, pour des raisons opposées. Les résultats
     doivent **survivre** à un re-rendu (une création revalide la route
     et referait la liste sous les doigts). Le formulaire, lui, doit
     **céder** quand l'URL change : sans ça, un retour arrière laissait
     les cases d'une recherche au-dessus des résultats d'une autre. */
  const searchKey = `${title}|${durationMinutes}|${[...userIds].sort().join(",")}`;

  const today = casaStartOfDay(now).getTime();
  const horizon = addDays(casaStartOfDay(now), HORIZON_DAYS).getTime();

  return (
    <>
      <PageHeader
        title={askingWho ? "Qui est libre ?" : "Trouver un moment"}
        subtitle={
          askingWho && day !== null
            ? formatDayLong(day)
            : `Sur les ${SEARCH_DAYS} prochains jours`
        }
        brand={false}
        back={{ href: "/casa", label: "Casa" }}
      />

      <Modes askingWho={askingWho} today={today} />

      {askingWho ? (
        <>
          <DayForm
            key={day ?? "aucun"}
            defaultDay={day ?? today}
            minDay={today}
            maxDay={horizon}
          />
          {availability && day !== null && (
            <DayPeople
              availability={availability}
              members={context.members}
              meId={context.me.id}
              day={day}
              now={now}
              catalogue={catalogue}
            />
          )}
        </>
      ) : (
        <>
          <MomentForm
            key={searchKey}
            members={context.members}
            meId={context.me.id}
            defaultTitle={title}
            defaultUserIds={userIds}
            defaultDuration={durationMinutes}
          />

          {title ? (
            slots.length > 0 ? (
              <MomentResults
                key={searchKey}
                slots={slots}
                members={context.members}
                title={title}
                now={now}
              />
            ) : (
              <Nothing count={userIds.length} />
            )
          ) : (
            <Hint />
          )}
        </>
      )}
    </>
  );
}

/**
 * Les deux questions, côte à côte.
 *
 * Des liens et non des boutons : le mode vit dans l'URL, donc il se
 * partage et le retour arrière le respecte. C'est aussi ce qui permet
 * d'y arriver directement depuis un email ou un message.
 */
function Modes({ askingWho, today }: { askingWho: boolean; today: number }) {
  const base =
    "flex-1 rounded-casa px-3 py-2.5 text-center text-[0.9375rem] font-semibold transition-colors";

  /* `dayKey`, et surtout pas `new Date(today).getDate()` : le serveur
     tourne en UTC, et minuit à Paris y tombe la veille à 22h. Le lien
     aurait proposé « hier » tout l'été. */
  const jour = dayKey(today);

  return (
    <nav
      aria-label="Que veux-tu chercher ?"
      className="mx-4 mt-4 flex gap-1 rounded-casa-md border border-line bg-surface-2 p-1"
    >
      <Link
        href="/casa/trouver"
        aria-current={askingWho ? undefined : "page"}
        className={cn(
          base,
          askingWho ? "text-ink-2 hover:text-ink" : "bg-surface text-ink shadow-casa-sm",
        )}
      >
        Trouver un moment
      </Link>
      <Link
        href={`/casa/trouver?jour=${jour}`}
        aria-current={askingWho ? "page" : undefined}
        className={cn(
          base,
          askingWho ? "bg-surface text-ink shadow-casa-sm" : "text-ink-2 hover:text-ink",
        )}
      >
        Qui est libre&nbsp;?
      </Link>
    </nav>
  );
}

function Hint() {
  return (
    <section className="mx-4 mt-8 rounded-casa-lg border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-magic-soft text-magic">
        <CalendarSearch size={26} strokeWidth={2} aria-hidden="true" />
      </span>
      <p className="mt-4 text-lg font-semibold text-ink">
        Dis ce que tu veux faire.
      </p>
      <p className="mx-auto mt-2 max-w-xs text-[0.9375rem] leading-relaxed text-ink-2">
        Casa Liva regarde les agendas de tout le monde — les siens comme
        ceux importés de Google — et te rend les moments où ça tombe bien.
      </p>
    </section>
  );
}

function Nothing({ count }: { count: number }) {
  return (
    <section className="mx-4 mt-7 rounded-casa-lg border border-dashed border-line-strong bg-surface/60 px-6 py-10 text-center">
      <p className="text-lg font-semibold text-ink">
        Rien qui tienne debout sur {SEARCH_DAYS} jours.
      </p>
      <p className="mx-auto mt-2 max-w-xs text-[0.9375rem] leading-relaxed text-ink-2">
        {count > 2
          ? "Réunir tout ce monde-là relève de l’exploit. Essaie plus court, ou décoche quelqu’un — quitte à le prévenir après."
          : "Essaie une durée plus courte : deux heures, c’est déjà beaucoup à trouver."}
      </p>
    </section>
  );
}
