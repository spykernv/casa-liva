import type { Interval } from "@/types";

/* ═══════════════════════════════════════════════════════════════
   Agendas externes — le contrat, pas l'implémentation.

   Casa Liva ne lit qu'un seul fournisseur aujourd'hui (Google), mais
   une famille réelle mélange Google, iCloud et Outlook. Ce fichier
   existe pour que le deuxième fournisseur soit un fichier de plus, et
   non une réécriture (cf. DECISIONS.md, D10).

   Le piège, quand on n'écrit qu'une implémentation, est de décalquer
   son vocabulaire. Google donne un `syncToken`, Microsoft Graph un
   *delta token*, CalDAV un `ctag` : trois façons de dire « reprends
   ici ». L'interface ne connaît donc qu'un **curseur opaque**, dont
   elle ne lit jamais le contenu.

   Deuxième règle : rien de ce qui sort d'ici ne ressemble à un objet
   Google. La normalisation appartient à l'adaptateur ; le reste de
   l'application ne voit que les types de ce fichier.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Marqueur rendu par le fournisseur à la fin d'une lecture, et qu'on
 * lui rendra à la lecture suivante pour n'obtenir que les
 * changements.
 *
 * **Son contenu ne se lit pas et ne se fabrique pas.** C'est une
 * chaîne à conserver telle quelle et à rendre telle quelle. Chez
 * Google il encapsule les filtres de la requête initiale — raison de
 * plus pour ne jamais essayer de le comprendre.
 */
export type SyncCursor = string;

/**
 * Nature d'un agenda, du point de vue de ce qu'il apporte à une
 * famille.
 *
 * Les fournisseurs abonnent d'office à des agendas générés qui n'ont
 * rien d'un rendez-vous — les numéros de semaine posent une étiquette
 * sur *chaque* semaine, les anniversaires importés du carnet
 * d'adresses se comptent par centaines. On ne les écarte pas d'autorité,
 * c'est un choix qui appartient à la personne ; mais l'écran de
 * sélection doit pouvoir le dire, pour que le choix soit éclairé.
 *
 * L'adaptateur classe, l'interface ne formule rien : les mots affichés
 * appartiennent à l'UI.
 */
export type CalendarKind =
  /** Un vrai agenda : le principal, « Famille », « Boulot »… */
  | "personal"
  /** Jours fériés et fêtes du pays. */
  | "holidays"
  /** Une étiquette par semaine. Du décor, jamais un rendez-vous. */
  | "weekNumbers"
  /** Anniversaires tirés du carnet d'adresses. */
  | "birthdays";

/** Un agenda proposé par le fournisseur, tel qu'on le montre au choix. */
export type ExternalCalendar = {
  id: string;
  /** « Perso », « Boulot », « Anniversaires »… */
  name: string;
  /** L'agenda principal du compte — celui à cocher par défaut. */
  primary: boolean;
  kind: CalendarKind;
};

/**
 * Un événement normalisé, prêt à devenir un `CasaEvent`.
 *
 * Les instants sont **absolus et déjà résolus** : une journée entière
 * est arrivée ici sous forme d'un intervalle réel, pas d'une date
 * nue. C'est le travail de l'adaptateur, précisément parce que c'est
 * là que se glissent les erreurs de fuseau et de borne exclusive.
 */
export type ExternalEvent = {
  /** Identifiant chez le fournisseur. Stable entre deux lectures. */
  externalId: string;
  title: string;
  description?: string;
  location?: string;
  /** ISO 8601. */
  startAt: string;
  endAt: string;
  allDay: boolean;
  /**
   * L'événement mobilise-t-il la personne ? Un « Disponible » chez le
   * fournisseur, ou un marqueur de journée entière, vaut `false` : il
   * s'affiche, mais ne rend personne indisponible.
   */
  busy: boolean;
};

/**
 * Ce qui a changé depuis le curseur — ou tout, s'il n'y en avait pas.
 *
 * `removed` porte des identifiants et non des événements : un
 * événement supprimé chez le fournisseur revient sans titre ni dates,
 * et prétendre le contraire ferait écrire des `null` dans la base.
 */
export type ChangeSet = {
  changed: ExternalEvent[];
  removed: string[];
  /**
   * Curseur à conserver pour la prochaine lecture. `null` quand le
   * fournisseur n'en a pas rendu — on repartira alors d'une lecture
   * complète, ce qui est correct, seulement plus coûteux.
   */
  cursor: SyncCursor | null;
};

/**
 * Le curseur a été refusé par le fournisseur : trop vieux, ou
 * invalidé par un changement de droits. Tout ce qu'on croyait savoir
 * est caduc, il faut relire la fenêtre entière.
 *
 * C'est une **exception** et non un drapeau dans `ChangeSet`, pour une
 * raison précise : un drapeau s'oublie en silence, et une
 * synchronisation qui s'arrête sans erreur visible est la pire panne
 * possible — l'agenda affiche des données figées et personne ne le
 * remarque avant plusieurs jours.
 */
