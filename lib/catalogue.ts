import type { EventCategory, Place } from "@/types";

/* ═══════════════════════════════════════════════════════════════
   Les raccourcis de la maison, côté pur (D45).

   Aucun accès base, aucun `server-only` : l'écran de création et la
   feuille de détail le consomment, et la résolution d'un lieu se fait
   **à l'affichage**, côté client comme serveur.
   ═══════════════════════════════════════════════════════════════ */

/*
 * La table de translittération, **recopiée caractère pour caractère**
 * depuis l'index de la migration 0015.
 *
 * Elle DOIT rester identique aux deux bouts. Une divergence ne
 * produirait aucune erreur : côté base l'index refuserait un doublon
 * que l'écran croit distinct, ou l'inverse — l'écran proposerait de
 * réutiliser un lieu que la base tient pour un autre. Les deux se
 * voient à l'usage, des semaines plus tard, et jamais à la relecture.
 *
 * `unaccent` aurait été plus court, mais il n'est pas `immutable` — il
 * dépend d'un dictionnaire — donc inutilisable dans un index. Le
 * déclarer immuable à tort produirait des index silencieusement faux.
 */
const ACCENTS = "ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿ";
const PLATS   = "AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOOooooooUUUUuuuuYyy";

/**
 * Deux noms que la maison lirait pareil rendent la même chaîne.
 *
 * **L'ordre des opérations est celui du SQL**, et il n'est pas
 * interchangeable : `regexp_replace` d'abord, puis `btrim`, puis
 * `translate`, puis `lower`. Replier avant de trimer laisserait
 * « Chez Mamie » et «  Chez Mamie » distincts.
 */
export function fold(label: string): string {
  const compact = label.replace(/\s+/g, " ").trim();

  let out = "";
  for (const ch of compact) {
    const i = ACCENTS.indexOf(ch);
    out += i === -1 ? ch : PLATS[i];
  }
  return out.toLowerCase();
}

/** Deux libellés désignent-ils la même chose, pour la maison ? */
export function sameLabel(a: string, b: string): boolean {
  return fold(a) === fold(b);
}

/**
 * Le lieu que ce texte désigne, ou `undefined`.
 *
 * **La liaison se fait par le nom, pas par une clé étrangère** (D45).
 * `events.location` reste du texte libre : un événement importé de
 * Google y porte une adresse brute qui ne correspond à aucun lieu
 * connu, et c'est très bien — il n'a rien à résoudre.
 *
 * Un lieu **rangé** résout encore : l'événement de mars dernier garde
 * son adresse et son itinéraire. C'est tout l'intérêt d'`archived_at`
 * plutôt qu'un `delete`. Un lieu actif l'emporte sur un rangé du même
 * nom — on ne peut en avoir qu'un actif à la fois, l'index le garantit.
 */
export function resolvePlace(
  location: string | undefined,
  places: Place[],
): Place | undefined {
  if (!location) return undefined;

  const cle = fold(location);
  const candidats = places.filter((p) => fold(p.label) === cle);

  return candidats.find((p) => !p.archivedAt) ?? candidats[0];
}

/** Ce qu'on ouvre dans une application d'itinéraire, ou `undefined`. */
export type Directions = { destination: string; maps: string; waze: string };

/**
 * Les deux liens d'itinéraire, ou rien.
 *
 * **Deux liens `https` explicites, pas un `geo:`** (D45). `geo:`
 * laisserait le téléphone choisir, ce qui serait élégant — mais il
 * n'ouvre rien de fiable sur Safari iOS, et `waze://` échoue en
 * silence quand l'application n'est pas installée. Un bouton qui ne
 * fait rien coûte plus cher que deux boutons.
 *
 * **Un lieu connu SANS adresse n'a délibérément pas de bouton.**
 * « Chez Mamie » lancé dans Maps atterrit n'importe où, et un bouton
 * qui donne un mauvais résultat est pire que pas de bouton : on
 * propose d'ajouter l'adresse à la place.
 *
 * Un texte libre qui ne désigne aucun lieu connu, en revanche, ouvre
 * sur lui-même — c'est le texte de la personne, ou l'adresse que
 * Google a fournie, et c'est mieux que rien.
 */
export function directionsFor(
  location: string | undefined,
  places: Place[],
): Directions | undefined {
  if (!location?.trim()) return undefined;

  const connu = resolvePlace(location, places);
  if (connu && !connu.address) return undefined;

  const destination = connu?.address ?? location.trim();
  const q = encodeURIComponent(destination);

  return {
    destination,
    maps: `https://www.google.com/maps/search/?api=1&query=${q}`,
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
  };
}

/**
 * Ce que le champ titre devient quand on tape une catégorie.
 *
 * **Trois cas, et le troisième est celui qui compte.** Un tap écrit le
 * titre s'il est vide, ou s'il vaut encore exactement ce qu'un tap
 * précédent y avait mis. Dès qu'un humain a tapé un caractère, le
 * champ lui appartient.
 *
 * Sans la troisième clause, taper « Apéro » puis « Golf » laisserait
 * « Apéro » avec l'émoji du golf — deux taps successifs, et le
 * formulaire ment. Avec la règle « ne jamais toucher à un champ non
 * vide », le raccourci ne raccourcirait plus rien dès le second tap.
 */
export function titleAfterTap(
  actuel: string,
  ecritParUnTap: string | null,
  categorie: EventCategory,
): string {
  if (!actuel.trim() || actuel === ecritParUnTap) return categorie.label;
  return actuel;
}

/**
 * Les catégories à montrer dans la rangée.
 *
 * Les rangées ne montrent que ce qui est actif — **sauf celle que
 * l'événement qu'on corrige porte déjà**. Sans cette exception, ouvrir
 * « Corriger » sur un vieil événement pour lui changer l'heure lui
 * ferait perdre son étiquette au premier enregistrement : sans erreur,
 * sans trace, et avec une réponse d'apparence parfaitement normale.
 */
export function visibleCategories(
  all: EventCategory[],
  porteeParLevenement?: string | null,
): EventCategory[] {
  return all.filter(
    (c) =>
      !c.archivedAt ||
      (porteeParLevenement != null && sameLabel(c.label, porteeParLevenement)),
  );
}
