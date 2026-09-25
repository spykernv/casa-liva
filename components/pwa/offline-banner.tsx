"use client";

import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { formatTime, isSameCasaDay, formatDayLong } from "@/lib/date";

/**
 * Dit qu'on regarde une photo, et de quand elle date (JON-19).
 *
 * **C'est la moitié qui rend le cache acceptable.** Le service worker
 * garde la dernière version connue de chaque écran pour qu'un métro
 * sans réseau n'affiche pas le dinosaure du navigateur. Mais « un
 * agenda faux est pire qu'un agenda absent — quelqu'un se déplacerait
 * pour un événement annulé ». Servir la page d'hier **sans le dire**
 * serait donc pire que de ne rien servir du tout.
 *
 * D'où cette bannière : elle ne s'affiche que hors ligne, et elle porte
 * **l'heure du dernier chargement réussi**, pas l'heure actuelle.
 *
 * **Et l'horodatage vient du serveur, pas du navigateur.** `renduA` est
 * calculé au rendu de la page et voyage dans le HTML — donc dans la
 * copie que le worker a gardée. Une heure lue côté client au moment de
 * l'affichage dirait « maintenant », c'est-à-dire exactement le
 * mensonge que cette bannière existe pour empêcher.
 */
export function OfflineBanner({ renduA }: { renduA: number }) {
  /* L'état porte l'heure de la coupure en plus du fait d'être hors
     ligne. Lire l'horloge dans le corps du rendu est une impureté que
     le React Compiler refuse — c'est la raison d'être de `lib/clock.ts`
     côté serveur, et ici l'effet joue le même rôle. */
  const [coupure, setCoupure] = useState<number | null>(null);

  useEffect(() => {
    // Pas de lecture pendant le rendu : le serveur est toujours « en
    // ligne », et le HTML rendu ici doit valoir pour les deux états.
    const relire = () => setCoupure(navigator.onLine ? null : Date.now());
    relire();

    window.addEventListener("online", relire);
    window.addEventListener("offline", relire);
    return () => {
      window.removeEventListener("online", relire);
      window.removeEventListener("offline", relire);
    };
  }, []);

  if (coupure === null) return null;

  const memeJour = isSameCasaDay(renduA, coupure);
  const quand = memeJour
    ? `à ${formatTime(renduA)}`
    : `${formatDayLong(renduA).toLowerCase()} à ${formatTime(renduA)}`;

  return (
    <div
      role="status"
      className="mx-4 mt-4 flex items-start gap-2.5 rounded-casa-md border border-warn/30 bg-warn-soft px-4 py-3"
    >
      <CloudOff
        size={19}
        strokeWidth={2.2}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-ink-2"
      />
      {/* 16 px et non 15 : la convention d'étiquette du projet (« Ta
          couleur », « Mon agenda ») ne s'applique pas ici. Ce texte
          n'est pas décoratif — c'est l'avertissement qui empêche de
          prendre un agenda d'hier pour celui d'aujourd'hui, et il doit
          se lire. Mesuré à 15 px sur la Preview, corrigé. */}
      <p className="text-[1rem] leading-relaxed text-ink">
        Pas de réseau. Tu regardes l’agenda tel qu’il était{" "}
        <strong className="font-semibold">{quand}</strong> — il a pu changer
        depuis.
      </p>
    </div>
  );
}
