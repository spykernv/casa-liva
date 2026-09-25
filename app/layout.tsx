import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/**
 * Attrape `beforeinstallprompt` avant que React ne monte (JON-18).
 *
 * **Chrome ne le déclenche qu'une fois.** Il arrive dès que le
 * navigateur juge le site installable — souvent avant l'hydratation.
 * Un écouteur posé dans un `useEffect` peut donc arriver après
 * l'événement, et le bouton « Installer » ne s'afficherait jamais :
 * pas d'erreur, pas de trace, juste une fonctionnalité absente sur
 * certains chargements et présente sur d'autres. Exactement le profil
 * de défaut le plus coûteux de ce projet.
 *
 * On le range donc sur `window` depuis un script `beforeInteractive`,
 * et le composant vient le chercher — qu'il soit arrivé avant ou après.
 * `preventDefault()` empêche la bannière native de Chrome : on veut
 * choisir le moment, et le moment n'est pas la première seconde.
 */
const CAPTURE_INSTALL = `
window.__casaInstall = null;
window.addEventListener("beforeinstallprompt", function (e) {
  e.preventDefault();
  window.__casaInstall = e;
  window.dispatchEvent(new Event("casa:installable"));
});
window.addEventListener("appinstalled", function () {
  window.__casaInstall = null;
  window.dispatchEvent(new Event("casa:installee"));
});
`;

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Casa Liva",
    template: "%s · Casa Liva",
  },
  description:
    "L’agenda de la maison. Qui fait quoi, quand on est libres, et ce qu’on organise ensemble.",
  applicationName: "Casa Liva",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Casa Liva",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7f1" },
    { media: "(prefers-color-scheme: dark)", color: "#15120f" },
  ],
  width: "device-width",
  initialScale: 1,
  // Pas de maximumScale : le zoom reste disponible (accessibilité §48).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${jakarta.variable} ${fraunces.variable}`}>
      <body className="min-h-dvh bg-bg text-ink antialiased">
        <Script id="casa-capture-install" strategy="beforeInteractive">
          {CAPTURE_INSTALL}
        </Script>
        {children}
      </body>
    </html>
  );
}
