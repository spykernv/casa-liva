import { headers } from "next/headers";

/**
 * L'origine publique de l'application, pour construire les liens de
 * connexion et d'invitation.
 *
 * On lit d'abord les en-têtes de la requête en cours : c'est la seule
 * source qui donne la bonne URL sur une Preview Deployment, dont le
 * domaine change à chaque déploiement. On se rabat ensuite sur les
 * variables Vercel, puis sur la configuration locale.
 */
export async function appOrigin(): Promise<string> {
  const h = await headers();

  const forwardedHost = h.get("x-forwarded-host") ?? h.get("host");
  if (forwardedHost) {
    const proto =
      h.get("x-forwarded-proto") ??
      (forwardedHost.startsWith("localhost") ? "http" : "https");
    return `${proto}://${forwardedHost}`;
  }

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;

  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
