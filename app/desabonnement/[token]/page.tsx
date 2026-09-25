import type { Metadata } from "next";
import Link from "next/link";
import { unsubscribeByToken } from "@/lib/email/unsubscribe";

export const metadata: Metadata = { title: "Ne plus recevoir" };

/**
 * Le désabonnement, côté humain.
 *
 * **Ici, et uniquement ici, un GET écrit** — à rebours de la règle que
 * D18 a posée pour `/invitation` et que `/rsvp` respecte.
 *
 * Le raisonnement est inversé parce que la conséquence l'est. Un robot
 * qui préchargerait ce lien couperait des emails : c'est agaçant,
 * réversible en un tap, et sans effet sur les données de la maison.
 * Demander une confirmation coûterait bien plus cher — quelqu'un qui
 * veut arrêter de recevoir et à qui on oppose un écran de plus
 * n'appuie pas sur « confirmer », il appuie sur « indésirable ». Et
 * c'est le domaine entier qui tombe, lien de connexion compris.
 *
 * Le pire cas d'un GET trop obéissant, c'est donc de rendre exactement
 * le service demandé, un peu trop tôt.
 */
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const done = await unsubscribeByToken(token);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10 text-center">
      <p className="font-display text-[0.9375rem] font-semibold tracking-tight text-accent">
        Casa Liva
      </p>
      <h1 className="mt-2 text-[1.375rem] font-bold leading-tight text-ink">
        {done ? "C’est fait, on se tait." : "Ce lien ne dit plus rien."}
      </h1>
      <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-2">
        {done ? (
          <>
            Plus de résumés ni de rappels. Tu recevras toujours les
            invitations à un événement et ton lien de connexion&nbsp;: sans
            eux, l’application ne marcherait plus.
          </>
        ) : (
          <>
            Il a peut-être déjà servi, ou il vient d’un très vieux message.
            Le réglage est aussi dans ton profil.
          </>
        )}
      </p>
      <Link
        href="/moi"
        className="mt-7 text-[0.9375rem] font-semibold text-accent"
      >
        {done ? "Changer d’avis" : "Ouvrir mon profil"}
      </Link>
    </main>
  );
}
