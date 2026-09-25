import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { MemberColor } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { getCasaContext, getUserId } from "@/lib/data/casa";
import { Onboarding } from "./onboarding";

export const metadata: Metadata = { title: "Bienvenue" };

export default async function WelcomePage() {
  const userId = await getUserId();
  if (!userId) redirect("/connexion");

  // Déjà dans une maison : l'onboarding n'a plus rien à raconter.
  const context = await getCasaContext();
  if (context) redirect("/aujourdhui");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("users")
    .select("first_name, color")
    .eq("id", userId)
    .maybeSingle();

  return (
    <main className="casa-glow min-h-dvh">
      <Onboarding
        initialName={profile?.first_name ?? ""}
        initialColor={(profile?.color as MemberColor) ?? "blue"}
      />
    </main>
  );
}
