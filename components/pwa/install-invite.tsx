"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Download, Smartphone, X } from "lucide-react";
import {
  detecterPlateforme,
  estInstallee,
  installReportee,
  reporterInstallation,
  type Plateforme,
} from "@/lib/pwa";

/* ═══════════════════════════════════════════════════════════════
   L'invitation à poser Casa Liva sur l'écran d'accueil (§65, JON-18).

   Deux chemins qui n'ont rien à voir :

   - **Android / Chrome** déclenche `beforeinstallprompt`. On l'a
     capturé dans la coquille, on le garde, et un bouton à nous ouvre
     la vraie boîte de dialogue du navigateur ;
   - **iOS / Safari n'a aucune API.** Rien ne peut déclencher
     l'installation, donc on renvoie vers `/installer`, qui **montre**
     le geste.

   **Ce bandeau ne détaille rien.** Il propose, et c'est tout — la
   place d'un mode d'emploi n'est pas au-dessus de l'agenda qu'on
   venait consulter.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Combien d'ouvertures avant de proposer quoi que ce soit.
 *
 * **Passé de 2 à 1 le 26 août** (D57), quand la popup a été retirée. Le
 * raisonnement d'origine — « ne rien demander à quelqu'un qui n'a
 * encore rien vu » — tenait tant qu'une popup atteignait les gens dès
 * la première ouverture. Ce bandeau étant désormais la **seule**
 * surface d'invitation, garder l'attente reviendrait à retirer la
 * popup **et** sa portée, alors que le commanditaire n'a demandé que la
 * première. Le compteur reste, lui : il sert la ligne de `/moi`, et il
 * dira la vérité le jour où on voudra revenir en arrière.
 */
const OUVERTURES_AVANT_DE_PROPOSER = 1;

const CLE_OUVERTURES = "casa:ouvertures";

export type InstallInviteProps = {
  /**
   * `bandeau` — l'invitation qui va et vient en haut d'`/aujourd'hui`,
   * soumise au bon moment et reportable.
   * `reglage` — la ligne permanente de `/moi`. Sans elle, reporter une
   * fois reviendrait à cacher la fonctionnalité pendant deux semaines.
   */
  emplacement: "bandeau" | "reglage";
};

type Etat = { plateforme: Plateforme; autorise: boolean; reportee: boolean };

const RIEN: Etat = { plateforme: "autre", autorise: false, reportee: false };

