import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = { title: "Hors ligne" };

/**
 * Ce que le service worker rend quand le réseau manque (JON-19).
 *
 * **Elle ne montre aucun agenda, et c'est le sujet.** Le ticket est
 * explicite : « un agenda faux est pire qu'un agenda absent — quelqu'un
 * se déplacerait pour un événement annulé ». Une page qui dit
 * franchement qu'elle ne sait pas vaut mieux qu'une grille d'hier
 * présentée comme celle d'aujourd'hui.
 *
 * Elle est mise en cache à l'installation du worker, donc disponible
 * même au tout premier passage sans réseau. Elle vit hors du groupe
 * `(app)` : ce layout lit la maison en base, ce qui est exactement ce
 * qu'on ne peut pas faire ici.
 *
 * Le ton reste celui du projet — on ne culpabilise pas quelqu'un qui
 * prend le métro.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <span
        aria-hidden="true"
        className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-ink-3 shadow-casa-sm"
      >
        <WifiOff size={30} strokeWidth={2.2} />
      </span>

      <h1 className="pt-5 font-display text-[1.5rem] font-semibold leading-tight text-ink">
        Pas de réseau
      </h1>

      <p className="pt-3 text-[1.0625rem] leading-relaxed text-ink-2">
        Casa Liva a besoin d’une connexion pour dire la vérité sur l’agenda.
        Plutôt que de te montrer une version d’hier, on préfère se taire.
      </p>

      <p className="pt-2 text-[0.9375rem] leading-relaxed text-ink-3">
        Ça revient tout seul dès que le signal revient.
      </p>

      {/* Un lien plutôt qu'un bouton avec `onClick` : cette page doit
          fonctionner sans une ligne de JavaScript, puisqu'elle sert
          précisément quand le reste n'a pas pu être chargé. */}
      <a
        href="/aujourdhui"
        className="tap mt-7 inline-flex items-center justify-center rounded-casa-md bg-ink px-6 text-[1.0625rem] font-semibold text-bg"
      >
        Réessayer
      </a>
    </main>
  );
}
