import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Remplace `middleware.ts`, renommé `proxy.ts` en Next.js 16.
 * Le runtime est Node.js et n'est pas configurable ici : exporter
 * `runtime` dans ce fichier lève une erreur.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Sans `matcher`, le proxy s'exécuterait sur chaque fichier statique,
  // chaque image et chaque icône — pour rien, et au prix d'un appel
  // réseau vers Supabase à chaque fois.
  matcher: [
    /* `sw.js` est exclu ici, et il fallait y penser. Le proxy répond
       **avant** le handler : sans cette exclusion, le navigateur qui
       demande le service worker recevrait un `307` vers `/connexion`
       en guise de JavaScript, et l'enregistrement échouerait sans la
       moindre erreur lisible. C'est la panne du cron de la phase 4 et
       du désabonnement de la phase 6, une troisième fois — une route
       mal déclarée n'est pas « protégée », elle est injoignable
       (JON-19).

       **Et les vidéos, une quatrième fois (JON-18).** Les films
       d'installation de `public/videos/` prenaient un `307` vers
       `/connexion` : le navigateur recevait une page HTML en guise de
       MP4 et rendait `DEMUXER_ERROR_COULD_NOT_OPEN`. Le piège était
       pire qu'ailleurs, parce que `.jpg` est exclu et pas `.mp4` :
       l'affiche s'affichait, la vidéo jamais — et le guide se
       contentait de masquer le lecteur, comme il le fait pour un
       fichier absent. Autrement dit **rien n'aurait signalé** que les
       films tournés ne s'ouvraient pas. Trouvé en déposant un vrai
       fichier au lieu de faire confiance au cas « absent ». */
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm|mov)$).*)",
  ],
};
