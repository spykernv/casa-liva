"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { syncIfStale, syncNow } from "@/actions/calendar";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   Le rafraîchissement des agendas, depuis les vues d'agenda.

   Deux comportements dans un seul contrôle :

   — **automatique**, au montage, si la dernière lecture date d'un
     moment. C'est le cas courant : on écrit un rendez-vous dans
     Google, on bascule sur Casa Liva, il est là.
   — **manuel**, pour qui n'a pas envie d'attendre ou veut se
     rassurer. Un agenda partagé qui ne dit jamais s'il est à jour
     n'inspire pas confiance.

   La vue ne se rafraîchit **que si quelque chose a bougé** : un
   `router.refresh()` à chaque ouverture ferait clignoter l'écran pour
   rien.
   ═══════════════════════════════════════════════════════════════ */

type State = "idle" | "syncing" | "done" | "error";

export function SyncControl({ needsReauth }: { needsReauth: boolean }) {
  const [state, setState] = useState<State>("idle");
  const router = useRouter();

  /* Une seule tentative automatique par montage.

     React exécute les effets deux fois en développement, et une
     navigation entre « Aujourd'hui » et « Semaine » remonte le
     composant. Sans ce garde, chaque aller-retour déclencherait un
     appel — le seuil de fraîcheur côté serveur les rejetterait, mais
     autant ne pas les émettre. */
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current || needsReauth) return;
    attempted.current = true;

    let cancelled = false;

    (async () => {
      setState("syncing");
      const result = await syncIfStale();
      if (cancelled) return;

      if (result.status === "done" && result.changed) {
        setState("done");
        router.refresh();
        return;
      }
      setState(result.status === "error" || result.status === "reauth" ? "error" : "idle");
    })();

    return () => {
      cancelled = true;
    };
  }, [needsReauth, router]);

  /* Le jeton est mort : un bouton qui échouera à tous les coups serait
     une fausse promesse. On envoie là où le problème se répare. */
  if (needsReauth) {
    return (
      <Link
        href="/moi/agenda"
        className="tap flex items-center justify-center rounded-full text-warn"
        aria-label="Ton agenda Google demande une nouvelle autorisation"
        title="Ton agenda Google demande une nouvelle autorisation"
      >
        <TriangleAlert size={20} strokeWidth={2.2} aria-hidden="true" />
      </Link>
    );
  }

  const busy = state === "syncing";

  async function refreshNow() {
    setState("syncing");
    const result = await syncNow();
    setState(result.ok ? "done" : "error");
    if (result.ok) router.refresh();
  }

  return (
    <button
      type="button"
      onClick={refreshNow}
      disabled={busy}
      aria-label="Synchroniser mon agenda Google"
      aria-live="polite"
      title={
        state === "error"
          ? "La dernière synchronisation a échoué. Réessayer."
          : "Synchroniser mon agenda Google"
      }
      className={cn(
        "tap flex items-center justify-center rounded-full transition-colors",
        "disabled:opacity-100",
        state === "error" ? "text-danger" : "text-ink-3 hover:text-ink",
      )}
    >
      <RefreshCw
        size={20}
        strokeWidth={2.2}
        aria-hidden="true"
        className={busy ? "animate-spin" : undefined}
      />
    </button>
  );
}
