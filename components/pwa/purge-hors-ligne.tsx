"use client";

import { useEffect } from "react";

/**
 * Efface la copie hors-ligne de l'agenda dès qu'on atterrit sur l'écran
 * de connexion (JON-19).
 *
 * **Ce composant existe parce que le service worker ne suffit pas, et
 * le test l'a montré.** Le worker purge bien son cache de pages quand
 * il voit une **navigation** vers `/connexion` — c'est ce qui arrive
 * quand une session expire et que le proxy redirige. Mais
 * `signOut` est une **Server Action** : la redirection est jouée par le
 * routeur de Next, côté client, sous forme d'une requête RSC. Le worker
 * ne voit jamais passer de navigation, et ne purge rien.
 *
 * Mesuré sur la Preview avant correction : après une vraie
 * déconnexion, `casa-pages-*` contenait toujours `/aujourdhui` et
 * `/moi` — l'agenda de quelqu'un qui venait de partir, resté sur
 * l'appareil. Sur un téléphone partagé, c'est exactement ce qu'on ne
 * veut pas.
 *
 * Les deux chemins sont donc gardés, et ce n'est pas de la redondance :
 * ils couvrent deux mécanismes différents. Le worker attrape
 * l'expiration de session, ce composant attrape la déconnexion
 * volontaire.
 *
 * On ne touche ni à la coquille ni aux fichiers statiques : ils ne
 * contiennent rien de personnel, et les jeter ferait repayer le
 * téléchargement à la prochaine connexion.
 */
export function PurgeHorsLigne() {
  useEffect(() => {
    if (!("caches" in window)) return;

    caches
      .keys()
      .then((noms) =>
        Promise.all(
          noms.filter((n) => n.startsWith("casa-pages-")).map((n) => caches.delete(n)),
        ),
      )
      .catch((error) => {
        // Sans importance pour la personne devant l'écran : elle est en
        // train de se connecter. Mais on le dit, parce qu'un cache qui
        // ne se vide pas est un défaut de confidentialité silencieux.
        console.error("[casa-pwa] purge du cache hors-ligne échouée", error);
      });
  }, []);

  return null;
}
