/**
 * Le contrôle permanent des rappels (D56, JON-79).
 *
 *   npm run verify:rappels
 *
 * **Pourquoi celui-ci existe, alors que trois autres tournent déjà.**
 * Le balayage des rappels s'exécute **sans personne devant** — un
 * workflow GitHub Actions, toutes les quinze minutes, sur un serveur.
 * Un défaut y est invisible par construction : il ne rend pas d'erreur,
 * il rend un rappel de trop, un rappel manquant, ou rien du tout. Aucun
 * des trois ne se voit à l'écran, et le premier à s'en apercevoir serait
 * quelqu'un qui a raté son train.
 *
 * Il charge **le vrai module** — `rappelDu`, celle qui décide en
 * production — par le crochet d'alias, sans base ni secret. Ce qui
 * s'exécute ici est ce qui tourne là-bas.
 *
 * ── La discipline, reprise de `verify:dates` ──
 *
 * **Chaque cas porte la forme fautive à côté de la bonne, et exige
 * qu'elles divergent.** Un contrôle qui reste vert après avoir cassé ce
 * qu'il garde ne prouve rien — le banc de JON-60, réglé sur midi, était
 * vert avant comme après la correction. Ici, un cas qui cesse de
 * discriminer fait tomber le contrôle au lieu de rassurer pour rien.
 */

import { rappelDu } from "../lib/push/rappels.ts";
import { minutesRestantes, libelleRappel, OPTIONS_RAPPEL } from "../lib/rappels.ts";

const results = [];
const check = (name, passed, detail = "") => results.push({ name, passed, detail });

/* Un instant fixe, écrit en UTC. Jamais `setHours` : il lit le fuseau
   de la machine, et ce banc doit rendre le même verdict sur un poste en
   `America/New_York` et en CI, qui tourne en UTC. C'est le piège payé
   en écrivant `verify:dates`. */
const MAINTENANT = Date.parse("2026-08-26T16:00:00Z"); // 18h00 à Paris
const min = (n) => MAINTENANT + n * 60_000;
const iso = (ms) => new Date(ms).toISOString();

const ligne = (start, minutes, envoyePour = null) => ({
  start_at: iso(start),
  rappel_minutes: minutes,
  rappel_envoye_pour: envoyePour === null ? null : iso(envoyePour),
});

/* ── 1. La table de vérité ────────────────────────────────────────
   Six cas, et surtout : des `true` ET des `false`. Une table qui
   n'attendrait que des `true` passerait avec une fonction qui rend
   toujours `true`. */
const CAS = [
  { nom: "dû : dans 20 min, rappel à 30, jamais envoyé", l: ligne(min(20), 30), attendu: true },
  { nom: "pas dû : déjà envoyé POUR cette heure", l: ligne(min(20), 30, min(20)), attendu: false },
  { nom: "dû : DÉPLACÉ — envoyé pour une autre heure", l: ligne(min(20), 30, min(200)), attendu: true },
  { nom: "pas dû : encore trop tôt (2 h, rappel à 30)", l: ligne(min(120), 30), attendu: false },
  { nom: "pas dû : l'événement a déjà commencé", l: ligne(min(-10), 30), attendu: false },
  { nom: "pas dû : l'organisateur n'en veut pas", l: ligne(min(20), null), attendu: false },
];

const rates = CAS.filter((c) => rappelDu(c.l, MAINTENANT) !== c.attendu).map((c) => c.nom);
check(
  "La règle rend le bon verdict sur les six situations",
  rates.length === 0,
  rates.length > 0 ? rates.join(" · ") : `${CAS.length} cas, ${CAS.filter((c) => c.attendu).length} dûs`,
);

/* ── 2. La borne du délai discrimine ──────────────────────────────
   À la minute près, et des deux côtés. Un « ≤ » devenu « < » ne se
   verrait qu'un quart d'heure par événement. */
const pile = ligne(min(30), 30);
const uneDeTrop = ligne(min(31), 30);
check(
  "L'heure du rappel ouvre pile au délai, et pas une minute avant",
  rappelDu(pile, MAINTENANT) === true && rappelDu(uneDeTrop, MAINTENANT) === false,
  `pile=${rappelDu(pile, MAINTENANT)} · +1min=${rappelDu(uneDeTrop, MAINTENANT)}`,
);

/* ── 3. LE point du ticket : un déplacement relance le rappel ──────
   La forme fautive est écrite ici, à côté, et on EXIGE que les deux
   divergent. C'est ce qui aurait manqué si `rappel_envoye_pour` avait
   été un booléen : le rappel d'un rendez-vous repoussé de trois heures
   ne serait jamais parti, et rien ne l'aurait dit. */
const deplace = ligne(min(20), 30, min(200));
const booleenFautif = (l) => l.rappel_envoye_pour !== null; // « déjà envoyé ? »
check(
  "Un événement déplacé redevient dû — là où un booléen l'aurait tu",
  rappelDu(deplace, MAINTENANT) === true && booleenFautif(deplace) === true,
  "la forme fautive dit « déjà envoyé », la bonne dit « à renvoyer »",
);

/* ── 4. Le délai annoncé est celui qu'on CONSTATE ─────────────────
   Le planificateur glisse (D54). Réutiliser `rappel_minutes` pour
   écrire la notification produirait « dans 30 min » sur un rappel parti
   avec vingt minutes de retard. La forme fautive est à côté. */
const RETARD = 20;
const debut = min(30);
const partiEnRetard = MAINTENANT + RETARD * 60_000;
const constate = minutesRestantes(debut, partiEnRetard);
const recopie = 30; // la forme fautive : on redit le délai demandé
check(
  "Le délai annoncé suit le retard du planificateur, il ne le recopie pas",
  constate === 10 && constate !== recopie,
  `constaté=${constate} min · recopié=${recopie} min (retard de ${RETARD} min)`,
);

check(
  "Un rappel parti après le début n'annonce pas un délai négatif",
  minutesRestantes(min(-5), MAINTENANT) === 0,
  `${minutesRestantes(min(-5), MAINTENANT)} min`,
);

/* ── 5. Les options proposées tiennent dans la borne de 0017 ──────
   La base refuse au-delà de 1440. Une option hors borne ferait échouer
   l'enregistrement d'un événement sur un champ accessoire. */
const horsBorne = OPTIONS_RAPPEL.filter(
  (o) => o.minutes !== null && (o.minutes < 0 || o.minutes > 1440),
);
check(
  "Toutes les options tiennent dans la contrainte de la base",
  horsBorne.length === 0 && OPTIONS_RAPPEL.some((o) => o.minutes === null),
  horsBorne.length > 0
    ? `hors borne : ${horsBorne.map((o) => o.minutes).join(", ")}`
    : `${OPTIONS_RAPPEL.length} options, dont « pas de rappel »`,
);

check(
  "Chaque option sait se dire, et « pas de rappel » aussi",
  OPTIONS_RAPPEL.every((o) => libelleRappel(o.minutes) === o.libelle) &&
    libelleRappel(undefined) === "Pas de rappel",
  OPTIONS_RAPPEL.map((o) => o.libelle).join(" · "),
);

/* ── Verdict ─────────────────────────────────────────────────────── */
let echecs = 0;
for (const r of results) {
  if (!r.passed) echecs += 1;
  const marque = r.passed ? "  OK  " : "  ÉCHEC";
  console.log(`${marque}  ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
}

console.log(
  `\n${results.length} contrôles, ${echecs === 0 ? "tous passés." : `${echecs} en échec.`}`,
);
process.exit(echecs === 0 ? 0 : 1);
