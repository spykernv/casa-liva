import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarSync, ChevronRight, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DigestToggle } from "@/components/family/digest-toggle";
import { ProfileEditor } from "@/components/family/profile-editor";
import { InstallInvite } from "@/components/pwa/install-invite";
import { PushToggle } from "@/components/pwa/push-toggle";
import { PageHeader } from "@/components/shell/page-header";
import { VoicePicker } from "@/components/family/voice-picker";
import { getCasaContext, myVoice, wantsDigests, wantsPush } from "@/lib/data/casa";
import { getMyConnections } from "@/lib/data/calendar";
import { signOut } from "@/actions/family";

export const metadata: Metadata = { title: "Moi" };

export default async function MePage() {
  const context = await getCasaContext();
  if (!context) redirect("/bienvenue");

  const digests = await wantsDigests();
  const push = await wantsPush();
  const voice = await myVoice();
  const connections = await getMyConnections();
  const needsReauth = connections.some((c) => c.needsReauth);

  const calendarStatus = needsReauth
    ? "Google demande une nouvelle autorisation."
    : connections.length === 0
      ? "Un bouton, autoriser, connecté."
      : connections.length === 1
        ? connections[0].name
        : `${connections.length} agendas synchronisés`;

  return (
    <>
      <PageHeader title="Moi" brand={false} />

      <ProfileEditor me={context.me} />

      {/* La ligne permanente. Sans elle, masquer le bandeau une fois
          reviendrait à supprimer la fonctionnalité — et « Plus tard »
          ne voudrait plus rien dire. Elle ne s'affiche pas si l'app est
          déjà installée (JON-18). */}
      <section className="px-4 pt-8">
        <h3 className="pb-2.5 text-[0.8125rem] font-bold uppercase tracking-wide text-ink-3">
          Casa Liva sur ce téléphone
        </h3>
        <div className="space-y-3">
          <InstallInvite emplacement="reglage" />
          {/* Deux interrupteurs et non un (§66 bis) : le push d'abord,
              l'email en relais. Ils vivent côte à côte pour qu'on voie
              du premier coup d'œil par où l'on sera prévenu. */}
          <PushToggle initial={push} />
        </div>
      </section>

      <section className="px-4 pt-8">
        <h3 className="pb-2.5 text-[0.8125rem] font-bold uppercase tracking-wide text-ink-3">
          Mon agenda
        </h3>
        <Link
          href="/moi/agenda"
          className="flex min-h-16 items-center gap-3 rounded-casa-md border border-line bg-surface px-4 py-3 shadow-casa-sm hover:border-line-strong"
        >
          <CalendarSync
            size={20}
            strokeWidth={2}
            aria-hidden="true"
            className={needsReauth ? "shrink-0 text-warn" : "shrink-0 text-ink-3"}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-medium text-ink">
              Mon Google Calendar
            </span>
            <span
              className={
                needsReauth
                  ? "block truncate text-[0.8125rem] font-medium text-warn"
                  : "block truncate text-[0.8125rem] text-ink-3"
              }
            >
              {calendarStatus}
            </span>
          </span>
          <ChevronRight
            size={18}
            strokeWidth={2.2}
            aria-hidden="true"
            className="shrink-0 text-ink-3"
          />
        </Link>
      </section>

      <VoicePicker initial={voice} />

      <section className="px-4 pt-8">
        <h3 className="pb-2.5 text-[0.8125rem] font-bold uppercase tracking-wide text-ink-3">
          Ce que Casa Liva t’envoie
        </h3>
        <DigestToggle initial={digests} />
        <p className="pt-2.5 text-[0.8125rem] leading-relaxed text-ink-3">
          Les invitations à un événement et ton lien de connexion arrivent
          toujours&nbsp;: ils répondent à quelque chose que quelqu’un a fait.
        </p>
      </section>

      <section className="px-4 pt-6">
        <form action={signOut}>
          <Button type="submit" variant="ghost" block className="text-ink-3">
            <LogOut size={18} strokeWidth={2} aria-hidden="true" />
            Se déconnecter
          </Button>
        </form>
      </section>
    </>
  );
}
