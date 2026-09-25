import type { CasaEvent } from "@/types";

/* ═══════════════════════════════════════════════════════════════
   De qui parle l'écran — « la maison » ou « moi » (D47).

   Module **pur** : aucun accès base, aucun `server-only`. C'est
   délibéré, et c'est la leçon de `lib/data/availability.ts` — une
   constante rangée dans un module `server-only` puis lue par un
   composant client embarque tout le client Supabase dans le bundle du
   navigateur. Ici, l'écran ET la voix consomment les mêmes fonctions ;
   elles ne peuvent donc vivre que dans un module que les deux peuvent
   importer.
   ═══════════════════════════════════════════════════════════════ */

export const WEEK_SCOPES = ["maison", "moi"] as const;
export type WeekScope = (typeof WEEK_SCOPES)[number];

/**
 * Lit la portée d'une URL.
 *
 * `find` sur une liste fermée, jamais un `as` : c'est la forme retenue
 * partout où une valeur vient du navigateur. Et un **défaut** plutôt
 * qu'une erreur — un vieux bundle servi juste après un déploiement doit
 * rendre le comportement d'hier, pas un écran cassé. Ce cas précis
 * s'est produit le 4 août, et il ressemble trait pour trait à un
 * défaut.
 */
export function parseScope(raw: string | undefined): WeekScope {
  return WEEK_SCOPES.find((s) => s === raw) ?? "maison";
}

/**
 * Ma semaine : **les événements où je participe sans m'être désisté.**
 * Rien d'autre.
 *
 * **Pas de `|| ev.creatorId === meId`, et c'est vérifié plutôt que
 * supposé.** On croit volontiers qu'un événement importé de Google
 * n'aurait que son propriétaire en participant, ce qui obligerait à
 * rattraper par le créateur : `lib/calendar/sync.ts` écrit **toujours**
 * une ligne `event_participants` en `accepted`, et `createEvent` force
 * le créateur dans la liste. La clause n'aurait donc rien rattrapé.
 *
 * Elle aurait en revanche créé une incohérence réelle : un événement
 * que j'ai créé **puis décliné** serait dans « ma semaine » et absent
 * de « la semaine de la maison ». Un sous-ensemble qui n'en est pas un,
 * et personne n'aurait su dire pourquoi.
 *
 * C'est aussi ce qui donne son sens au geste de D50 : **se retirer d'un
 * événement le fait disparaître de sa propre semaine.** Sans cette
 * définition, se retirer ne se verrait nulle part.
 */
export function mine(events: CasaEvent[], meId: string): CasaEvent[] {
  return events.filter((ev) =>
    ev.participants.some((p) => p.userId === meId && p.status !== "declined"),
  );
}

/** Mon statut sur un événement, ou `null` si je n'y suis pas. */
export function myStatus(event: CasaEvent, meId: string) {
  return event.participants.find((p) => p.userId === meId)?.status ?? null;
}

/**
 * Ce que l'écran montre, pour une portée donnée.
 *
 * Une portée peut aussi être l'identifiant d'un habitant : la rangée de
 * filtre mêle « La maison », « Moi » et une pastille par personne, et
 * les trois répondent à la même question — *de qui montre-t-on les
 * événements ?*. Un seul chemin de code, donc une seule règle.
 */
export function eventsForScope(
  events: CasaEvent[],
  scope: WeekScope | string,
  meId: string,
): CasaEvent[] {
  if (scope === "maison") return events;
  return mine(events, scope === "moi" ? meId : scope);
}

/**
 * Le libellé du bouton d'écoute.
 *
 * Une pastille de **membre** laisse le libellé sur « la maison » : la
 * route de briefing ne connaît que deux portées, on n'en fabrique pas
 * une troisième pour un filtre visuel — et surtout **on ne laisse pas
 * le libellé mentir** sur ce qui va être prononcé.
 */
export function listenScope(scope: WeekScope | string): WeekScope {
  return scope === "moi" ? "moi" : "maison";
}
