"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Enregistre le service worker, et **invite explicitement à recharger**
 * quand une nouvelle version est prête (JON-19).
 *
 * **C'est le vrai piège du ticket, et il se joue ici.** Un service
 * worker qui appelle `skipWaiting()` à l'installation remplace la page
 * ouverte sous les doigts — au milieu d'une saisie, au pire moment.
 * Un service worker qui ne le fait jamais fige les gens sur une
 * ancienne version pendant des jours, sans qu'ils comprennent pourquoi
 * une correction n'arrive pas.
 *
 * La sortie est un **geste humain** : le worker attend, on le dit, et
 * c'est un tap qui donne la main au nouveau. Même forme que l'aperçu de
 * Casa AI (D41) — le système prépare, la personne valide.
 *
 * Le rechargement passe par `controllerchange` et non par un
 * `location.reload()` immédiat : recharger avant que le nouveau worker
 * ait pris la main rendrait exactement la même version, et le bouton
 * aurait l'air cassé.
 */
export function ServiceWorker() {
  const [enAttente, setEnAttente] = useState<ServiceWorker | null>(null);
  const [rechargement, setRechargement] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    /* Pas d'enregistrement en développement : le worker mettrait en
       cache des fichiers que le rechargement à chaud remplace à chaque
       frappe, et on passerait la journée à se demander pourquoi une
       modification ne s'affiche pas. */
    if (process.env.NODE_ENV === "development") return;

    let annule = false;

    const surNouveau = (registration: ServiceWorkerRegistration) => {
      const nouveau = registration.installing ?? registration.waiting;
      if (!nouveau) return;

      const regarder = () => {
        // `controller` absent = tout premier chargement : le worker
        // n'écrase personne, il n'y a rien à proposer.
        if (nouveau.state === "installed" && navigator.serviceWorker.controller) {
          if (!annule) setEnAttente(nouveau);
        }
      };

      regarder();
      nouveau.addEventListener("statechange", regarder);
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (annule) return;
        if (registration.waiting && navigator.serviceWorker.controller) {
          setEnAttente(registration.waiting);
        }
        registration.addEventListener("updatefound", () => surNouveau(registration));
      })
      .catch((error) => {
        // On ne casse rien : sans worker, l'app fonctionne, elle est
        // seulement moins bonne hors ligne.
        console.error("[casa-pwa] service worker refusé", error);
      });

    const surBascule = () => {
      if (annule) return;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", surBascule);

    return () => {
      annule = true;
      navigator.serviceWorker.removeEventListener("controllerchange", surBascule);
    };
  }, []);

  if (!enAttente) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-4 flex items-center gap-3 rounded-casa-md border border-magic/35 bg-surface p-3 shadow-casa-md md:bottom-4 md:ml-60"
    >
      <span className="min-w-0 flex-1 text-[1rem] leading-snug text-ink">
        Une nouvelle version de Casa&nbsp;Liva est prête.
      </span>
      <button
        type="button"
        disabled={rechargement}
        onClick={() => {
          setRechargement(true);
          enAttente.postMessage("casa:prendre-la-main");
        }}
        className="tap inline-flex shrink-0 items-center gap-1.5 rounded-casa-sm bg-ink px-3.5 text-[1rem] font-semibold text-bg disabled:opacity-60"
      >
        <RefreshCw
          size={16}
          strokeWidth={2.4}
          aria-hidden="true"
          className={rechargement ? "animate-spin" : undefined}
        />
        {rechargement ? "Un instant" : "Recharger"}
      </button>
    </div>
  );
}
