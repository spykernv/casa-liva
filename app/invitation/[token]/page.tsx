import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCasaContext, getUserId } from "@/lib/data/casa";
import { getInviteByToken } from "@/lib/data/invite";
import { AcceptInvite } from "./accept-invite";

export const metadata: Metadata = { title: "Invitation" };

/**
 * L'écran d'invitation **ne mute plus rien**.
 *
 * Il appelait `accept_family_invite` dans le rendu du GET : ouvrir
 * l'URL suffisait à changer de maison, sans question ni « Annuler »,
 * et le moindre préchargement du lien brûlait le jeton. La mutation
 * est passée dans une Server Action, déclenchée par un vrai bouton.
 */
export default async function InvitePage({
  params,
}: {
  // Next 16 : `params` est une Promise.
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Lecture par la clé de service : la personne invitée n'est pas
  // encore dans la maison, et peut ne pas être connectée du tout.
  const invite = await getInviteByToken(token);

  if (!invite) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center safe-t safe-b">
        <h1 className="font-display text-[1.75rem] font-semibold text-ink">
          Ce lien ne mène nulle part
        </h1>
        <p className="mt-3 max-w-sm text-[1rem] leading-relaxed text-ink-2">
          Il est peut-être incomplet — les liens se coupent facilement dans un
          SMS. Demande qu’on te le renvoie en entier.
        </p>
        <Link
          href="/connexion"
          className="mt-7 inline-flex h-12 items-center justify-center rounded-casa-md bg-accent px-5 font-semibold text-white shadow-casa-accent"
        >
          Se connecter
        </Link>
      </main>
    );
  }

  const userId = await getUserId();

  if (!userId) {
    return (
      <main className="casa-glow flex min-h-dvh flex-col items-center justify-center px-6 text-center safe-t safe-b">
        <p className="text-5xl" aria-hidden="true">🏡</p>
        <h1 className="mt-5 font-display text-[1.875rem] font-semibold leading-tight text-ink">
          {invite.invitedBy} t’attend
        </h1>
        <p className="mt-3 max-w-sm text-[1rem] leading-relaxed text-ink-2">
          Connecte-toi, et tu rejoins {invite.familyName} juste après.
        </p>
        {/* Le fil de l'invitation ne se coupe pas : `suite` ramène ici
            une fois la personne connectée. */}
        <Link
          href={`/connexion?suite=${encodeURIComponent(`/invitation/${token}`)}`}
          className="mt-8 inline-flex h-14 items-center justify-center rounded-casa-md bg-accent px-6 font-semibold text-white shadow-casa-accent"
        >
          Se connecter
        </Link>
      </main>
    );
  }

  const context = await getCasaContext();

  // Déjà chez soi : recliquer son propre lien n'est pas une erreur, et
  // n'a aucune raison d'afficher « invitation déjà utilisée ».
  if (context?.familyId === invite.familyId) redirect("/aujourdhui");

  return (
    <AcceptInvite
      token={token}
      familyName={invite.familyName}
      invitedBy={invite.invitedBy}
      current={
        context
          ? { name: context.familyName, others: context.members.length - 1 }
          : null
      }
    />
  );
}
