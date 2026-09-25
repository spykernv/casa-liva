import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

/**
 * Chemins accessibles sans être connecté.
 *
 * `/api/cron` en fait partie : Vercel Cron appelle en machine, sans
 * cookie de session. Sans cette entrée, le proxy renvoyait un 307 vers
 * `/connexion` et le Route Handler ne s'exécutait **jamais** — donc ni
 * son contrôle de `CRON_SECRET`, ni la synchronisation. Une panne
 * parfaitement silencieuse : le cron « réussissait » du point de vue
 * de Vercel, et l'agenda se serait vidé par le fond au bout d'un an.
 *
 * Ces routes ne sont pas ouvertes pour autant : elles s'authentifient
 * elles-mêmes par un secret partagé, ce qui est la bonne frontière
 * pour un appel sans humain derrière.
 */
const PUBLIC_PREFIXES = [
  "/connexion",
  "/auth",
  "/invitation",
  "/api/cron",
  /* `/rsvp` et `/desabonnement` arrivent depuis un email, sur le
     téléphone de quelqu'un qui n'est peut-être connecté nulle part.
     Exiger la session ici reviendrait à supprimer la fonctionnalité :
     personne ne se connecte pour dire « je viens ».

     Ces deux routes portent leur propre autorisation — un jeton
     secret, valable pour une seule personne et une seule action. */
  "/rsvp",
  "/desabonnement",
  /* Et sa route jumelle sous `/api`, sans quoi le bouton « Se
     désabonner » de Gmail — qui appelle en `POST`, sans cookie —
     tombait sur un 307 vers `/connexion`. Il échouait donc en silence,
     et la personne se rabattait sur « signaler comme indésirable » :
     précisément ce que ce chemin existe pour éviter.

     Le piège, et il est facile à rater : un chemin sous `/api`
     ne bénéficie **pas** du préfixe de sa page. `/desabonnement` ne
     couvre pas `/api/desabonnement`. Toute nouvelle route publique
     doit être ajoutée ici sous ses deux formes. */
  "/api/desabonnement",
  /* La page que le service worker rend quand le réseau manque. Il la
     met en cache **à son installation**, ce qui arrive souvent alors
     que personne n'est encore connecté — sur l'écran de connexion, par
     exemple. Sans elle ici, le worker mettrait en cache une redirection
     vers `/connexion` et l'afficherait dans le métro à la place de la
     page qui explique. Elle ne lit aucune donnée : du texte et un lien
     (JON-19). */
  "/hors-ligne",
  /* Le guide d'installation. Publique parce que son usage réel est de
     se dire au téléphone — « va sur casaliva.app/installer » — à
     quelqu'un qui n'y arrive pas, et souvent depuis un autre appareil.
     Exiger la session la rendrait inutile au moment précis où elle
     sert. Elle ne lit aucune donnée (JON-18). */
  "/installer",
];

/**
 * Rafraîchit la session à chaque requête et redirige les visiteurs
 * anonymes vers la page de connexion.
 *
 * Ce proxy est un **filet de sécurité**, pas la frontière
 * d'autorisation : les Server Actions sont traitées comme des POST sur
 * la route où elles sont utilisées, donc un `matcher` mal réglé ou un
 * simple déplacement de fichier supprimerait silencieusement la
 * couverture. Chaque action et chaque route vérifie donc à nouveau
 * l'identité de son côté.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Ne rien intercaler entre la création du client et `getClaims()` :
  // c'est le chemin qui rafraîchit le jeton, et le décaler provoque
  // des déconnexions aléatoires très difficiles à diagnostiquer.
  // `getClaims()` vérifie la signature du JWT ; `getSession()` se
  // contenterait de lire les cookies, qui sont falsifiables.
  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims);

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!isAuthenticated && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    // On mémorise où la personne voulait aller : après connexion, on
    // l'y renvoie plutôt que de la lâcher sur l'accueil.
    if (pathname !== "/") url.searchParams.set("suite", pathname);
    return NextResponse.redirect(url);
  }

  // Renvoyer CET objet réponse, tel quel : en construire un autre sans
  // recopier les cookies désynchronise navigateur et serveur, et
  // termine la session prématurément.
  return response;
}
