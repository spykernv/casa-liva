import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Ça n’a pas marché" };

/**
 * Deux échecs très différents partagent cet écran, parce qu'ils
 * arrivent tous les deux au retour d'une redirection : un lien de
 * connexion périmé, et un consentement Google donné depuis le mauvais
 * compte. Le second est le plus déroutant des deux — il faut dire
 * précisément ce qui s'est passé, sinon la personne croit avoir perdu
 * sa maison.
 */
const REASONS = {
  "compte-google": {
    title: "Ce n’est pas le même compte",
    body: "Tu as autorisé un compte Google dont l’adresse est différente de celle qui te connecte à Casa Liva. Pour Google, ce sont deux personnes — et Casa Liva ne peut pas deviner que c’est toi. Reconnecte-toi avec ton adresse habituelle, puis choisis ce compte-là au moment d’autoriser.",
    action: "Revenir à la connexion",
  },
  default: {
    title: "Ce lien ne marche plus",
    body: "Les liens de connexion expirent vite, et ne servent qu’une fois. C’est contrariant sur le moment, mais c’est ce qui fait qu’un vieil email traînant dans une boîte ne donne accès à rien.",
    action: "En demander un nouveau",
  },
} as const;

export default async function AuthErrorPage({
  searchParams,
}: {
  // Next 16 : `searchParams` est une Promise, l'accès synchrone a été
  // supprimé.
  searchParams: Promise<{ raison?: string }>;
}) {
  const { raison } = await searchParams;
  const content =
    raison && raison in REASONS
      ? REASONS[raison as keyof typeof REASONS]
      : REASONS.default;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center safe-t safe-b">
      <h1 className="font-display text-[1.75rem] font-semibold text-ink">
        {content.title}
      </h1>
      <p className="mt-3 max-w-sm text-[1rem] leading-relaxed text-ink-2">
        {content.body}
      </p>
      <Link
        href="/connexion"
        className="mt-7 inline-flex h-12 items-center justify-center rounded-casa bg-accent px-5 font-semibold text-white shadow-casa-accent"
      >
        {content.action}
      </Link>
    </main>
  );
}