export class CursorExpiredError extends Error {
  constructor(readonly provider: string) {
    super(`Le curseur de synchronisation ${provider} a expiré.`);
    this.name = "CursorExpiredError";
  }
}

/**
 * Le jeton est mort et aucun rafraîchissement ne le ranimera :
 * accès révoqué depuis le compte du fournisseur, mot de passe changé,
 * consentement retiré. Seule une reconnexion humaine s'en sort.
 */
export class ReauthRequiredError extends Error {
  constructor(
    readonly provider: string,
    readonly reason: string,
  ) {
    super(`La connexion ${provider} doit être refaite : ${reason}`);
    this.name = "ReauthRequiredError";
  }
}

/**
 * Le fournisseur a refusé le **jeu de paramètres** envoyé avec le
 * curseur.
 *
 * Ce n'est pas une panne : c'est un bug de l'adaptateur. Google, par
 * exemple, répond 400 dès qu'une lecture incrémentale porte
 * `timeMin`, `timeMax`, `orderBy`, `q` ou `updatedMin`. Le nommer
 * évite qu'il se déguise en incident passager et soit réessayé
 * indéfiniment.
 */
export class CursorNotSupportedError extends Error {
  constructor(
    readonly provider: string,
    readonly detail: string,
  ) {
    super(`${provider} a refusé les paramètres de lecture incrémentale : ${detail}`);
    this.name = "CursorNotSupportedError";
  }
}

/**
 * Le fournisseur a refusé le jeton d'accès (401).
 *
 * Distinct de `ReauthRequiredError` : ici, un rafraîchissement peut
 * très bien suffire. On ne connaît pas la durée de vie exacte d'un
 * jeton reçu au retour du consentement, donc cette erreur est une
 * issue normale et non un incident — l'appelant rafraîchit et
 * réessaie **une** fois. C'est seulement si le rafraîchissement échoue
 * à son tour que la reconnexion devient nécessaire.
 */
export class AccessTokenRejectedError extends Error {
  constructor(readonly provider: string) {
    super(`${provider} a refusé le jeton d'accès.`);
    this.name = "AccessTokenRejectedError";
  }
}

/**
 * L'agenda n'existe plus chez le fournisseur : supprimé, ou plus
 * partagé avec cette personne.
 *
 * Sans ce cas, la connexion resterait à pointer dans le vide et
 * chaque passage du cron journaliserait la même erreur pour toujours.
 * Ici, la bonne réponse est de retirer la connexion.
 */
export class CalendarGoneError extends Error {
  constructor(
    readonly provider: string,
    readonly calendarId: string,
  ) {
    super(`L'agenda ${calendarId} n'existe plus chez ${provider}.`);
    this.name = "CalendarGoneError";
  }
}

/** Échec passager côté fournisseur : quota, panne, réseau. On réessaiera. */
export class ProviderUnavailableError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(`${provider} a répondu ${status} : ${detail}`);
    this.name = "ProviderUnavailableError";
  }
}

/**
 * Ce dont tout adaptateur a besoin, quel que soit le mode de lecture.
 *
 * `timezone` sert aux journées entières, que les fournisseurs
 * expriment en dates nues (« le 3 août ») sans instant : sans fuseau,
 * impossible de dire quand cette journée commence. Il est passé aux
 * deux méthodes, et non retenu quelque part par l'adaptateur : une
 * valeur gardée au niveau module serait partagée entre deux requêtes
 * concurrentes sur la même instance serveur.
 */
export type FetchOptions = {
  timezone: string;
};

/** Ce qu'il faut en plus pour une première lecture. */
export type FetchWindowOptions = FetchOptions & {
  window: Interval;
};

/**
 * Un fournisseur d'agenda externe.
 *
 * Toutes les méthodes reçoivent un jeton d'accès déjà valide :
 * l'adaptateur ne sait pas rafraîchir, ne sait pas où sont rangés les
 * jetons, et n'a pas à le savoir.
 */
export interface CalendarProvider {
  /** Identifiant stocké dans `calendar_connections.provider`. */
  readonly name: string;

  /** Les agendas parmi lesquels la personne choisira. */
  listCalendars(accessToken: string): Promise<ExternalCalendar[]>;

  /**
   * Première lecture : une fenêtre de temps, sans curseur.
   * Le `ChangeSet` rendu contient tout ce qui croise la fenêtre, et le
   * curseur par lequel reprendre ensuite.
   */
  fetchWindow(
    accessToken: string,
    calendarId: string,
    options: FetchWindowOptions,
  ): Promise<ChangeSet>;

  /**
   * Lectures suivantes : « donne-moi ce qui a changé depuis ce
   * marqueur ». Lève `CursorExpiredError` si le marqueur est refusé.
   */
  fetchChanges(
    accessToken: string,
    calendarId: string,
    cursor: SyncCursor,
    options: FetchOptions,
  ): Promise<ChangeSet>;
}
