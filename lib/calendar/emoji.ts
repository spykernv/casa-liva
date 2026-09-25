/* ═══════════════════════════════════════════════════════════════
   Deviner l'émoji d'un événement à partir de son titre.

   Sert quand personne n'a le temps d'en choisir un — « ✨ Trouver un
   moment » crée en un tap, et un « ⛳ Golf » se repère dans la grille
   bien plus vite qu'un « Golf ».

   Volontairement bête et local : pas d'IA, pas de réseau, pas de
   surprise. Un mot reconnu, ou rien.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Mot-clé → émoji. L'ordre compte : le premier trouvé gagne.
 *
 * Les motifs s'écrivent **sans accent** : ils sont testés contre un
 * titre dont les accents ont été retirés, pour que « déjeuner » et
 * « dejeuner » tombent sur la même règle. On tape vite sur un
 * téléphone, et rarement bien.
 */
const HINTS: [RegExp, string][] = [
  [/\bgolf\b/, "⛳"],
  [/\b(apero|aperitif|verre)\b/, "🍷"],
  [/\b(dejeuner|dej|repas|diner|resto|restaurant|brunch|midi)\b/, "🍝"],
  [/\b(cine|cinema|film|seance)\b/, "🎬"],
  [/\b(plage|mer|piscine|baignade)\b/, "🏖️"],
  [/\b(courses|marche|supermarche)\b/, "🛒"],
  [/\b(foot|match|tennis|sport|basket|rando|randonnee|velo)\b/, "⚽"],
  [/\b(anniversaire|anniv|gateau|fete)\b/, "🎂"],
  [/\b(medecin|dentiste|docteur|kine|analyses)\b/, "🩺"],
  [/\b(avion|vol|voyage|vacances|depart)\b/, "✈️"],
  [/\b(cafe|petit-dejeuner)\b/, "☕"],
  [/\b(balade|promenade|parc)\b/, "🌳"],
  [/\b(concert|musique|spectacle|theatre)\b/, "🎵"],
  [/\b(travaux|bricolage|menage|rangement)\b/, "🔧"],
];

/**
 * L'émoji qui va avec ce titre, ou `undefined` si rien ne colle.
 *
 * On ne devine jamais « au hasard » : un émoji faux est pire que pas
 * d'émoji du tout, parce qu'on le lit avant le mot.
 */
export function guessEmoji(title: string): string | undefined {
  const normalized = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

  return HINTS.find(([pattern]) => pattern.test(normalized))?.[1];
}
