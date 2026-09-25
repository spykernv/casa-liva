import type { Metadata } from "next";
import Link from "next/link";
import type { ParticipantStatus } from "@/types";
import { RsvpAnswer } from "@/app/rsvp/[token]/answer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatAllDayRange,
  formatDayLong,
  formatTime,
  isSameCasaDay,
} from "@/lib/date";

export const metadata: Metadata = { title: "Ta réponse" };

/* ═══════════════════════════════════════════════════════════════
   L'écran qui DEMANDE.

   Le lien de l'email n'écrit rien : il ouvre cette page. Gmail et
   Outlook préchargent et analysent les liens qu'ils reçoivent — un
   `GET` qui enregistrerait la réponse dirait « je viens » tout seul,
   avant même que le message soit ouvert.

   C'est mot pour mot l'erreur que D18 a corrigée sur
   `/invitation/[token]` : « rejoindre ne se fait plus dans le rendu
   d'un GET ». On ne la refait pas trois mois plus tard sur une autre
   route.

   Bénéfice au passage : on voit à quoi on répond.
   ═══════════════════════════════════════════════════════════════ */

type Params = Promise<{ token: string }>;
type Search = Promise<{ r?: string }>;

export default async function RsvpPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { token } = await params;
  const { r } = await searchParams;

  /* Clé de service, comme l'action : la table des jetons n'a aucune
     policy, et la personne qui arrive ici n'est probablement pas
     connectée — c'est tout l'intérêt. */
  const supabase = createAdminClient();

  const { data: link } = await supabase
    .from("event_rsvp_tokens")
    .select("event_id, user_id")
    .eq("token", token)
    .maybeSingle();

  if (!link) return <Expired />;

  const { data: event } = await supabase
    .from("events")
    .select("title, emoji, location, start_at, end_at, all_day, creator_id")
    .eq("id", link.event_id)
    .maybeSingle();

  const { data: me } = await supabase
    .from("users")
    .select("first_name")
    .eq("id", link.user_id)
    .maybeSingle();

  const { data: participation } = await supabase
    .from("event_participants")
    .select("status")
    .eq("event_id", link.event_id)
    .eq("user_id", link.user_id)
    .maybeSingle();

  if (!event) return <Gone />;

  const { data: organiser } = await supabase
    .from("users")
    .select("first_name")
    .eq("id", event.creator_id)
    .maybeSingle();

  const when = event.all_day
    ? `${formatAllDayRange(event.start_at, event.end_at)} · toute la journée`
    : `${formatDayLong(event.start_at)} · ${formatTime(event.start_at)} → ${
        isSameCasaDay(event.start_at, event.end_at)
          ? formatTime(event.end_at)
          : `${formatDayLong(event.end_at)} ${formatTime(event.end_at)}`
      }`;

  // `?r=` vient du bouton cliqué dans l'email. Il ne décide de rien —
  // il met juste en avant la réponse qu'on avait en tête.
  const hinted: ParticipantStatus | undefined =
    r === "oui" ? "accepted" : r === "non" ? "declined" : undefined;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <p className="font-display text-[0.9375rem] font-semibold tracking-tight text-accent">
        Casa Liva
      </p>
      <h1 className="mt-1 text-[1.5rem] font-bold leading-tight tracking-tight text-ink">
        {me?.first_name ? `${me.first_name}, tu viens ?` : "Tu viens ?"}
      </h1>

      <div className="mt-5 rounded-casa-md border border-line bg-surface p-4 shadow-casa-sm">
        <p className="text-[1.1875rem] font-bold leading-snug text-ink">
          {event.emoji && <span aria-hidden="true">{event.emoji} </span>}
          {event.title}
        </p>
        <p className="mt-1.5 text-[1rem] text-ink-2">{when}</p>
        {event.location && (
          <p className="mt-0.5 text-[0.9375rem] text-ink-2">{event.location}</p>
        )}
        {organiser?.first_name && (
          <p className="mt-2.5 text-[0.875rem] text-ink-3">
            Organisé par {organiser.first_name}.
          </p>
        )}
      </div>

      {participation ? (
        <RsvpAnswer
          token={token}
          current={participation.status}
          hinted={hinted}
        />
      ) : (
        <p className="mt-6 rounded-casa border border-line bg-surface-2/60 px-4 py-3 text-[0.9375rem] leading-relaxed text-ink-2">
          Tu n’es plus sur la liste de cet événement. Ça arrive — demande à{" "}
          {organiser?.first_name ?? "l’organisateur"}.
        </p>
      )}

      <Link
        href="/aujourdhui"
        className="mt-8 text-center text-[0.9375rem] font-semibold text-accent"
      >
        Ouvrir Casa Liva
      </Link>
    </main>
  );
}

function Expired() {
  return (
    <Message
      titre="Ce lien a fait son temps."
      texte="Il a peut-être été remplacé par un plus récent, ou l’événement n’existe plus. Ouvre Casa Liva pour voir où ça en est."
    />
  );
}

function Gone() {
  return (
    <Message
      titre="Cet événement n’existe plus."
      texte="Quelqu’un l’a annulé entre-temps. Rien de grave — il reste sûrement autre chose de prévu."
    />
  );
}

function Message({ titre, texte }: { titre: string; texte: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10 text-center">
      <p className="font-display text-[0.9375rem] font-semibold tracking-tight text-accent">
        Casa Liva
      </p>
      <h1 className="mt-2 text-[1.375rem] font-bold leading-tight text-ink">
        {titre}
      </h1>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{texte}</p>
      <Link
        href="/aujourdhui"
        className="mt-7 text-[0.9375rem] font-semibold text-accent"
      >
        Ouvrir Casa Liva
      </Link>
    </main>
  );
}
