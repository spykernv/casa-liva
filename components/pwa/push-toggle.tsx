"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { BellRing, ChevronRight, Smartphone } from "lucide-react";
import { removeSubscription, saveSubscription, setPushPreference } from "@/actions/push";
import { detecterPlateforme, estInstallee } from "@/lib/pwa";

/* ═══════════════════════════════════════════════════════════════
   Activer les notifications sur cet appareil (§66 bis, JON-47).

   ── Trois pièges du ticket, et ils commandent tout cet écran ──

   1. **iOS ne notifie que les PWA installées.** Pas « moins bien » :
      pas du tout. Proposer le bouton dans un onglet Safari mènerait à
      un refus incompréhensible — on renvoie donc vers `/installer`,
      qui est la vraie première étape.
   2. **Un refus ne se redemande pas.** Sur iOS il faut désinstaller la
      PWA pour revenir en arrière. La demande ne part donc JAMAIS toute
      seule : elle part d'un tap, sur un écran qu'on est allé chercher,
      et après une phrase qui dit ce qu'on y gagne.
   3. **Le réglage et l'abonnement sont deux choses.** Couper le
      réglage garde l'appareil connu et se rallume d'un tap ; se
      désabonner rend la permission au système. On propose donc le
      premier, jamais le second.
   ═══════════════════════════════════════════════════════════════ */

type Etat =
  | { quoi: "chargement" }
  /** Ni Safari-hors-PWA, ni navigateur sans push : rien à proposer. */
  | { quoi: "impossible" }
  /** iOS dans un onglet : il faut installer d'abord. */
  | { quoi: "installer-dabord" }
  | { quoi: "refusee" }
  | { quoi: "a-activer" }
  | { quoi: "active"; endpoint: string };

/**
 * La clé publique VAPID, décodée pour `pushManager.subscribe`.
 *
 * Le type de retour est `ArrayBuffer` et non `Uint8Array` : depuis
 * TypeScript 5.7, `Uint8Array` est générique sur son tampon et peut
 * donc porter un `SharedArrayBuffer`, que l'API refuse. Rendre le
 * tampon lui-même évite un transtypage qui masquerait le jour où cette
 * distinction compterait vraiment.
 */
function cleApplication(base64: string): ArrayBuffer {
  const rembourrage = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalise = (base64 + rembourrage).replace(/-/g, "+").replace(/_/g, "/");
  const brut = window.atob(normalise);
  const octets = new Uint8Array(brut.length);
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets.buffer;
}

/** Les deux clés d'un abonnement, en base64url — ce que le serveur range. */
function clesDe(abonnement: PushSubscription): { p256dh: string; auth: string } | null {
  const p256dh = abonnement.getKey("p256dh");
  const auth = abonnement.getKey("auth");
  if (!p256dh || !auth) return null;

  const encode = (buffer: ArrayBuffer) =>
    window
      .btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  return { p256dh: encode(p256dh), auth: encode(auth) };
}

