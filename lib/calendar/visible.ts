import type { CasaEvent, FamilyMember } from "@/types";

/* ═══════════════════════════════════════════════════════════════
   Ce qu'on a le droit de dire d'un événement.

   Une seule règle, à un seul endroit. Elle vaut partout où un
   événement sort de l'application : un email (§39-42), une réponse de
   Casa AI (§35), et demain une lecture à voix haute (phase 8).

   **Pourquoi ici et pas recopié à chaque fois.** La confidentialité de
   D13 est appliquée à l'import : en mode `availability`, le titre réel
   n'entre jamais dans la base. Mais « on ne peut pas divulguer ce
   qu'on n'a pas stocké » ne protège que le titre — il reste à décider
   comment on *nomme* l'événement masqué, et deux copies de cette
   décision finissent par diverger. C'est la copie oubliée qui fuit.

   Les vues d'agenda gardent leur propre rendu (« 🔒 Occupé » avec la
   pastille de couleur juste à côté, qui dit déjà de qui il s'agit) :
   c'est une mise en forme, pas une seconde règle.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Le titre affichable d'un événement.
 *
 * Un événement masqué s'écrit « Untel occupé » — jamais son titre, et
 * jamais un simple « Occupé » anonyme : sans le prénom, une phrase
 * comme « il y a un Occupé mercredi » ne veut rien dire.
 */
export function visibleTitle(event: CasaEvent, owner?: FamilyMember): string {
  if (event.isPrivate) return `${owner?.firstName ?? "Quelqu’un"} occupé`;
  return event.title;
}

/**
 * Le lieu affichable, ou `undefined`.
 *
 * Redondant avec l'import — `applyVisibility` met déjà `location` à
 * `null` dès que le mode n'est pas `full` — et c'est exactement le but.
 * Le jour où un lieu arrivera par un autre chemin (saisie manuelle sur
 * un événement importé, migration, correctif), la règle tiendra encore.
 */
export function visibleLocation(event: CasaEvent): string | undefined {
  return event.isPrivate ? undefined : event.location;
}
