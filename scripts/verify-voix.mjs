/**
 * Dit en une commande si la voix de Casa Liva peut parler et entendre.
 *
 *   npm run verify:voix
 *
 * **Pourquoi ce script existe.** Le 5 août 2026, `ELEVENLABS_API_KEY`
 * a reçu l'*identifiant* d'une clé au lieu de la clé. La voix est
 * restée morte — dictée **et** synthèse, puisque D39 leur a donné la
 * même clé — jusqu'au 26 août. Vingt et un jours, sans qu'aucun
 * contrôle du dépôt ne bronche : `verify:ai` tourne exprès **sans
 * secret** pour pouvoir vivre en CI, et ne peut donc rien dire d'une
 * clé. Le seul endroit qui savait était la réponse d'ElevenLabs,
 * recopiée dans les journaux Vercel.
 *
 * Ce script comble ce trou-là, et lui seul : il **exige** `.env.local`
 * et sort du périmètre de la CI, exactement comme `verify:rls`.
 *
 * **Ce qu'il prouve, et ce qu'il ne prouve pas.** Il prouve que la clé
 * de *cette machine* est acceptée par ElevenLabs. Il ne dit rien de
 * celle de Vercel — ce sont deux valeurs différentes, et c'est la
 * seconde qui sert la production. Après une rotation, il faut poser la
 * clé aux deux endroits ; ce script vérifie le premier, et les
 * journaux Vercel le second.
 *
 * **Il charge le vrai module** (`lib/voice/elevenlabs.ts`) plutôt que
 * de recopier la règle de forme : une copie finirait par diverger de
 * ce que le serveur applique vraiment, et c'est précisément le genre
 * d'écart qu'un contrôle est censé attraper, pas produire.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { refusDeForme } from "@/lib/voice/elevenlabs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^"|"$/g, "")]),
);

/* La valeur ne s'affiche jamais, pas même tronquée : un journal de
   terminal se recopie dans un ticket sans y penser. */
const CLE = env.ELEVENLABS_API_KEY;

const ROTATION = `
  Comment la remplacer :

    1. https://elevenlabs.io/app/settings/api-keys
    2. « Create API key » (ou « Rotate » sur celle qui existe).
       La clé ne s'affiche QU'À CE MOMENT — la recopier tout de suite.
       Ce que le tableau de bord montre en permanence est l'IDENTIFIANT,
       et c'est exactement la confusion qui a coûté trois semaines.
    3. La poser AUX DEUX endroits :
         · .env.local           → ELEVENLABS_API_KEY=sk_…
         · Vercel → Settings → Environment Variables
           (Production ET Preview — c'est la production qui sert la famille)
    4. Relancer : npm run verify:voix
    5. Redéployer Vercel : une variable d'environnement ne prend effet
       qu'au déploiement suivant.
`;

function echec(message, avecProcedure = true) {
  console.error(`\n  ✗ ${message}`);
  if (avecProcedure) console.error(ROTATION);
  process.exit(1);
}

console.log("\n  La voix de Casa Liva — trois contrôles\n");

/* ── 1. Présence ──────────────────────────────────────────────── */

if (!CLE) echec("ELEVENLABS_API_KEY est absente de .env.local");
console.log("  ✓ 1/3  la clé est présente dans .env.local");

/* ── 2. Forme, sans toucher au réseau ─────────────────────────────
   C'est l'étape que la panne du 5 août réclamait : un identifiant se
   reconnaît hors ligne, et ne mérite pas qu'on dérange ElevenLabs. */

const forme = refusDeForme(CLE);
if (forme) echec(forme);
console.log("  ✓ 2/3  sa forme est celle d'une clé (« sk_… »)");

/* ── 3. Le vrai chemin ────────────────────────────────────────────
   Une forme plausible n'est pas une clé valide : révoquée, expirée,
   copiée d'un autre compte. Seul ElevenLabs peut trancher. */

let reponse;
try {
  reponse = await fetch("https://api.elevenlabs.io/v1/user", {
    headers: { "xi-api-key": CLE },
    signal: AbortSignal.timeout(20_000),
  });
} catch (error) {
  echec(`impossible de joindre ElevenLabs : ${error.message}`, false);
}

if (!reponse.ok) {
  const corps = await reponse.text();
  echec(`ElevenLabs refuse la clé (${reponse.status}) — ${corps.slice(0, 300)}`);
}

const user = await reponse.json();
console.log("  ✓ 3/3  ElevenLabs l'accepte");

/* ── Et le quota, qui est l'autre façon de devenir muet ───────────
   D39 le dit : la dictée et la synthèse partagent la même clé, donc
   le même quota. Un compte à sec rend Casa AI sourde et muette d'un
   coup, sans le repli dont l'écrit bénéficie (D34). Une clé valide
   sur un compte vide passerait les trois contrôles ci-dessus et ne
   dirait toujours pas un mot. */

const quota = user?.subscription;
if (quota && typeof quota.character_count === "number") {
  const utilises = quota.character_count;
  const plafond = quota.character_limit ?? 0;
  const restants = plafond - utilises;
  const pourcent = plafond > 0 ? Math.round((utilises / plafond) * 100) : 0;

  console.log(
    `\n  Quota : ${utilises.toLocaleString("fr-FR")} / ${plafond.toLocaleString("fr-FR")} caractères (${pourcent} %)`,
  );

  if (restants <= 0) {
    echec("le quota est épuisé — la clé est bonne, mais la voix restera muette", false);
  }
  /* Un briefing hebdomadaire fait environ mille caractères : en
     dessous, la prochaine écoute peut tomber au milieu d'une phrase. */
  if (restants < 1000) {
    console.warn(`  ⚠ il reste moins de 1 000 caractères — soit à peu près un briefing`);
  }
}

console.log("\n  La voix peut parler et entendre sur cette machine.");
console.log("  La production, elle, dépend de la clé posée sur Vercel.\n");
