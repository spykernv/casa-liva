/**
 * Vérifie qu'aucun jour et qu'aucune semaine n'est compté en heures fixes.
 *
 *   npm run verify:dates
 *
 * **Pourquoi ce contrôle existe** (JON-69). JON-60 a corrigé **neuf**
 * sites qui ajoutaient 24 h pour passer au jour suivant, ou 168 h pour
 * passer à la semaine suivante. Le ticket n'en nommait que trois ; les
 * six autres ont été trouvés à la main, et le neuvième par hasard, en
 * changeant de branche. Une recherche textuelle ne peut pas les
 * trouver toutes : `week-board.tsx` portait `7 * 24 * HOUR`, que le
 * premier `grep` — réglé sur `7 * 24 * 60` — ne pouvait pas voir.
 *
 * C'est le profil de défaut le plus coûteux de ce projet : **aucune
 * erreur, une réponse d'apparence normale, et fausse.** Un rendez-vous
 * de 23h30 dessiné à « 22h30 ». Une semaine sautée. Le 29 mars jamais
 * regardé par « ✨ Opportunité Casa ». Et tout cela **deux jours par
 * an** — le 29 mars et le 25 octobre 2026 — donc jamais pendant qu'on
 * regarde. `typecheck` et `lint` ne voient rien : l'arithmétique est
 * valide. `verify:ai` garde la confidentialité, `verify:rls`
 * l'isolation. Le navigateur de contrôle, lui, ne peut pas voyager au
 * 25 octobre.
 *
 * **Sans base et sans secret**, comme `verify:ai`, donc en CI.
 *
 * ══ Trois règles d'écriture, chacune payée ══════════════════════
 *
 * **1. Les instants sont écrits en UTC, jamais avec `setHours`.** Le
 * premier jet posait l'heure avec `date.setHours(23, 30)`, qui lit le
 * fuseau de la **machine**. Sur le poste où il a été écrit —
 * `America/New_York` — un rendez-vous de « 23h30 » devenait 05h30 à
 * Paris, et le contrôle mesurait le portable au lieu de mesurer le
 * code. Chaque instant ci-dessous est donc un ISO en `Z`, avec son
 * heure de Paris en commentaire.
 *
 * **2. Chaque cas doit discriminer, et il le prouve lui-même.** Un
 * contrôle qu'on n'a pas vu échouer ne prouve rien (`AGENTS.md`).
 * Plutôt que de le vérifier une fois à la main, chaque cas d'exécution
 * porte la **forme fautive** à côté de la bonne, et le contrôle exige
 * que les deux **divergent**. Un cas qui cesserait de discriminer —
 * parce qu'on a déplacé une date, ou arrondi une heure — tombe au lieu
 * de rester vert pour rien. C'est ce qui est arrivé au banc de JON-60 :
 * réglé sur midi, il était vert **avant comme après** la correction.
 *
 * **3. On compare les jours eux-mêmes, pas leur nombre.** Sauter le
 * 29 mars laisse quand même sept clés distinctes : la fenêtre glisse
 * d'un cran au lieu de se répéter. Un contrôle par comptage passe.
 *
 * ══ Comment il charge le vrai code ══════════════════════════════
 *
 * `./alias-hook.mjs` apprend à Node l'alias `@/` de `tsconfig.json`,
 * ce qui permet d'importer `lib/calendar/layout.ts` — le site dont le
 * défaut se voyait le plus — au lieu de se contenter de `lib/date.ts`.
 * Les imports sont **dynamiques** parce que les imports statiques sont
 * résolus avant que la moindre ligne ne s'exécute : le crochet ne
 * serait pas encore posé.
 */
import "./alias-hook.mjs";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const results = [];
const check = (name, passed, detail = "") => results.push({ name, passed, detail });

/* ── Les vrais modules ──────────────────────────────────────────── */

