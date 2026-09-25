import { NextResponse } from "next/server";

/**
 * Le service worker de Casa Liva (§65, JON-19).
 *
 * **Pourquoi une route et non un fichier dans `public/`.** Le
 * navigateur ne remplace un service worker que si ses **octets**
 * changent. Un fichier statique reste identique d'un déploiement à
 * l'autre : la détection de mise à jour ne se déclencherait jamais, et
 * c'est précisément le piège que ce ticket nomme — « un service worker
 * mal réglé fige les gens sur une ancienne version pendant des jours,
 * sans qu'ils comprennent pourquoi une correction n'arrive pas ».
 *
 * En injectant le SHA du déploiement, chaque mise en production produit
 * un fichier différent, donc un `updatefound`, donc la bannière.
 *
 * **Et `/sw.js` doit être joignable sans session.** Le matcher du proxy
 * exclut `_next/static`, `icons/` et le manifeste, mais **pas** les
 * `.js` de la racine : sans l'exclusion ajoutée avec ce commit, le
 * navigateur recevrait un `307` vers `/connexion` en guise de service
 * worker. C'est la panne du cron de la phase 4 et du désabonnement de
 * la phase 6, une troisième fois — le proxy répond **avant** le
 * handler, donc une route mal déclarée n'est pas « protégée », elle est
 * injoignable, et sans la moindre erreur visible.
 */

/** Le déploiement en cours. En local, une valeur stable suffit. */
const VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "dev";

/**
 * La coquille mise en cache à l'installation.
 *
 * **Aucune page d'agenda n'y figure, et c'est la règle centrale du
 * ticket** : « ne jamais mettre en cache les données de calendrier au
 * point de les montrer périmées sans le dire. Un agenda faux est pire
 * qu'un agenda absent — quelqu'un se déplacerait pour un événement
 * annulé. »
 */
const SHELL = ["/hors-ligne", "/icons/icon-192.png", "/icons/icon.svg"];

