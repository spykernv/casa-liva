/* ═══════════════════════════════════════════════════════════════
   Les voix que Casa AI sait prendre.

   **Une liste courte et choisie, pas le catalogue d'ElevenLabs.** Le
   compte en expose des dizaines ; en proposer dix reviendrait à ne
   proposer personne. Quatre suffisent à ce qu'on ne subisse pas la
   voix qu'on entendra tous les matins — et c'est la règle produit qui
   tranche : « une action courante prend moins de quinze secondes ».

   Les quatre identifiants ont été vérifiés un par un contre l'API le
   4 août. Ce fichier n'est pas dans `server-only` : le sélecteur de
   `/moi` a besoin des noms et des descriptions, et un identifiant de
   voix n'est pas un secret — c'est la **clé** qui l'est, et elle ne
   sort jamais du serveur.
   ═══════════════════════════════════════════════════════════════ */

export type Voice = {
  id: string;
  name: string;
  /** Ce qu'on entend, pas ce que le catalogue en dit. */
  description: string;
};

/**
 * La voix de la maison, celle qu'on a quand on n'a rien choisi.
 *
 * Chaleureuse et conversationnelle : c'est le ton du produit (§3).
 * Une voix « narrative » lirait l'agenda comme un conte, ce qui va
 * bien pour une histoire du soir et mal pour « rendez-vous à 14h ».
 */
export const DEFAULT_VOICE = "lvQdCgwZfBuOzxyV5pxu";

export const VOICES: readonly Voice[] = [
  {
    id: "lvQdCgwZfBuOzxyV5pxu",
    name: "Audia",
    description: "Chaleureuse et vivante. Celle de la maison.",
  },
  {
    id: "mVjOqyqTPfwlXPjV5sjX",
    name: "Thierry",
    description: "Masculine, posée, un rien cérémonieuse.",
  },
  {
    id: "ucMmKRQbfDEYyb2IIGax",
    name: "Aurore",
    description: "Douce et grave. Parfaite le matin très tôt.",
  },
  {
    id: "2dxaXwaYxEEIDjoHj0V4",
    name: "Léo",
    description: "Québécois. Pour le plaisir.",
  },
] as const;

/**
 * La phrase de l'aperçu — cinq secondes, pas plus.
 *
 * Elle dit une heure et un jour parce que c'est ce que la voix aura à
 * dire tous les jours : une voix qui rend bien sur « bonjour » et mal
 * sur « quatorze heures trente » serait choisie pour de mauvaises
 * raisons. Identique pour les quatre, sinon on ne comparerait rien.
 */
export const PREVIEW_TEXT =
  "Bonjour ! Demain, golf à dix heures, puis apéro à dix-neuf heures. Belle journée en perspective.";

/** La voix demandée si elle existe, celle de la maison sinon. */
export function resolveVoice(wanted: string | null | undefined): string {
  if (!wanted) return DEFAULT_VOICE;
  return VOICES.some((v) => v.id === wanted) ? wanted : DEFAULT_VOICE;
}

/**
 * Cette voix est-elle dans la liste ?
 *
 * Le garde-fou de la route d'aperçu. Sans lui, elle serait un proxy
 * ouvert vers ElevenLabs : n'importe quelle voix du catalogue, autant
 * de fois qu'on veut, sur le quota du compte.
 */
export function isKnownVoice(id: unknown): id is string {
  return typeof id === "string" && VOICES.some((v) => v.id === id);
}