export function InstallInvite({ emplacement }: InstallInviteProps) {
  /* Un seul état, et pas quatre. Ce composant lit un système
     extérieur — mode d'affichage, agent utilisateur, invitation de
     Chrome, stockage local — et tout s'y décide au même moment. */
  const [etat, setEtat] = useState<Etat>(RIEN);
  const { plateforme, autorise, reportee } = etat;

  useEffect(() => {
    /* Déjà installée : on ne propose plus JAMAIS. Reproposer une
       installation à quelqu'un qui l'a faite donne l'impression d'une
       app qui ne sait pas où elle en est. */
    if (estInstallee()) return;

    /* Le bon moment n'est pas la première seconde. Proposer un
       engagement à quelqu'un qui n'a encore rien vu, c'est demander
       avant d'avoir rendu service.

       Le comptage se fait **ici et une seule fois**, pas dans
       `mesurer` — qui est rappelé à chaque événement et gonflerait le
       compteur sans que personne n'ait rouvert quoi que ce soit. */
    let autorise = emplacement === "reglage";
    let reportee = false;

    if (emplacement === "bandeau") {
      try {
        // La même règle que la popup, et pas une seconde copie : voir
        // `installReportee` dans `lib/pwa.ts`.
        reportee = installReportee();

        const vues = Number(window.localStorage.getItem(CLE_OUVERTURES) ?? "0") + 1;
        window.localStorage.setItem(CLE_OUVERTURES, String(vues));
        autorise = vues >= OUVERTURES_AVANT_DE_PROPOSER;
      } catch {
        // Navigation privée, stockage refusé : on ne propose rien
        // plutôt que de proposer à chaque ouverture.
        autorise = false;
      }
    }

    /* L'abonnement au système extérieur : Chrome peut déclarer le site
       installable après le montage, et déclarer l'installation faite
       pendant qu'on regarde. */
    const mesurer = () => {
      const detectee = detecterPlateforme();
      const p: Plateforme = window.__casaInstall
        ? "android"
        : detectee === "ios"
          ? "ios"
          : "autre";
      setEtat({ plateforme: p, autorise, reportee });
    };

    mesurer();
    window.addEventListener("casa:installable", mesurer);

    const surInstallee = () => setEtat(RIEN);
    window.addEventListener("casa:installee", surInstallee);

    return () => {
      window.removeEventListener("casa:installable", mesurer);
      window.removeEventListener("casa:installee", surInstallee);
    };
  }, [emplacement]);

  const installer = useCallback(async () => {
    const invite = window.__casaInstall;
    if (!invite) return;
    await invite.prompt();
    /* On ne garde pas le résultat : accepté, `appinstalled` fera
       disparaître l'invitation ; refusé, Chrome interdit de rejouer la
       même invite, donc on la jette. Insister serait de toute façon la
       mauvaise réponse. */
    window.__casaInstall = null;
    setEtat(RIEN);
  }, []);

  const reporter = useCallback(() => {
    setEtat((e) => ({ ...e, reportee: true }));
    reporterInstallation();
  }, []);

  if (plateforme === "autre" || !autorise) return null;
  if (emplacement === "bandeau" && reportee) return null;

  if (emplacement === "reglage") {
    return plateforme === "android" ? (
      <button
        type="button"
        onClick={installer}
        className="flex min-h-16 w-full items-center gap-3 rounded-casa-md border border-line bg-surface px-4 py-3 text-left shadow-casa-sm hover:border-line-strong"
      >
        <Smartphone size={20} strokeWidth={2} aria-hidden="true" className="shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1">
          <span className="block text-[1rem] font-medium text-ink">
            Installer Casa&nbsp;Liva
          </span>
          <span className="block truncate text-[0.875rem] text-ink-2">
            Une icône sur ton écran d’accueil
          </span>
        </span>
        <ChevronRight size={20} strokeWidth={2.2} aria-hidden="true" className="shrink-0 text-ink-3" />
      </button>
    ) : (
      <Link
        href="/installer"
        className="flex min-h-16 w-full items-center gap-3 rounded-casa-md border border-line bg-surface px-4 py-3 shadow-casa-sm hover:border-line-strong"
      >
        <Smartphone size={20} strokeWidth={2} aria-hidden="true" className="shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1">
          <span className="block text-[1rem] font-medium text-ink">
            Installer Casa&nbsp;Liva
          </span>
          <span className="block truncate text-[0.875rem] text-ink-2">
            Deux gestes dans Safari, on te montre
          </span>
        </span>
        <ChevronRight size={20} strokeWidth={2.2} aria-hidden="true" className="shrink-0 text-ink-3" />
      </Link>
    );
  }

  return (
    <section className="mx-4 mt-4 rounded-casa-md border border-accent/30 bg-accent-soft p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-accent-ink"
        >
          <Download size={19} strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[1.0625rem] font-semibold leading-snug text-ink">
            Casa&nbsp;Liva sur ton écran d’accueil
          </p>
          <p className="pt-1 text-[1rem] leading-relaxed text-ink-2">
            Une icône, comme une vraie app — et elle s’ouvre même quand le
            réseau fait des siennes.
          </p>
        </div>
        {/* Reporter est une cible à part entière : ratée, elle installe
            une app qu'on ne voulait pas. */}
        <button
          type="button"
          onClick={reporter}
          aria-label="Plus tard"
          className="tap -m-2 shrink-0 rounded-casa-sm text-ink-3"
        >
          <X size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      {plateforme === "android" ? (
        <button
          type="button"
          onClick={installer}
          className="tap mt-3.5 inline-flex w-full items-center justify-center rounded-casa-sm bg-ink px-4 text-[1rem] font-semibold text-bg"
        >
          Installer
        </button>
      ) : (
        <Link
          href="/installer"
          className="tap mt-3.5 inline-flex w-full items-center justify-center rounded-casa-sm bg-ink px-4 text-[1rem] font-semibold text-bg"
        >
          Comment faire&nbsp;?
        </Link>
      )}
    </section>
  );
}
