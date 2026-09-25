import type { MetadataRoute } from "next";

/**
 * Manifeste PWA (§65).
 *
 * L'objectif est modeste mais décisif pour l'adoption : que Casa Liva
 * ait une icône sur l'écran d'accueil, au même titre que WhatsApp.
 * Une app qu'il faut retrouver dans un navigateur n'est pas ouverte.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Casa Liva",
    short_name: "Casa Liva",
    description:
      "L’agenda de la maison. Qui fait quoi, quand on est libres, et ce qu’on organise ensemble.",
    lang: "fr",
    dir: "ltr",
    start_url: "/aujourdhui",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf7f1",
    theme_color: "#fbf7f1",
    categories: ["productivity", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Aujourd’hui", url: "/aujourdhui" },
      { name: "La semaine", url: "/semaine" },
    ],
  };
}
