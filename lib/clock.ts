/**
 * L'horloge de Casa Liva.
 *
 * Point d'entrée unique pour lire l'heure. Deux raisons :
 *
 * 1. Lire `Date.now()` directement dans le corps d'un composant est
 *    une impureté de rendu (le React Compiler la signale). Isolée ici,
 *    la lecture redevient un accès à une source de données, ce qu'elle
 *    est réellement.
 * 2. Les tests et les captures d'écran pourront figer le temps en
 *    remplaçant cette seule fonction.
 *
 * Attention : appeler `nowMs()` dans un Server Component ne suffit pas
 * à rendre la page dynamique. Il faut `await connection()` avant, sans
 * quoi Next fige la valeur au moment du build.
 */
export function nowMs(): number {
  return Date.now();
}