const { addDays } = await import("date-fns");
const {
  casaDate,
  casaDays,
  casaStartOfDay,
  dayKey,
  parseCasaDay,
  weekAnchor,
  weekDays,
  weeksFromNow,
} = await import("../lib/date.ts");
const { eventBox, gridBounds, HOUR_HEIGHT, layoutDay } = await import(
  "../lib/calendar/layout.ts"
);

/* ── Les instants qui font la différence ────────────────────────
   Europe/Paris passe à l'heure d'été le dimanche 29 mars 2026 à 02h00
   (la journée dure 23 h) et en revient le dimanche 25 octobre 2026 à
   03h00 (elle en dure 25). Tous les instants sont en UTC — voir la
   règle 1 en tête de fichier.
   ─────────────────────────────────────────────────────────────── */

const at = (iso) => new Date(iso).getTime();

const HEURE = 60 * 60_000;
const JOUR_NAIF = 24 * HEURE;
const SEMAINE_NAIVE = 7 * JOUR_NAIF;

/** Les quatre navigations de `/semaine?s=`, aller et retour, aux deux bascules. */
const NAVIGATIONS = [
  // Lundi 19 octobre 00h30 (CEST). La semaine à venir dure 169 h : en
  // ajouter 168 ramenait au dimanche 25 au soir, donc à la semaine
  // qu'on quittait. C'est le cas exact de JON-60.
  { quand: "lundi 19 oct. 00h30, une semaine en avant", now: at("2026-10-18T22:30:00Z"), offset: 1, lundi: "2026-10-26" },
  // Dimanche 25 octobre 23h30 (CET), une semaine en arrière.
  { quand: "dimanche 25 oct. 23h30, une semaine en arrière", now: at("2026-10-25T22:30:00Z"), offset: -1, lundi: "2026-10-12" },
  // Lundi 30 mars 00h30 (CEST). La semaine écoulée n'a duré que 167 h :
  // en retirer 168 remontait d'une semaine de trop.
  { quand: "lundi 30 mars 00h30, une semaine en arrière", now: at("2026-03-29T22:30:00Z"), offset: -1, lundi: "2026-03-23" },
  // Dimanche 22 mars 23h30 (CET), une semaine en avant.
  { quand: "dimanche 22 mars 23h30, une semaine en avant", now: at("2026-03-22T22:30:00Z"), offset: 1, lundi: "2026-03-23" },
];

