/**
 * Génère les icônes PNG de Casa Liva à partir du dessin vectoriel.
 *
 * À relancer uniquement si la marque change — les PNG produits sont
 * versionnés, l'app n'a pas besoin de ce script pour se construire.
 *
 *   node scripts/generate-icons.mjs
 *
 * `sharp` arrive avec Next.js (optimisation d'images). Si un jour il
 * disparaît de l'arbre de dépendances : `npm i -D sharp`.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
await mkdir(OUT, { recursive: true });

/**
 * Le dessin est décrit dans un carré 512. `scale` le réduit autour du
 * centre pour dégager la zone de sécurité des icônes « maskable »,
 * qu'Android recadre en cercle.
 */
const house = (scale) => {
  const t = (1 - scale) * 256;
  return `<g transform="translate(${t} ${t}) scale(${scale})">
    <g fill="#fffaf4">
      <path d="M256 112 L438 264 a18 18 0 0 1 -12 32 L86 296 a18 18 0 0 1 -12 -32 Z"/>
      <rect x="130" y="272" width="252" height="140" rx="24"/>
    </g>
    <rect x="226" y="330" width="60" height="82" rx="30" fill="#e2653c"/>
  </g>`;
};

const svg = ({ radius, scale }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" rx="${radius}" fill="#e2653c"/>
    ${house(scale)}
  </svg>`;

const standard = Buffer.from(svg({ radius: 116, scale: 1 }));

const jobs = [
  ["icon-192.png", standard, 192],
  ["icon-512.png", standard, 512],
  ["maskable-512.png", Buffer.from(svg({ radius: 0, scale: 0.72 })), 512],
  ["apple-touch-icon.png", Buffer.from(svg({ radius: 0, scale: 0.86 })), 180],
  ["favicon-32.png", standard, 32],
];

for (const [name, source, size] of jobs) {
  const buf = await sharp(source, { density: 384 }).resize(size, size).png().toBuffer();
  await writeFile(join(OUT, name), buf);
  console.log(`${name} — ${buf.length} octets`);
}