const SOURCE = `/* Casa Liva — service worker · version ${VERSION} */
const VERSION = ${JSON.stringify(VERSION)};
const SHELL_CACHE = "casa-coquille-" + VERSION;
const ASSET_CACHE = "casa-statique-" + VERSION;
const PAGE_CACHE = "casa-pages-" + VERSION;
const SHELL = ${JSON.stringify(SHELL)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)),
  );
  // Pas de skipWaiting() ici : on n'écrase JAMAIS l'onglet ouvert sans
  // le dire. Le remplacement part d'un geste humain, via le message
  // ci-dessous. Sans ça, une page ouverte changerait de version sous
  // les doigts, au milieu d'une saisie.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const noms = await caches.keys();
      await Promise.all(
        noms
          .filter((n) => n.startsWith("casa-") && !n.endsWith(VERSION))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/* Le seul geste qui remplace le worker en attente : un tap sur
   « Recharger » dans la banniere de mise a jour. */
self.addEventListener("message", (event) => {
  if (event.data === "casa:prendre-la-main") self.skipWaiting();
});

/* ── Les notifications (JON-47) ──────────────────────────────────
   Le texte affiche est ECRIT PAR LE SERVEUR et deja masque
   (lib/push/notify.ts, via visibleTitle). Le worker ne compose rien :
   il affiche ce qu'on lui donne. C'est la meme discipline que la voix,
   qui ne dit jamais un texte fourni par le client (D36). */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let charge;
  try {
    charge = event.data.json();
  } catch {
    return; // Une charge illisible ne produit rien plutot qu'une ligne vide.
  }
  if (!charge || !charge.titre) return;

  event.waitUntil(
    self.registration.showNotification(charge.titre, {
      body: charge.corps || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      lang: "fr",
      tag: charge.tag,
      data: { url: chemin(charge.url) },
    }),
  );
});

/**
 * Ne garde qu'un chemin de l'application.
 *
 * La charge est signee par notre cle VAPID, donc elle vient de nous —
 * mais une notification est le seul endroit ou un tap ouvre une URL
 * sans que personne ne l'ait tapee. On refuse donc tout ce qui n'est
 * pas un chemin interne : pas d'origine externe, et pas de "//" qui
 * ferait passer un domaine pour un chemin.
 */
function chemin(url) {
  if (typeof url !== "string") return "/aujourdhui";
  if (!url.startsWith("/") || url.startsWith("//")) return "/aujourdhui";
  return url;
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const cible = chemin(event.notification.data && event.notification.data.url);

  /* On reutilise l'onglet deja ouvert plutot que d'en empiler un
     nouveau a chaque notification. */
  event.waitUntil(
    (async () => {
      const fenetres = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const f of fenetres) {
        if (new URL(f.url).origin === self.location.origin) {
          await f.focus();
          if ("navigate" in f) await f.navigate(cible);
          return;
        }
      }

      await self.clients.openWindow(cible);
    })(),
  );
});

/**
 * Trois regimes, et aucun ne sert de donnee d'agenda perimee.
 *
 * 1. les fichiers de "/_next/static/" et "/icons/" portent une
 *    empreinte dans leur nom : ils sont immuables, donc cache d'abord ;
 * 2. une navigation part TOUJOURS au reseau d'abord. C'est ce qui fait
 *    qu'un deploiement est visible au chargement suivant, sans attendre
 *    quoi que ce soit. Hors ligne, on rend "/hors-ligne" — une page qui
 *    DIT qu'elle ne sait pas, plutot qu'un agenda qui ment ;
 * 3. tout le reste — API, Server Actions, Supabase — passe au reseau
 *    sans jamais etre mis en cache.
 */
self.addEventListener("fetch", (event) => {
  const requete = event.request;
  if (requete.method !== "GET") return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  const immuable =
    url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");

  /* Ranger dans un cache est une promesse qui doit etre DECLAREE au
     navigateur. Sans waitUntil, il a le droit d'arreter le worker des
     que la reponse est rendue : l'ecriture est alors abandonnee en
     silence, et le cache reste vide alors que tout semble marcher. Ca
     ne se verrait qu'une fois hors ligne, c'est-a-dire au pire moment. */
  const ranger = (nom, req, reponse) =>
    event.waitUntil(caches.open(nom).then((c) => c.put(req, reponse)));

  if (immuable) {
    event.respondWith(
      (async () => {
        const cachee = await caches.match(requete);
        if (cachee) return cachee;

        const reponse = await fetch(requete);
        if (reponse.ok) ranger(ASSET_CACHE, requete, reponse.clone());
        return reponse;
      })(),
    );
    return;
  }

  if (requete.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const reponse = await fetch(requete);

          /* Toute deconnexion — volontaire ou par expiration de session
             — atterrit sur /connexion. C'est donc LE point de purge :
             la derniere version connue de l'agenda est une donnee
             personnelle, et elle ne doit pas survivre a la sortie de
             son proprietaire sur un telephone partage.

             On regarde aussi reponse.url, parce qu'une redirection du
             proxy est suivie par fetch : la requete visait /semaine, la
             reponse vient de /connexion. */
          const arriveeSurConnexion =
            url.pathname === "/connexion" ||
            new URL(reponse.url || requete.url).pathname === "/connexion";

          if (arriveeSurConnexion) {
            await caches.delete(PAGE_CACHE);
            return reponse;
          }

          if (reponse.ok && !reponse.redirected) {
            ranger(PAGE_CACHE, requete, reponse.clone());
          }
          return reponse;
        } catch {
          /* Hors ligne. La derniere version connue de CETTE page, si on
             l'a — la banniere qu'elle porte dira de quand elle date.
             Sinon la page qui avoue ne pas savoir. Jamais un agenda
             presente comme s'il etait a jour. */
          const pages = await caches.open(PAGE_CACHE);
          const connue = await pages.match(requete, { ignoreSearch: false });
          if (connue) return connue;

          const coquille = await caches.open(SHELL_CACHE);
          const repli = await coquille.match("/hors-ligne");
          return (
            repli ||
            new Response("Hors ligne.", {
              status: 503,
              headers: { "content-type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
  }
});
`;

export async function GET() {
  return new NextResponse(SOURCE, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      /* Le worker lui-même ne se met jamais en cache : c'est lui qui
         porte la version, et un worker mis en cache une journée
         retarderait d'autant la détection d'une nouvelle version. */
      "cache-control": "no-cache, no-store, must-revalidate",
      "service-worker-allowed": "/",
    },
  });
}
