import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ChevronRight, Sparkles } from "lucide-react";
import type { CasaEvent } from "@/types";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { OpportunityAction } from "@/components/availability/opportunity-action";
import { InviteButton } from "@/components/family/invite-button";
import { PageHeader } from "@/components/shell/page-header";
import { getCasaContext, getEvents } from "@/lib/data/casa";
import { getCatalogue } from "@/lib/data/catalogue";
import { nowMs } from "@/lib/clock";
import { everyoneFreeToday, HOUR } from "@/lib/availability/availability";
import { summarizeDay } from "@/lib/calendar/summary";
import { addDays } from "date-fns";
import { casaDays, casaStartOfDay, formatDayLong, formatTime, isSameCasaDay } from "@/lib/date";
import { memberStyle } from "@/lib/design/member-color";

export const metadata: Metadata = { title: "Casa" };

export default async function CasaPage() {
  // Cf. /aujourdhui : l'agenda du jour doit être celui de la requête.
  await connection();

  const context = await getCasaContext();
  if (!context) redirect("/bienvenue");

  const now = nowMs();
  const from = casaStartOfDay(now).getTime();
  // `addDays` et non 8 × 24 h (JON-60) : huit jours qui enjambent un
  // changement d'heure n'en font pas 192.
  const events = await getEvents(context.familyId, from, addDays(casaStartOfDay(now), 8).getTime());
  const todayEvents = events.filter((e) => isSameCasaDay(e.startAt, now));

  const catalogue = await getCatalogue(context.familyId);
  const everyone = context.members.map((m) => m.id);
  const opportunity =
    context.members.length > 1 ? findNextOpportunity(now, events, everyone) : null;

  return (
    <>
      <PageHeader
        title="Casa"
        subtitle={
          context.members.length === 1
            ? "Pour l’instant, tu es seul ici"
            : `${context.members.length} habitants`
        }
      />

      {/* L'action principale de cet onglet, toujours au même endroit —
          au-dessus de l'opportunité, qui elle va et vient. Une personne
          âgée doit retrouver le même bouton à la même place. */}
      <Link
        href="/casa/trouver"
        className="mx-4 mt-4 flex min-h-tap items-center gap-3 rounded-casa-md border border-magic/35 bg-surface p-3.5 shadow-casa-sm transition-colors hover:border-magic/60"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-magic-soft text-magic">
          <Sparkles size={21} strokeWidth={2.3} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[1.0625rem] font-semibold text-ink">
            Trouver un moment
          </span>
          <span className="block truncate text-[0.875rem] text-ink-2">
            Quand est-ce qu’on est libres tous ensemble&nbsp;?
          </span>
        </span>
        <ChevronRight
          size={20}
          strokeWidth={2.2}
          aria-hidden="true"
          className="shrink-0 text-ink-3"
        />
      </Link>

      {opportunity && (
        <section className="mx-4 mt-4 overflow-hidden rounded-casa-lg border border-magic/35 bg-magic-soft p-4">
          <p className="flex items-center gap-1.5 text-[0.8125rem] font-bold uppercase tracking-wide text-magic">
            <Sparkles size={15} strokeWidth={2.6} aria-hidden="true" />
            Opportunité Casa
          </p>
          <p className="mt-2 text-[1.0625rem] font-semibold leading-snug text-ink">
            Tout le monde est libre {opportunity.when}
            <br />
            {formatTime(opportunity.start)} → {formatTime(opportunity.end)}.
          </p>
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-2">
            Ça ressemble dangereusement à un créneau pour un apéro.
          </p>
          {/* La suggestion portait la copy du plan et **aucun bouton**
              depuis la phase 5. §36-38 appariait pourtant la suggestion
              et l'action ; livrer la première seule laissait la moitié
              du chapitre à moitié construite (JON-65). */}
          <div className="mt-3.5 flex items-center gap-3">
            <AvatarStack members={context.members} size="sm" max={5} />
            <OpportunityAction
              start={opportunity.start}
              end={opportunity.end}
              members={context.members}
              meId={context.me.id}
              catalogue={catalogue}
            />
          </div>
        </section>
      )}

      <section className="px-4 pt-5">
        <h2 className="pb-2 text-[0.8125rem] font-bold uppercase tracking-wide text-ink-3">
          {formatDayLong(now)}
        </h2>
        <ul className="space-y-2">
          {context.members.map((member) => (
            <li key={member.id}>
              <div
                style={memberStyle(member.color)}
                className="flex items-center gap-3 rounded-casa-md border border-line bg-surface p-3 shadow-casa-sm"
              >
                <Avatar member={member} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[1.0625rem] font-semibold text-ink">
                    {member.firstName}
                    {member.id === context.me.id && (
                      <span className="ml-1.5 text-[0.8125rem] font-normal text-ink-3">
                        toi
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[0.875rem] text-ink-2">
                    {summarizeDay(member.id, todayEvents, now)}
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="h-9 w-1.5 shrink-0 rounded-full bg-[var(--m)]"
                />
              </div>
            </li>
          ))}
        </ul>

        <div className="pt-4">
          <InviteButton />
        </div>

        {context.members.length === 1 && (
          <p className="pt-4 text-center text-[0.875rem] leading-relaxed text-ink-3">
            Un agenda familial avec une seule personne, c’est juste un agenda.
            Invite quelqu’un&nbsp;: c’est là que ça devient intéressant.
          </p>
        )}
      </section>
    </>
  );
}

/** Le prochain créneau d'au moins deux heures où tout le monde est libre. */
function findNextOpportunity(now: number, events: CasaEvent[], everyone: string[]) {
  /* `casaDays` et non `offset * 24 h` (JON-60). Sans ça, la semaine
     d'un changement d'heure balaie deux fois le même jour ou en saute
     un — et « demain » (offset === 1) pouvait désigner aujourd'hui.

     Le balayage vit dans `lib/date.ts` depuis JON-69 : tant qu'il
     était écrit ici, aucun contrôle ne pouvait l'appeler sans tirer
     toute la lecture de la base derrière lui. */
  const sweep = casaDays(now, 7);

  for (let offset = 0; offset < sweep.length; offset++) {
    const day = sweep[offset].getTime();
    const bands = everyoneFreeToday(everyone, events, day, 2 * HOUR).filter(
      (b) => b.end > now,
    );
    if (bands.length === 0) continue;

    const band = bands[0];
    const when =
      offset === 0
        ? "aujourd’hui"
        : offset === 1
          ? "demain"
          : formatDayLong(day).toLowerCase();
    return { when, start: band.start, end: band.end };
  }
  return null;
}
