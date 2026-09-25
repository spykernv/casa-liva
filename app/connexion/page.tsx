import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PurgeHorsLigne } from "@/components/pwa/purge-hors-ligne";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({
  searchParams,
}: {
  // Next 16 : `searchParams` est une Promise, l'accès synchrone a été
  // supprimé.
  searchParams: Promise<{ suite?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/aujourdhui");

  const { suite } = await searchParams;
  const next = suite?.startsWith("/") && !suite.startsWith("//") ? suite : "/aujourdhui";

  return (
    <main className="casa-glow flex min-h-dvh flex-col justify-center px-5 py-12 safe-t safe-b">
      {/* Arriver ici veut dire qu'on n'est plus connecté — déconnexion
          volontaire ou session expirée. La copie hors-ligne de l'agenda
          ne doit pas survivre à son propriétaire sur un téléphone
          partagé (JON-19). */}
      <PurgeHorsLigne />
      <div className="mx-auto w-full max-w-sm">
        <header className="text-center">
          <Image
            src="/icons/icon.svg"
            alt=""
            width={64}
            height={64}
            priority
            className="mx-auto rounded-casa-lg shadow-casa-md"
          />
          <h1 className="mt-5 font-display text-[2rem] font-semibold leading-tight tracking-tight text-ink">
            Bienvenue à Casa&nbsp;Liva
          </h1>
          <p className="mt-2 text-[1.0625rem] leading-relaxed text-ink-2">
            Ici, on sait enfin qui fait quoi.
          </p>
        </header>

        <div className="mt-9">
          <LoginForm next={next} />
        </div>

        <p className="mt-8 text-center text-[0.8125rem] leading-relaxed text-ink-3">
          Pas de mot de passe à retenir. On t’envoie un lien, tu cliques, tu es
          chez toi.
        </p>
      </div>
    </main>
  );
}
