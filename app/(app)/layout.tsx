import { redirect } from "next/navigation";
import { connection } from "next/server";
import { BottomNav } from "@/components/shell/bottom-nav";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { ServiceWorker } from "@/components/pwa/service-worker";
import { getCasaContext } from "@/lib/data/casa";
import { nowMs } from "@/lib/clock";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Le proxy garantit déjà qu'on est connecté. Ce qu'il ne sait pas
  // dire, c'est si la personne appartient à une maison : sans ça,
  // l'agenda n'a rien à afficher et l'onboarding prend le relais.
  const context = await getCasaContext();
  if (!context) redirect("/bienvenue");

  /* L'heure de ce rendu voyage dans le HTML, donc dans la copie que le
     service worker garde. C'est elle que la bannière hors-ligne
     affiche — pas l'heure du navigateur, qui dirait « maintenant » et
     présenterait l'agenda d'hier comme celui d'aujourd'hui (JON-19).
     `connection()` pour la même raison qu'ailleurs : sans elle, Next
     figerait cette valeur au moment du build. */
  await connection();
  const renduA = nowMs();

  return (
    <div className="min-h-dvh md:pl-56">
      {/* La réserve en bas doit tenir compte de la barre gestuelle iOS,
          sinon le dernier événement de la journée passe dessous. */}
      <main className="mx-auto w-full max-w-3xl pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-8">
        <OfflineBanner renduA={renduA} />
        {children}
      </main>
      <BottomNav />
      <ServiceWorker />
    </div>
  );
}