const faux = [];
const nonDiscriminants = [];
for (const nav of NAVIGATIONS) {
  const juste = dayKey(weekDays(weekAnchor(nav.now, nav.offset))[0]);
  const naif = dayKey(weekDays(nav.now + nav.offset * SEMAINE_NAIVE)[0]);
  if (juste !== nav.lundi) faux.push(`${nav.quand} → ${juste} au lieu de ${nav.lundi}`);
  if (naif === nav.lundi) nonDiscriminants.push(nav.quand);
}
check(
  "Les quatre navigations de semaine tombent sur le bon lundi",
  faux.length === 0 && nonDiscriminants.length === 0,
  [
    faux.join(" · "),
    nonDiscriminants.length > 0
      ? `ne discrimine plus : ${nonDiscriminants.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ") || "4 navigations, dont 4 où la forme en 168 h se trompe",
);

/* `/semaine?s=` écrit l'offset dans l'URL et `weeksFromNow` le relit —
   deux endroits renvoient vers la semaine d'un événement qu'on vient
   de créer. Si les deux ne sont pas réciproques, le lien montre autre
   chose que ce qu'il promet. */
const allersRetours = [];
for (const nav of NAVIGATIONS) {
  for (let k = -2; k <= 2; k++) {
    const relu = weeksFromNow(weekAnchor(nav.now, k).getTime(), nav.now);
    if (relu !== k) allersRetours.push(`${nav.quand} · ${k} → ${relu}`);
  }
}
check(
  "`weekAnchor` et `weeksFromNow` restent réciproques à travers une bascule",
  allersRetours.length === 0,
  allersRetours.join(" · ") || "20 allers-retours",
);

/* ── Les fenêtres de requête ────────────────────────────────────
   Une borne haute trop courte d'une heure ne fait pas disparaître un
   écran : elle fait disparaître les rendez-vous de fin de soirée, un
   jour par an. C'est le défaut nommé par JON-60.
   ─────────────────────────────────────────────────────────────── */

/** Midi, les deux dimanches de bascule et un dimanche ordinaire. */
const JOURNEES = [
  { quoi: "dimanche 29 mars (23 h)", now: at("2026-03-29T10:00:00Z"), heures: 23 },
  { quoi: "dimanche 25 octobre (25 h)", now: at("2026-10-25T11:00:00Z"), heures: 25 },
  { quoi: "mardi 25 août (ordinaire)", now: at("2026-08-25T10:00:00Z"), heures: 24 },
];

const bornes = [];
for (const j of JOURNEES) {
  const debut = casaStartOfDay(j.now).getTime();
  const fin = addDays(casaStartOfDay(j.now), 1).getTime();
  const naif = debut + JOUR_NAIF;

  if ((fin - debut) / HEURE !== j.heures) {
    bornes.push(`${j.quoi} : ${(fin - debut) / HEURE} h au lieu de ${j.heures}`);
  }
  // La borne doit être minuit, pas « minuit plus quelque chose ».
  if (casaStartOfDay(fin).getTime() !== fin) bornes.push(`${j.quoi} : la borne n'est pas minuit`);
  if (dayKey(fin) === dayKey(debut)) bornes.push(`${j.quoi} : la borne reste dans le même jour`);
  // Et le cas doit discriminer, sauf le jour ordinaire.
  if (j.heures !== 24 && naif === fin) bornes.push(`${j.quoi} : ne discrimine plus`);
}
check(
  "La borne haute d'`/aujourd'hui` est le minuit suivant, pas minuit + 24 h",
  bornes.length === 0,
  bornes.join(" · ") || "23 h, 25 h, 24 h",
);

/* La même chose une semaine entière : `/semaine` charge
   `[minuit du lundi, minuit du lundi suivant)`. Une heure de moins et
   le dimanche soir n'est pas chargé ; une heure de plus et le lundi
   suivant s'invite dans la grille. */
const semaines = [];
for (const s of [
  { quoi: "semaine du 23 mars (167 h)", now: at("2026-03-25T10:00:00Z"), heures: 167 },
  { quoi: "semaine du 19 octobre (169 h)", now: at("2026-10-21T10:00:00Z"), heures: 169 },
  { quoi: "semaine du 24 août (ordinaire)", now: at("2026-08-26T10:00:00Z"), heures: 168 },
]) {
  const jours = weekDays(weekAnchor(s.now, 0));
  const de = casaStartOfDay(jours[0]).getTime();
  const a = addDays(casaStartOfDay(jours[6]), 1).getTime();

  if ((a - de) / HEURE !== s.heures) {
    semaines.push(`${s.quoi} : ${(a - de) / HEURE} h au lieu de ${s.heures}`);
  }
  // Les sept jours affichés doivent tous tomber dans la fenêtre
  // chargée — c'est la seule chose qui compte pour la personne devant
  // l'écran, et le comptage d'heures seul ne le dit pas.
  const dehors = jours.filter((d) => d.getTime() < de || d.getTime() >= a).map(dayKey);
  if (dehors.length > 0) semaines.push(`${s.quoi} : hors fenêtre ${dehors.join(", ")}`);
  if (s.heures !== 168 && de + SEMAINE_NAIVE === a) semaines.push(`${s.quoi} : ne discrimine plus`);
}
check(
  "La fenêtre de `/semaine` couvre exactement les sept jours affichés",
  semaines.length === 0,
  semaines.join(" · ") || "167 h, 169 h, 168 h",
);

/* ── Le balayage de sept jours de « ✨ Opportunité Casa » ────────
   Deux écritures fautives, et **deux instants différents** pour les
   attraper : `minuit + i × 24 h` répète le 25 octobre quelle que soit
   l'heure, tandis que `now + i × 24 h` ne saute le 29 mars que si
   `now` est assez tard dans la soirée pour que l'heure perdue suffise
   à franchir minuit. Un seul `now` à midi n'attrape ni l'un ni
   l'autre — c'est le premier piège de JON-60.
   ─────────────────────────────────────────────────────────────── */

const BALAYAGES = [
  {
    quand: "samedi 28 mars 23h30",
    now: at("2026-03-28T22:30:00Z"),
    attendu: ["2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03"],
  },
  {
    quand: "samedi 24 octobre 23h30",
    now: at("2026-10-24T21:30:00Z"),
    attendu: ["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"],
  },
];

const balayages = [];
for (const b of BALAYAGES) {
  const jours = casaDays(b.now, 7).map(dayKey);
  const depuisMinuit = Array.from({ length: 7 }, (_, i) =>
    dayKey(casaStartOfDay(b.now).getTime() + i * JOUR_NAIF),
  );
  const depuisMaintenant = Array.from({ length: 7 }, (_, i) => dayKey(b.now + i * JOUR_NAIF));

  if (jours.join(" ") !== b.attendu.join(" ")) {
    balayages.push(`${b.quand} : ${jours.join(" ")}`);
  }
  // Au moins une des deux formes fautives doit se tromper sur ce cas,
  // sinon il ne prouve rien.
  const discrimine =
    depuisMinuit.join(" ") !== b.attendu.join(" ") ||
    depuisMaintenant.join(" ") !== b.attendu.join(" ");
  if (!discrimine) balayages.push(`${b.quand} : ne discrimine plus`);
}
check(
  "Le balayage de sept jours de `/casa` ne saute ni ne répète un jour",
  balayages.length === 0,
  balayages.join(" · ") || "28 mars et 24 octobre au soir",
);

/* ── `layoutDay` — des minutes d'horloge, pas des minutes écoulées ──
   Le site dont le défaut se voyait le plus. La grille est graduée en
   heures d'horloge (`gridBounds` lit `getHours()`) ; compter les
   millisecondes depuis minuit plaçait 23h30 à la minute 1350 le
   29 mars — « 22h30 », une heure trop haut, en plein milieu — et à la
   minute 1470 le 25 octobre, c'est-à-dire **sous le bas de la
   grille**, donc nulle part.
   ─────────────────────────────────────────────────────────────── */

const evenement = (startAt, endAt) => ({
  id: "controle",
  title: "Contrôle",
  startAt,
  endAt,
  participants: [],
});

const PLACEMENTS = [
  // 23h30 → 23h59, les trois jours. La valeur attendue est 1410 : ni
  // 1350 (minutes écoulées le 29 mars), ni 1470 (le 25 octobre).
  { quoi: "23h30 le dimanche 29 mars (23 h)", jour: at("2026-03-29T10:00:00Z"), debut: "2026-03-29T21:30:00Z", fin: "2026-03-29T21:59:00Z", startMin: 1410 },
  { quoi: "23h30 le dimanche 25 octobre (25 h)", jour: at("2026-10-25T11:00:00Z"), debut: "2026-10-25T22:30:00Z", fin: "2026-10-25T22:59:00Z", startMin: 1410 },
  { quoi: "23h30 un jour ordinaire", jour: at("2026-08-25T10:00:00Z"), debut: "2026-08-25T21:30:00Z", fin: "2026-08-25T21:59:00Z", startMin: 1410 },
  // 02h30 le 25 octobre est vécu deux fois. Les deux passages sont à
  // la même position d'horloge : c'est voulu, et c'est ce que la
  // personne devant la grille voit.
  { quoi: "02h30 le 25 octobre, premier passage", jour: at("2026-10-25T11:00:00Z"), debut: "2026-10-25T00:30:00Z", fin: "2026-10-25T00:59:00Z", startMin: 150 },
  { quoi: "02h30 le 25 octobre, second passage", jour: at("2026-10-25T11:00:00Z"), debut: "2026-10-25T01:30:00Z", fin: "2026-10-25T01:59:00Z", startMin: 150 },
];

const places = [];
for (const p of PLACEMENTS) {
  const debutJour = casaStartOfDay(p.jour).getTime();
  const [pose] = layoutDay([evenement(p.debut, p.fin)], debutJour);
  // La forme fautive, calculée ici : les minutes réellement écoulées.
  const ecoulees = Math.round((at(p.debut) - debutJour) / 60_000);

  if (!pose || pose.startMin !== p.startMin) {
    places.push(`${p.quoi} : ${pose ? pose.startMin : "rien"} au lieu de ${p.startMin}`);
  }
  // Les deux coïncident 363 jours par an : seul un jour de bascule
  // peut discriminer, et le jour ordinaire est là comme témoin.
  if (p.quoi.includes("ordinaire") && ecoulees !== p.startMin) {
    places.push(`${p.quoi} : le témoin diverge`);
  }
}
const discriminants = PLACEMENTS.filter(
  (p) => Math.round((at(p.debut) - casaStartOfDay(p.jour).getTime()) / 60_000) !== p.startMin,
);
check(
  "`layoutDay` place l'événement à son heure d'horloge, pas aux minutes écoulées",
  places.length === 0 && discriminants.length >= 2,
  places.join(" · ") ||
    `${PLACEMENTS.length} placements, dont ${discriminants.length} où les minutes écoulées se trompent`,
);

/* Minuit du lendemain vaut 1440, pas 0 — sinon un événement qui court
   jusqu'au bout de la journée passe sous le filtre `endMin > startMin`
   et n'est **pas dessiné du tout**. */
const jusquAMinuit = [];
for (const j of JOURNEES) {
  const debutJour = casaStartOfDay(j.now).getTime();
  const finJour = addDays(casaStartOfDay(j.now), 1).getTime();
  const [pose] = layoutDay(
    [evenement(new Date(finJour - 2 * HEURE).toISOString(), new Date(finJour).toISOString())],
    debutJour,
  );
  if (!pose) jusquAMinuit.push(`${j.quoi} : rien n'est dessiné`);
  else if (pose.endMin !== 1440) jusquAMinuit.push(`${j.quoi} : endMin = ${pose.endMin}`);
}
// Et l'événement qui déborde des deux côtés reste découpé à la journée.
for (const j of JOURNEES) {
  const debutJour = casaStartOfDay(j.now).getTime();
  const [pose] = layoutDay(
    [
      evenement(
        new Date(debutJour - 5 * HEURE).toISOString(),
        new Date(debutJour + 30 * HEURE).toISOString(),
      ),
    ],
    debutJour,
  );
  if (!pose || pose.startMin !== 0 || pose.endMin !== 1440) {
    jusquAMinuit.push(`${j.quoi} : débordement découpé en [${pose?.startMin}, ${pose?.endMin}]`);
  }
}
check(
  "Un événement qui court jusqu'à minuit finit à 1440, pas à 0",
  jusquAMinuit.length === 0,
  jusquAMinuit.join(" · ") || "3 journées, bornes comprises",
);

/* Et le bout du chemin : la grille doit contenir le bloc. C'est la
   traduction en pixels que le banc de JON-60 ne couvrait pas — le
   25 octobre, la minute 1470 tombait sous `Math.min(24, eh)`, donc
   l'événement n'était **nulle part**.

   **Le cas de minuit pile en fait partie depuis JON-75.** Il était
   d'abord évité exprès : `gridBounds` relisait `e.endAt` pour son
   propre compte et lisait `getHours() === 0` sur une fin à minuit,
   donc n'élargissait pas — pendant que `clampToDay` plaçait
   correctement la fin à 1440. Un `22h00 → 00h00` atterrissait à
   `top: 896` dans une grille de 896 px, tous les jours de l'année.
   Les bornes se déduisent maintenant de `clampToDay`, et le cas est
   contrôlé au lieu d'être contourné. */
const GRILLE = [
  ...PLACEMENTS.map((p) => ({ quoi: p.quoi, jour: p.jour, debut: p.debut, fin: p.fin })),
  // 22h00 → 00h00, les trois journées. Le cas de JON-75.
  { quoi: "22h00 → minuit pile, le 29 mars (23 h)", jour: at("2026-03-29T10:00:00Z"), debut: "2026-03-29T20:00:00Z", fin: "2026-03-29T22:00:00Z" },
  { quoi: "22h00 → minuit pile, le 25 octobre (25 h)", jour: at("2026-10-25T11:00:00Z"), debut: "2026-10-25T21:00:00Z", fin: "2026-10-25T23:00:00Z" },
  { quoi: "22h00 → minuit pile, un jour ordinaire", jour: at("2026-08-25T10:00:00Z"), debut: "2026-08-25T20:00:00Z", fin: "2026-08-25T22:00:00Z" },
];

const horsGrille = [];
for (const p of GRILLE) {
  const debutJour = casaStartOfDay(p.jour).getTime();
  const ev = evenement(p.debut, p.fin);
  const [pose] = layoutDay([ev], debutJour);
  const { startHour, endHour } = gridBounds([ev], debutJour);
  const boite = eventBox(pose, startHour);
  const hauteur = (endHour - startHour) * HOUR_HEIGHT;
  if (!pose) {
    horsGrille.push(`${p.quoi} : rien n'est placé`);
  } else if (boite.top < 0 || boite.top + boite.height > hauteur) {
    horsGrille.push(`${p.quoi} : ${boite.top}→${boite.top + boite.height} pour ${hauteur} px`);
  }
}
check(
  "Le bloc reste à l'intérieur de la grille, minuit pile compris",
  horsGrille.length === 0,
  horsGrille.join(" · ") || `${GRILLE.length} blocs`,
);

/* Et la règle d'origine ne doit pas avoir été perdue en chemin : la
   grille ne s'élargit **que** quand un événement le réclame. Sans ce
   contrôle, « faire tenir le bloc » se règle en affichant 24 h tout le
   temps — ce qui donnerait l'agenda mort que `DAY_WINDOW` existe pour
   éviter, et personne ne le verrait dans le contrôle du dessus. */
const fenetres = [];
for (const cas of [
  { quoi: "une journée sans rien", evenements: [], attendu: [8, 22] },
  { quoi: "un rendez-vous en pleine journée", evenements: [["2026-08-25T12:00:00Z", "2026-08-25T13:00:00Z"]], attendu: [8, 22] },
  { quoi: "un événement qui finit pile à 22h", evenements: [["2026-08-25T19:00:00Z", "2026-08-25T20:00:00Z"]], attendu: [8, 22] },
  { quoi: "un footing à 7h", evenements: [["2026-08-25T05:00:00Z", "2026-08-25T05:45:00Z"]], attendu: [7, 22] },
  { quoi: "22h30 → 23h00", evenements: [["2026-08-25T20:30:00Z", "2026-08-25T21:00:00Z"]], attendu: [8, 23] },
  { quoi: "22h00 → minuit pile", evenements: [["2026-08-25T20:00:00Z", "2026-08-25T22:00:00Z"]], attendu: [8, 24] },
]) {
  const debutJour = casaStartOfDay(at("2026-08-25T10:00:00Z")).getTime();
  const { startHour, endHour } = gridBounds(
    cas.evenements.map(([d, f]) => evenement(d, f)),
    debutJour,
  );
  if (startHour !== cas.attendu[0] || endHour !== cas.attendu[1]) {
    fenetres.push(`${cas.quoi} : ${startHour}→${endHour} au lieu de ${cas.attendu[0]}→${cas.attendu[1]}`);
  }
}
check(
  "La grille ne s'élargit que quand un événement le réclame",
  fenetres.length === 0,
  fenetres.join(" · ") || "6 fenêtres, de 8→22 à 8→24",
);

/* ── `parseCasaDay` — minuit à Paris, y compris les jours de bascule ──
   Une date peut venir d'une barre d'adresse **ou d'un modèle**. Si
   elle ne rend pas exactement minuit, le briefing d'un jour de bascule
   commence une heure trop tôt ou trop tard, et personne ne le voit. */
const minuits = [];
for (const jour of ["2026-03-29", "2026-10-25", "2026-08-25"]) {
  for (const j of JOURNEES) {
    const lu = parseCasaDay(jour, j.now);
    if (lu === null) minuits.push(`${jour} refusé`);
    else if (dayKey(lu) !== jour) minuits.push(`${jour} → ${dayKey(lu)}`);
    else if (casaDate(lu).getHours() !== 0 || casaDate(lu).getMinutes() !== 0) {
      minuits.push(`${jour} → ${casaDate(lu).getHours()}h${casaDate(lu).getMinutes()}`);
    }
  }
}
check(
  "`parseCasaDay` rend minuit à Paris, les jours de bascule compris",
  minuits.length === 0,
  minuits.join(" · ") || "3 dates × 3 horloges",
);

/* ═══════════════════════════════════════════════════════════════
   Le contrôle de forme.

   Les contrôles ci-dessus prouvent que les fonctions **existantes**
   sont justes. Celui-ci empêche la **dixième** occurrence d'être
   écrite : il refuse toute expression qui compte un jour ou une
   semaine en millisecondes, où qu'elle soit.

   Il attrape les deux écritures que le `grep` de JON-60 avait ratées
   l'une après l'autre — `24 * 60 * 60_000` **et** `24 * HOUR`, ainsi
   que `7 * 24 * …` et les constantes dérivées.
   ═══════════════════════════════════════════════════════════════ */

const DOSSIERS = ["lib", "app", "components", "actions", "hooks"];

function fichiers(...dossiers) {
  const trouves = [];
  const marcher = (chemin) => {
    for (const entree of readdirSync(chemin)) {
      const complet = join(chemin, entree);
      if (statSync(complet).isDirectory()) marcher(complet);
      else if (/\.tsx?$/.test(entree)) trouves.push(complet);
    }
  };
  for (const d of dossiers) marcher(join(root, d));
  return trouves;
}

/**
 * Les formes qui comptent un jour ou une semaine en millisecondes.
 *
 * Écrites larges exprès : c'est l'étroitesse du `grep` de JON-60 qui
 * lui avait fait rater `7 * 24 * HOUR`.
 */
const FORMES = [
  { quoi: "24 × 60 ou 24 × HOUR", re: /(?:^|[^\w_.])24\s*\*\s*(?:60|HOUR|MINUTE)\b/ },
  { quoi: "n × 24 × …", re: /\*\s*24\s*\*/ },
  { quoi: "86 400 000 en clair", re: /\b86_?400_?000\b/ },
  { quoi: "une constante de jour ou de semaine", re: /\b(?:DAY_MS|WEEK_MS|WEEK)\s*\*|\*\s*\b(?:DAY_MS|WEEK_MS|WEEK)\b/ },
];

/**
 * Les sites délibérés, avec la raison **et le nombre de lignes**
 * concernées.
 *
 * Le compte n'est pas de la comptabilité : sans lui, un fichier
 * dispensé une fois le reste pour toujours, et la dixième occurrence
 * s'écrirait précisément là où plus personne ne regarde. Une ligne de
 * plus dans `sync.ts` fait tomber ce contrôle, ce qui oblige à
 * **décider** au lieu de laisser filer.
 */
const DELIBERES = [
  {
    fichier: "lib/calendar/sync.ts",
    lignes: 4,
    pourquoi:
      "fenêtre de synchronisation de ±60 jours : une heure de dérive n'y veut rien dire",
  },
  {
    fichier: "lib/date.ts",
    lignes: 1,
    pourquoi: "`weeksFromNow` — le `Math.round` est là exactement pour absorber l'heure",
  },
  {
    fichier: "lib/ai/tools.ts",
    lignes: 1,
    pourquoi:
      "compte un nombre de jours avec `Math.round`, pour refuser une plage trop large — même raison",
  },
];

const dispense = new Map(DELIBERES.map((d) => [d.fichier, d]));

/**
 * Les lignes de code d'un fichier, commentaires retirés.
 *
 * **Indispensable, et pas de la coquetterie** : les corrections de
 * JON-60 ont laissé partout des commentaires qui *citent* la forme
 * fautive (« `addDays` et non `offset * 24 h` »). Sans ce filtrage, le
 * contrôle échouerait sur les commentaires qui expliquent pourquoi il
 * existe.
 *
 * Détection à la ligne, sans analyser les chaînes : la seule erreur
 * possible est un `//` à l'intérieur d'un littéral, ce qui ferait
 * ignorer une vraie ligne de code. Le compromis est assumé — une
 * analyse de chaînes casse sur le texte JSX, où l'apostrophe française
 * ouvre une chaîne qui ne se referme jamais.
 */
function lignesDeCode(source) {
  const lignes = [];
  let dansUnBloc = false;

  for (const [index, brute] of source.split("\n").entries()) {
    let ligne = brute;

    if (dansUnBloc) {
      const fin = ligne.indexOf("*/");
      if (fin === -1) continue;
      ligne = ligne.slice(fin + 2);
      dansUnBloc = false;
    }

    // Un bloc ouvert et non refermé sur la même ligne avale la suite.
    for (;;) {
      const ouverture = ligne.indexOf("/*");
      if (ouverture === -1) break;
      const fermeture = ligne.indexOf("*/", ouverture + 2);
      if (fermeture === -1) {
        ligne = ligne.slice(0, ouverture);
        dansUnBloc = true;
        break;
      }
      ligne = ligne.slice(0, ouverture) + ligne.slice(fermeture + 2);
    }

    const commentaire = ligne.indexOf("//");
    if (commentaire !== -1) ligne = ligne.slice(0, commentaire);

    if (ligne.trim() !== "") lignes.push({ numero: index + 1, texte: ligne });
  }

  return lignes;
}

const interdits = [];
const comptes = new Map();

for (const fichier of fichiers(...DOSSIERS)) {
  const chemin = relative(root, fichier).split("\\").join("/");
  for (const { numero, texte } of lignesDeCode(readFileSync(fichier, "utf8"))) {
    const forme = FORMES.find((f) => f.re.test(texte));
    if (!forme) continue;

    if (dispense.has(chemin)) {
      comptes.set(chemin, (comptes.get(chemin) ?? 0) + 1);
    } else {
      interdits.push(`${chemin}:${numero} — ${forme.quoi}`);
    }
  }
}

check(
  "Aucun jour ni aucune semaine n'est compté en millisecondes",
  interdits.length === 0,
  interdits.join(" · ") ||
    `${fichiers(...DOSSIERS).length} fichiers, ${DELIBERES.length} exceptions déclarées`,
);

/* Une liste d'exceptions périmée est une liste qui ment : elle dispense
   un fichier de quelque chose qu'il ne fait plus, et masquerait ce
   qu'il se mettrait à faire. */
const menteuses = DELIBERES.flatMap((d) => {
  const vu = comptes.get(d.fichier) ?? 0;
  if (vu === d.lignes) return [];
  return [`${d.fichier} : ${vu} ligne(s) au lieu de ${d.lignes} — ${d.pourquoi}`];
});
check(
  "La liste des exceptions dit encore la vérité",
  menteuses.length === 0,
  menteuses.join(" · ") ||
    DELIBERES.map((d) => `${d.fichier} (${d.lignes})`).join(", "),
);

/* ── Verdict ──────────────────────────────────────────────────── */

let failed = 0;
for (const r of results) {
  if (!r.passed) failed++;
  console.log(
    `${r.passed ? "  OK  " : " ÉCHEC"}  ${r.name}${r.detail ? `  — ${r.detail}` : ""}`,
  );
}

console.log(
  failed === 0
    ? `\n${results.length} contrôles, tous passés.`
    : `\n${failed} contrôle(s) en échec sur ${results.length}.`,
);
process.exit(failed === 0 ? 0 : 1);
