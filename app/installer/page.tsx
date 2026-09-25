import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InstallGuide } from "@/components/pwa/install-guide";

export const metadata: Metadata = {
  title: "Installer",
  description:
    "Poser Casa Liva sur l’écran d’accueil, en deux gestes — sur iPhone comme sur Android.",
};

/**
 * Le guide d'installation (§65, JON-18).
 *
 * **Publique, et c'est le point.** Elle ne lit aucune donnée, et son
 * usage réel est de se dire au téléphone : « va sur
 * casaliva.app/installer ». Exiger une session ici la rendrait
 * inutilisable au moment précis où elle sert — quelqu'un qui aide
 * quelqu'un d'autre, depuis un autre appareil.
 *
 * Elle vit hors du groupe `(app)` pour la même raison : ce layout lit
 * la maison en base et impose la barre de navigation, dont on n'a pas
 * besoin ici.
 */
export default function InstallerPage() {
  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto w-full max-w-2xl px-4 pt-6 safe-t">
        <Link
          href="/aujourdhui"
          className="tap -ml-2 inline-flex items-center gap-1.5 rounded-casa-sm px-2 text-[1rem] font-medium text-ink-2"
        >
          <ArrowLeft size={18} strokeWidth={2.2} aria-hidden="true" />
          Retour à l’agenda
        </Link>
      </div>
      <InstallGuide />
    </main>
  );
}
