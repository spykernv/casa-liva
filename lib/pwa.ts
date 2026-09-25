/**
 * Ce que le navigateur sait dire de lui-même, côté PWA (JON-18).
 *
 * Vit ici et pas dans un composant parce que **trois endroits en ont
 * besoin** : le bandeau d'`/aujourd'hui`, la ligne de `/moi`, et la
 * page `/installer`. Trois copies de la même détection finiraient par
 * ne pas s'accorder — c'est la leçon de `weekAnchor` (JON-60) et de
 * `gridBounds` (JON-75), et elle vaut aussi pour du code de
 * navigateur.
 */

import { addDays } from "date-fns";

export type Plateforme = "ios" | "android" | "autre";

/**
 * Combien de jours de silence après un « plus tard ».
 *
 * **Pas un masquage définitif.** Un × se tape par réflexe, souvent sans
 * lire — et l'installation est justement ce qui rend les notifications
 * possibles sur iPhone (JON-47). Deux semaines laissent la paix sans
 * fermer la porte, et la ligne de `/moi` reste disponible entre-temps.
 */
export const JOURS_DE_SILENCE = 14;

const CLE_REPORT = "casa:install-reportee";

/**
 * A-t-on dit « plus tard » récemment&nbsp;?
 *
 * **Une seule fonction décide, pour les deux surfaces.** La popup et le
 * bandeau d'`/aujourd'hui` proposent la même chose : reporter l'une
 * doit taire l'autre, sinon fermer la popup ferait apparaître le
 * bandeau dans la seconde qui suit — et on aurait l'air de n'avoir pas
 * écouté. C'est la leçon de `weekAnchor` (JON-60) et de `gridBounds`
 * (JON-75) appliquée à un réglage de navigateur.
 */
export function installReportee(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const depuis = Number(window.localStorage.getItem(CLE_REPORT) ?? "0");
    if (!Number.isFinite(depuis) || depuis <= 0) return false;
    /* `addDays` et non `14 * 24 * 60 * 60 * 1000` : deux semaines
       d'horloge n'en font pas 336 quand un changement d'heure passe par
       là (D51). L'écart est d'une heure et sans conséquence ici — mais
       une exception tolérée devient la règle qu'on recopie ailleurs, et
       `verify:dates` la refuse. */
    return addDays(new Date(depuis), JOURS_DE_SILENCE).getTime() > Date.now();
  } catch {
    // Navigation privée, stockage refusé : on considère qu'on n'a rien
    // reporté, et l'appelant décidera s'il propose quand même.
    return false;
  }
}

/** Enregistre le « plus tard ». Sans stockage, ça revient plus tard — tant pis. */
export function reporterInstallation(): void {
  try {
    window.localStorage.setItem(CLE_REPORT, String(Date.now()));
  } catch {
    // Moins grave que de perdre le geste : ça se reproposera.
  }
}

/**
 * La plateforme, au mieux de ce que l'agent utilisateur veut bien dire.
 *
 * **`iPadOS 13+ se déclare « Macintosh ».** Sans le test des points de
 * contact, un iPad ne verrait jamais les instructions — et c'est une
 * tablette familiale, exactement le support visé.
 */
export function detecterPlateforme(): Plateforme {
  if (typeof navigator === "undefined") return "autre";

  const ua = navigator.userAgent || "";
  const estIOS =
    /iphone|ipod|ipad/i.test(ua) ||
    (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1);

  if (estIOS) return "ios";
  if (/android/i.test(ua)) return "android";
  return "autre";
}

/**
 * L'app tourne-t-elle déjà depuis l'écran d'accueil ?
 *
 * **Quatre tests, et aucun n'est superflu.** `standalone` est le cas
 * courant, mais une PWA peut être lancée en `fullscreen` ou en
 * `minimal-ui` selon le manifeste et le système : ne tester que le
 * premier ferait reproposer l'installation à quelqu'un qui l'a déjà
 * faite — et une app qui ne sait pas où elle en est perd la confiance
 * qu'elle vient de gagner. Le quatrième, `navigator.standalone`, est
 * hors spécification et propre à Safari iOS, qui est précisément la
 * plateforme où l'on ne peut rien deviner autrement.
 */
export function estInstallee(): boolean {
  if (typeof window === "undefined") return false;

  const media = window.matchMedia?.bind(window);
  const parLAffichage =
    Boolean(media) &&
    (media("(display-mode: standalone)").matches ||
      media("(display-mode: fullscreen)").matches ||
      media("(display-mode: minimal-ui)").matches);

  const parSafari =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return parLAffichage || parSafari;
}