export function PushToggle({ initial }: { initial: boolean }) {
  const [etat, setEtat] = useState<Etat>({ quoi: "chargement" });
  const [voulu, setVoulu] = useState(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const mesurer = async () => {
      const supporte =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

      if (!supporte) {
        // Safari iOS hors PWA n'expose même pas `PushManager` : c'est
        // ce cas-là qu'on veut distinguer d'un navigateur incapable.
        setEtat(
          detecterPlateforme() === "ios" && !estInstallee()
            ? { quoi: "installer-dabord" }
            : { quoi: "impossible" },
        );
        return;
      }

      if (detecterPlateforme() === "ios" && !estInstallee()) {
        setEtat({ quoi: "installer-dabord" });
        return;
      }

      if (Notification.permission === "denied") {
        setEtat({ quoi: "refusee" });
        return;
      }

      const registration = await navigator.serviceWorker.getRegistration();
      const abonnement = await registration?.pushManager.getSubscription();
      setEtat(
        abonnement ? { quoi: "active", endpoint: abonnement.endpoint } : { quoi: "a-activer" },
      );
    };

    void mesurer();
  }, []);

  const activer = useCallback(() => {
    setErreur(null);

    startTransition(async () => {
      try {
        /* La permission se demande ICI, sur un tap. Jamais au
           chargement : un refus est définitif sur iOS. */
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setEtat(permission === "denied" ? { quoi: "refusee" } : { quoi: "a-activer" });
          return;
        }

        const registration = await navigator.serviceWorker.ready;
        const cle = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!cle) {
          setErreur("Les notifications ne sont pas configurées côté serveur.");
          return;
        }

        const abonnement = await registration.pushManager.subscribe({
          // Obligatoire, et de toute façon la seule valeur acceptée par
          // les navigateurs : on ne pousse jamais en silence.
          userVisibleOnly: true,
          applicationServerKey: cleApplication(cle),
        });

        const cles = clesDe(abonnement);
        if (!cles) {
          setErreur("Cet appareil n’a pas fourni de clés utilisables.");
          return;
        }

        const resultat = await saveSubscription(
          { endpoint: abonnement.endpoint, ...cles },
          detecterPlateforme() === "ios" ? "iPhone" : "Android",
        );

        if (!resultat.ok) {
          setErreur(resultat.error);
          return;
        }

        setVoulu(true);
        await setPushPreference(true);
        setEtat({ quoi: "active", endpoint: abonnement.endpoint });
      } catch (error) {
        console.error("[casa-push] abonnement impossible", error);
        setErreur("Ton téléphone a refusé l’abonnement.");
      }
    });
  }, []);

  const basculer = useCallback(() => {
    const suivant = !voulu;
    setErreur(null);
    // Optimiste : un interrupteur qui hésite donne l'impression de ne
    // pas avoir été entendu, et on rappuie (§70).
    setVoulu(suivant);

    startTransition(async () => {
      const resultat = await setPushPreference(suivant);
      if (!resultat.ok) {
        setVoulu(!suivant);
        setErreur(resultat.error);
      }
    });
  }, [voulu]);

  const oublier = useCallback(() => {
    if (etat.quoi !== "active") return;
    const endpoint = etat.endpoint;

    startTransition(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const abonnement = await registration?.pushManager.getSubscription();
      await abonnement?.unsubscribe();
      await removeSubscription(endpoint);
      setEtat({ quoi: "a-activer" });
    });
  }, [etat]);

  if (etat.quoi === "chargement" || etat.quoi === "impossible") return null;

  if (etat.quoi === "installer-dabord") {
    return (
      <Link
        href="/installer"
        className="flex min-h-16 w-full items-center gap-3 rounded-casa-md border border-line bg-surface px-4 py-3 shadow-casa-sm hover:border-line-strong"
      >
        <Smartphone size={20} strokeWidth={2} aria-hidden="true" className="shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1">
          <span className="block text-[1rem] font-medium text-ink">
            Notifications sur le téléphone
          </span>
          <span className="block text-[0.875rem] leading-snug text-ink-2">
            Sur iPhone, il faut d’abord poser Casa&nbsp;Liva sur l’écran d’accueil.
          </span>
        </span>
        <ChevronRight size={20} strokeWidth={2.2} aria-hidden="true" className="shrink-0 text-ink-3" />
      </Link>
    );
  }

  if (etat.quoi === "refusee") {
    return (
      <div className="rounded-casa-md border border-line bg-surface px-4 py-3.5 shadow-casa-sm">
        <p className="text-[1rem] font-medium text-ink">Notifications refusées</p>
        <p className="pt-1 text-[0.9375rem] leading-relaxed text-ink-2">
          Ton téléphone a dit non, et Casa&nbsp;Liva ne peut pas redemander. Ça se
          rouvre dans les réglages du téléphone, à la ligne Casa&nbsp;Liva.
        </p>
      </div>
    );
  }

  if (etat.quoi === "a-activer") {
    return (
      <div className="rounded-casa-md border border-line bg-surface px-4 py-3.5 shadow-casa-sm">
        <p className="text-[1rem] font-medium text-ink">
          Notifications sur le téléphone
        </p>
        <p className="pt-1 text-[0.9375rem] leading-relaxed text-ink-2">
          Une invitation qui arrive, une réponse à ce que tu as proposé — sur
          l’écran, tout de suite, sans ouvrir ta boîte mail.
        </p>
        <button
          type="button"
          onClick={activer}
          disabled={pending}
          className="tap mt-3 inline-flex w-full items-center justify-center gap-2 rounded-casa-sm bg-ink px-4 text-[1rem] font-semibold text-bg disabled:opacity-60"
        >
          <BellRing size={18} strokeWidth={2.3} aria-hidden="true" />
          {pending ? "Un instant…" : "Activer sur cet appareil"}
        </button>
        {erreur && (
          <p role="alert" className="pt-2 text-[0.9375rem] leading-relaxed text-danger">
            {erreur}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-casa-md border border-line bg-surface shadow-casa-sm">
      <button
        type="button"
        role="switch"
        aria-checked={voulu}
        onClick={basculer}
        disabled={pending}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"
      >
        <BellRing
          size={20}
          strokeWidth={2}
          aria-hidden="true"
          className={voulu ? "shrink-0 text-accent" : "shrink-0 text-ink-3"}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[1rem] font-medium text-ink">
            Notifications sur le téléphone
          </span>
          <span className="block text-[0.875rem] leading-snug text-ink-2">
            {voulu
              ? "Actives sur cet appareil. Les emails prennent le relais si le téléphone ne répond pas."
              : "Coupées. Tu recevras les invitations par email."}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={
            voulu
              ? "h-6 w-10 shrink-0 rounded-full bg-accent p-0.5"
              : "h-6 w-10 shrink-0 rounded-full bg-line-strong p-0.5"
          }
        >
          <span
            className={
              voulu
                ? "block h-5 w-5 translate-x-4 rounded-full bg-bg transition-transform"
                : "block h-5 w-5 rounded-full bg-bg transition-transform"
            }
          />
        </span>
      </button>

      <div className="border-t border-line px-4 py-2.5">
        <button
          type="button"
          onClick={oublier}
          disabled={pending}
          className="tap -mx-2 text-[0.875rem] font-medium text-ink-3"
        >
          Oublier cet appareil
        </button>
      </div>

      {erreur && (
        <p role="alert" className="px-4 pb-3 text-[0.9375rem] leading-relaxed text-danger">
          {erreur}
        </p>
      )}
    </div>
  );
}
