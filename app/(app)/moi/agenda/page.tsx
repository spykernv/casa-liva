import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck2, CalendarSync } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shell/page-header";
import { GoogleSettings, ReauthNotice } from "@/components/calendar/google-settings";
import { getCasaContext } from "@/lib/data/casa";
import {
  getMyConnections,
  hasGoogleAccess,
  listAvailableCalendars,
} from "@/lib/data/calendar";
import { isGoogleConfigured } from "@/lib/google/token";
import { connectGoogleCalendar } from "@/actions/calendar";
import { formatDayLong, formatTime } from "@/lib/date";

export const metadata: Metadata = { title: "Mon agenda" };

/** Message d'échec au retour d'une tentative de connexion. */
const ERRORS: Record<string, string> = {
  configuration:
    "L’agenda Google n’est pas configuré côté serveur. Ce n’est pas toi, c’est nous.",
  demarrage: "On n’a pas réussi à joindre Google. Réessaie dans un instant.",
  // Refuser n'est pas une erreur. On ne gronde personne pour avoir dit
  // non à un écran qui affiche « application non vérifiée ».
  refus:
    "Tu n’as pas donné ton accord à Google — c’est ton droit le plus strict. Ton agenda reste chez toi, et tu peux réessayer quand tu veux.",
};

/** Les refus ne s'affichent pas en rouge : ce n'est pas une panne. */
const GENTLE = new Set(["refus"]);

export default async function MyCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string; bienvenue?: string }>;
}) {
  const context = await getCasaContext();
  if (!context) redirect("/bienvenue");

  const { erreur, bienvenue } = await searchParams;
  // Arrivée depuis l'onboarding : il faut pouvoir passer son chemin.
  const firstTime = bienvenue === "1";
  const failure = erreur ? ERRORS[erreur] : undefined;
  const gentle = Boolean(erreur && GENTLE.has(erreur));

  const header = (
    <PageHeader
      title="Mon agenda"
      brand={false}
      back={{ href: "/moi", label: "Moi" }}
    />
  );

  /* ── Rien n'est configuré côté serveur ────────────────────────
     On le dit franchement plutôt que d'afficher un bouton qui ne
     peut pas marcher. */
  if (!isGoogleConfigured()) {
    return (
      <>
        {header}
        <ConnectPitch disabled reason="L’agenda Google n’est pas encore configuré côté serveur." />
      </>
    );
  }

  const connections = await getMyConnections();
  const authorized = await hasGoogleAccess(context.me.id);

  /* ── Jamais autorisé : un bouton, et c'est tout ───────────────── */
  if (!authorized) {
    return (
      <>
        {header}
        {failure && <Failure message={failure} gentle={gentle} />}
        <ConnectPitch firstTime={firstTime} />
      </>
    );
  }

  const available = await listAvailableCalendars(context.me.id);

  /* ── Google ne veut plus de notre jeton ──────────────────────── */
  const revoked =
    (!available.ok && available.reason === "reauth") ||
    connections.some((c) => c.needsReauth);

  if (revoked) {
    return (
      <>
        {header}
        <ReauthNotice>
          <p className="text-[0.9375rem] font-medium text-ink">
            Google a besoin que tu redises oui
          </p>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-2">
            Ça arrive&nbsp;: une autorisation retirée, un mot de passe changé.
            Tes réglages sont intacts, il suffit de réautoriser.
          </p>
          <form action={connectGoogleCalendar} className="mt-4">
            <Button type="submit">Reconnecter mon agenda</Button>
          </form>
        </ReauthNotice>
      </>
    );
  }

  if (!available.ok) {
    return (
      <>
        {header}
        <Failure message="Impossible de lire tes agendas Google pour l’instant. Réessaie dans un moment." />
      </>
    );
  }

  const lastSync = connections
    .map((c) => c.lastSyncedAt)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);

  return (
    <>
      {header}
      {failure && <Failure message={failure} gentle={gentle} />}

      {connections.length > 0 && (
        <p className="flex items-center gap-2 px-4 pt-5 text-[0.875rem] text-ink-2">
          <CalendarCheck2
            size={17}
            strokeWidth={2.2}
            aria-hidden="true"
            className="shrink-0 text-success"
          />
          {lastSync
            ? `Dernière mise à jour ${formatDayLong(lastSync).toLowerCase()} à ${formatTime(lastSync)}.`
            : "Connecté. La première récupération arrive."}
        </p>
      )}

      <GoogleSettings calendars={available.calendars} connections={connections} />
    </>
  );
}

function Failure({ message, gentle = false }: { message: string; gentle?: boolean }) {
  return (
    <p
      role={gentle ? "status" : "alert"}
      className={
        gentle
          ? "mx-4 mt-5 rounded-casa-md border border-line bg-surface-2 px-4 py-3 text-[0.875rem] leading-relaxed text-ink-2"
          : "mx-4 mt-5 rounded-casa-md border border-danger/30 bg-danger-soft px-4 py-3 text-[0.875rem] font-medium text-danger"
      }
    >
      {message}
    </p>
  );
}

/** L'argument, puis le bouton. Une phrase, pas un formulaire. */
function ConnectPitch({
  disabled = false,
  reason,
  firstTime = false,
}: {
  disabled?: boolean;
  reason?: string;
  /** Juste après l'onboarding : on propose de remettre ça à plus tard. */
  firstTime?: boolean;
}) {
  return (
    <section className="px-4 pt-8">
      <div className="rounded-casa-lg border border-line bg-surface p-6 text-center shadow-casa-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
          <CalendarSync size={26} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <h2 className="mt-4 font-display text-[1.25rem] font-semibold text-ink">
          Ton agenda Google, ici
        </h2>
        <p className="mx-auto mt-2 max-w-xs text-[0.9375rem] leading-relaxed text-ink-2">
          Tes rendez-vous apparaissent dans la maison sans que tu changes quoi
          que ce soit à tes habitudes. Tu choisiras juste après ce que les
          autres ont le droit d’en voir.
        </p>

        {disabled ? (
          <p className="mt-6 text-[0.875rem] font-medium text-ink-3">{reason}</p>
        ) : (
          <form action={connectGoogleCalendar} className="mt-6">
            <Button type="submit" size="lg" block>
              Connecter mon agenda Google
            </Button>
          </form>
        )}
        {firstTime && !disabled && (
          // « Plus tard » n'est pas décoratif : Google affiche
          // « application non vérifiée » (D8), et personne ne doit
          // rester coincé devant au premier jour.
          <Link
            href="/aujourdhui"
            className="mt-2 inline-flex min-h-tap items-center justify-center px-4 text-[0.9375rem] font-semibold text-ink-2 hover:text-ink"
          >
            Plus tard
          </Link>
        )}
      </div>

      <p className="mt-5 text-center text-[0.8125rem] leading-relaxed text-ink-3">
        Google affichera un avertissement «&nbsp;application non vérifiée&nbsp;»
        — c’est normal pour une app familiale qui n’est pas publique. Passe par
        <em> Paramètres avancés</em>, puis continue.
      </p>
    </section>
  );
}
