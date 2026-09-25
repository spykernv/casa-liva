import { TZDate } from "@date-fns/tz";
import type {
  CalendarKind,
  CalendarProvider,
  ChangeSet,
  ExternalCalendar,
  ExternalEvent,
  FetchWindowOptions,
  SyncCursor,
} from "./types";
import {
  AccessTokenRejectedError,
  CalendarGoneError,
  CursorExpiredError,
  CursorNotSupportedError,
  ProviderUnavailableError,
  ReauthRequiredError,
} from "./types";

/* ═══════════════════════════════════════════════════════════════
   Adaptateur Google Calendar.

   Tout ce qui est propre à Google s'arrête à ce fichier : le reste de
   l'application ne voit que les types de `./types`.

   Quatre pièges, tous documentés dans `docs/ETAT.md`, tous traités
   ici et nulle part ailleurs :

   1. Deux jeux de paramètres qu'on ne mélange jamais. Envoyer
      `syncToken` avec `timeMin`, `timeMax`, `q`, `orderBy` ou
      `updatedMin` renvoie un 400. La séparation est structurelle :
      deux fonctions, deux constructeurs de requête distincts.
   2. Un curseur refusé (410) ne s'ignore pas.
   3. `status === "cancelled"` se lit AVANT tout autre champ : un
      événement supprimé ne garantit que son `id`.
   4. `end.date` est exclusif pour les journées entières.
   ═══════════════════════════════════════════════════════════════ */

const PROVIDER = "google";
const API = "https://www.googleapis.com/calendar/v3";

/**
 * Les droits demandés au consentement.
 *
 * `calendar.events` seul **ne permet pas** de lister les agendas :
 * `calendarList.list` n'accepte que les scopes de la famille
 * `calendar*.calendarlist*` et répond 403 sinon. D'où le second
 * scope, le plus étroit qui fasse le travail (et non sensible pour
 * la revue Google).
 *
 * Le choix de `calendar.events` plutôt que `.readonly` est assumé
 * dans DECISIONS.md (D9) : demander l'écriture maintenant évite de
 * faire repasser toute la famille par l'écran de consentement le jour
 * où un événement Casa Liva devra atterrir dans Google.
 */
export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
] as const;

/** Maximum autorisé par `events.list`. Moins de pages, moins d'occasions d'échouer. */
const EVENTS_PAGE_SIZE = 2500;
/** Maximum autorisé par `calendarList.list`. */
const CALENDARS_PAGE_SIZE = 250;

/**
 * Garde-fou de pagination.
 *
 * Dépasser ce nombre de pages signifie 250 000 événements sur un seul
 * agenda : ce n'est plus un agenda familial, c'est un bug. On lève
 * une erreur plutôt que de s'arrêter en silence — une lecture
 * tronquée ferait croire au moteur de synchronisation que les
 * événements manquants ont été supprimés, et il les effacerait.
 */
const MAX_PAGES = 100;

/**
 * Types d'événements écartés à la lecture.
 *
 * `workingLocation` (« Au bureau », « À la maison ») et `focusTime`
 * sont des blocs professionnels quotidiens, en journée entière pour le
 * premier. Ils n'aident personne à organiser quoi que ce soit en
 * famille et noieraient les vrais rendez-vous.
 *
 * Tout le reste est conservé, y compris `outOfOffice` (« Papa est
 * absent jeudi » est une information familiale de premier ordre) et
 * `birthday` — les anniversaires importés du carnet d'adresses vivent
 * dans un agenda Google séparé, que l'on coche ou non à la connexion.
 */
const IGNORED_EVENT_TYPES = new Set(["workingLocation", "focusTime"]);

/* ── Formes renvoyées par Google ─────────────────────────────────
   Volontairement partielles et toutes optionnelles : ce sont des
   données extérieures, et rien ne garantit qu'un champ soit là. Elles
   ne sortent jamais de ce fichier.
   ───────────────────────────────────────────────────────────── */

type GoogleDate = {
  /** `2026-08-03` — journée entière. Exclusif côté `end`. */
  date?: string;
  /** RFC3339 avec décalage : `2026-08-03T14:30:00+02:00`. */
  dateTime?: string;
  timeZone?: string;
};

type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: GoogleDate;
  end?: GoogleDate;
  endTimeUnspecified?: boolean;
  transparency?: string;
  eventType?: string;
  attendees?: { self?: boolean; responseStatus?: string }[];
};

type GoogleEventsPage = {
  items?: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

type GoogleCalendarEntry = {
  id?: string;
  summary?: string;
  summaryOverride?: string;
  primary?: boolean;
  deleted?: boolean;
  accessRole?: string;
};

type GoogleCalendarsPage = {
  items?: GoogleCalendarEntry[];
  nextPageToken?: string;
};

type GoogleErrorBody = {
  error?: {
    code?: number;
    message?: string;
    errors?: { domain?: string; reason?: string; message?: string }[];
  };
};

/**
 * Reconnaît les agendas que Google génère lui-même.
 *
 * Leurs identifiants suivent des motifs stables (`…#holiday@…`,
 * `p#weeknum@…`, `addressbook#contacts@…`) — c'est le seul signal
 * fiable, le libellé étant traduit dans la langue du compte.
 *
 * On ne s'en sert que pour informer : rien n'est écarté d'office.
 */
function classify(id: string): CalendarKind {
  if (id.includes("#holiday@")) return "holidays";
  if (id.includes("#weeknum@")) return "weekNumbers";
  if (id.includes("#contacts@")) return "birthdays";
  return "personal";
}

/* ── Appel HTTP ──────────────────────────────────────────────── */

async function callGoogle<T>(
  accessToken: string,
  path: string,
  params: Record<string, string>,
  context: { calendarId?: string; usedCursor?: boolean } = {},
): Promise<T> {
  const url = `${API}${path}?${new URLSearchParams(params).toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch (networkError) {
    throw new ProviderUnavailableError(
      PROVIDER,
      0,
      networkError instanceof Error ? networkError.message : "réseau injoignable",
    );
  }

  if (response.ok) return (await response.json()) as T;

  const raw = await response.text();
  let body: GoogleErrorBody | null = null;
  try {
    body = JSON.parse(raw) as GoogleErrorBody;
  } catch {
    // Google répond parfois du HTML sur les pannes d'infrastructure.
  }

  const reason = body?.error?.errors?.[0]?.reason ?? "";
  const message = body?.error?.message ?? raw.slice(0, 200);

  // 401 — le jeton est refusé. L'appelant rafraîchira et rejouera.
  if (response.status === 401) throw new AccessTokenRejectedError(PROVIDER);

  // 410 — le curseur est périmé. On teste la raison, mais on se rabat
  // sur le code seul : Google migre progressivement ses APIs vers un
  // format d'erreur sans tableau `errors`, et rater ce cas figerait la
  // synchronisation pour toujours.
  if (response.status === 410) {
    if (reason === "fullSyncRequired" || context.usedCursor) {
      throw new CursorExpiredError(PROVIDER);
    }
  }

  // 400 avec un curseur = jeu de paramètres illégal. C'est un bug de
  // notre côté, pas une panne : le dire franchement plutôt que de
  // laisser réessayer en boucle.
  if (response.status === 400 && context.usedCursor) {
    throw new CursorNotSupportedError(PROVIDER, message);
  }

  // 403 — deux mondes très différents sous le même code.
  if (response.status === 403) {
    if (/insufficient|scope|forbidden/i.test(`${reason} ${message}`)) {
      throw new ReauthRequiredError(PROVIDER, "droits insuffisants sur l'agenda");
    }
    throw new ProviderUnavailableError(PROVIDER, 403, reason || message);
  }

  // 404 — l'agenda a disparu (supprimé, ou plus partagé).
  if (response.status === 404 && context.calendarId) {
    throw new CalendarGoneError(PROVIDER, context.calendarId);
  }

  throw new ProviderUnavailableError(PROVIDER, response.status, reason || message);
}

/* ── Normalisation ──────────────────────────────────────────── */

/**
 * Minuit d'un jour civil, dans le fuseau donné.
 *
 * Google exprime les journées entières en date nue (`2026-08-03`),
 * sans instant. Passer par `new Date("2026-08-03")` la placerait à
 * minuit **UTC**, soit 2h du matin à Paris : la journée entière
 * commencerait la veille à 22h pour la moitié de l'année.
 */
function civilMidnight(date: string, timezone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(new TZDate(year, month - 1, day, timezone).getTime());
}

/** L'événement occupe-t-il réellement la personne ? */
function isBusy(event: GoogleEvent, allDay: boolean): boolean {
  // « Disponible » chez Google : l'événement existe, il ne bloque rien.
  if (event.transparency === "transparent") return false;

  // Une journée entière marque un contexte (vacances, anniversaire,
  // jour férié), pas un créneau pris. La compter comme occupée
  // supprimerait les moments « tout le monde est libre » précisément
  // les jours où la famille l'est le plus.
  if (allDay) return false;

  return true;
}

/**
 * Un événement Google → un événement Casa Liva, ou `null` s'il n'a
 * rien à faire dans un agenda familial.
 *
 * **Ne jamais appeler sur un événement `cancelled`** : ses champs ne
 * sont pas garantis. Le tri se fait avant, dans `readPage`.
 */
function normalize(
  event: GoogleEvent,
  timezone: string,
): ExternalEvent | null {
  if (!event.id) return null;
  if (event.eventType && IGNORED_EVENT_TYPES.has(event.eventType)) return null;

  // Refusé par la personne elle-même : ce n'est plus un engagement.
  // `self` désigne le propriétaire de l'agenda synchronisé.
  const mine = event.attendees?.find((a) => a.self);
  if (mine?.responseStatus === "declined") return null;

  const start = event.start;
  const end = event.end;
  if (!start || !end) return null;

  const allDay = Boolean(start.date);

  let startAt: Date;
  let endAt: Date;

  if (allDay) {
    if (!start.date || !end.date) return null;
    startAt = civilMidnight(start.date, timezone);
    // `end.date` est EXCLUSIF : un événement du 3 août revient avec
    // `end.date = 2026-08-04`. Minuit du 4 est donc déjà la bonne
    // borne de fin — c'est l'afficher tel quel comme un jour de plus
    // qui serait faux.
    endAt = civilMidnight(end.date, timezone);
  } else {
    if (!start.dateTime || !end.dateTime) return null;
    startAt = new Date(start.dateTime);
    endAt = new Date(end.dateTime);
  }

  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) return null;

  // Google accepte des événements de durée nulle, et `endTimeUnspecified`
  // signale une fin inconnue. La base impose `end_at > start_at`, et un
  // point sans épaisseur serait de toute façon intapable : on lui donne
  // le quart d'heure sur lequel toute l'app est déjà calée.
  if (endAt.getTime() <= startAt.getTime()) {
    endAt = new Date(startAt.getTime() + 15 * 60_000);
  }

  return {
    externalId: event.id,
    title: event.summary?.trim() || "Sans titre",
    description: event.description?.trim() || undefined,
    location: event.location?.trim() || undefined,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    allDay,
    busy: isBusy(event, allDay),
  };
}

/**
 * Parcourt toutes les pages d'une lecture et agrège le résultat.
 *
 * Le curseur n'est rendu que sur la **dernière** page : une réponse
 * porte soit `nextPageToken`, soit `nextSyncToken`, jamais les deux.
 * Le moteur de synchronisation ne doit donc l'enregistrer qu'une fois
 * la pagination entièrement consommée — sinon une panne en cours de
 * route ferait sauter définitivement les changements non lus.
 */
async function readPages(
  accessToken: string,
  calendarId: string,
  baseParams: Record<string, string>,
  timezone: string,
  usedCursor: boolean,
): Promise<ChangeSet> {
  const path = `/calendars/${encodeURIComponent(calendarId)}/events`;

  const changed: ExternalEvent[] = [];
  const removed: string[] = [];
  let cursor: SyncCursor | null = null;
  let pageToken: string | undefined;
  let pages = 0;

  do {
    if (++pages > MAX_PAGES) {
      throw new ProviderUnavailableError(
        PROVIDER,
        0,
        `plus de ${MAX_PAGES} pages sur l'agenda ${calendarId} — lecture interrompue`,
      );
    }

    const page: GoogleEventsPage = await callGoogle<GoogleEventsPage>(
      accessToken,
      path,
      pageToken ? { ...baseParams, pageToken } : baseParams,
      { calendarId, usedCursor },
    );

    for (const item of page.items ?? []) {
      // ── Le statut se lit EN PREMIER ──────────────────────────
      // Un événement supprimé ne garantit que son `id` : ni titre, ni
      // début, ni fin. Lire `item.start.dateTime` avant ce test ferait
      // planter la synchronisation, et un upsert naïf écraserait la
      // ligne locale avec des valeurs vides.
      if (item.status === "cancelled") {
        if (item.id) removed.push(item.id);
        continue;
      }

      const normalized = normalize(item, timezone);
      if (normalized) changed.push(normalized);
      else if (item.id) {
        // Écarté par nos règles (refusé, type ignoré…). S'il était déjà
        // en base — parce qu'il a changé depuis —, il doit en sortir.
        removed.push(item.id);
      }
    }

    pageToken = page.nextPageToken;
    if (page.nextSyncToken) cursor = page.nextSyncToken;
  } while (pageToken);

  return { changed, removed, cursor };
}

/* ── Le fournisseur ─────────────────────────────────────────── */

export const googleCalendarProvider: CalendarProvider = {
  name: PROVIDER,

  async listCalendars(accessToken) {
    const calendars: ExternalCalendar[] = [];
    let pageToken: string | undefined;
    let pages = 0;

    do {
      if (++pages > MAX_PAGES) break;

      const page: GoogleCalendarsPage = await callGoogle<GoogleCalendarsPage>(
        accessToken,
        "/users/me/calendarList",
        {
          maxResults: String(CALENDARS_PAGE_SIZE),
          // Inutile de proposer un agenda dont on ne pourra pas lire
          // les événements.
          minAccessRole: "reader",
          ...(pageToken ? { pageToken } : {}),
        },
      );

      for (const item of page.items ?? []) {
        if (!item.id || item.deleted) continue;
        calendars.push({
          id: item.id,
          // `summaryOverride` est le renommage local ; `summary` vaut
          // l'adresse email sur l'agenda principal, ce qui ferait un
          // libellé peu chaleureux à l'écran.
          name: item.summaryOverride?.trim() || item.summary?.trim() || "Sans nom",
          primary: item.primary === true,
          kind: classify(item.id),
        });
      }

      pageToken = page.nextPageToken;
    } while (pageToken);

    return calendars;
  },

  async fetchWindow(accessToken, calendarId, options: FetchWindowOptions) {
    return readPages(
      accessToken,
      calendarId,
      {
        // Développe les récurrences en occurrences individuelles.
        // Sans lui, Google renvoie la règle brute et il faudrait
        // écrire un moteur de récurrence iCalendar.
        singleEvents: "true",
        // `true` dans les DEUX modes : une synchronisation
        // incrémentale renvoie de toute façon les suppressions, et
        // Google exige que les paramètres soient identiques entre la
        // lecture initiale et les suivantes.
        showDeleted: "true",
        maxResults: String(EVENTS_PAGE_SIZE),
        // `timeMin` filtre sur la FIN, `timeMax` sur le DÉBUT : la
        // fenêtre attrape donc tout ce qui la chevauche, y compris un
        // événement commencé avant elle. C'est ce qu'on veut.
        timeMin: new Date(options.window.start).toISOString(),
        timeMax: new Date(options.window.end).toISOString(),
        // Pas d'`orderBy` : il est interdit avec un curseur, et une
        // lecture initiale qui trie autrement que les suivantes est
        // une source d'écart inutile. Le tri se fait en base.
      },
      options.timezone,
      false,
    );
  },

  async fetchChanges(accessToken, calendarId, cursor, options) {
    return readPages(
      accessToken,
      calendarId,
      {
        // Rigoureusement les mêmes paramètres que ci-dessus, moins la
        // fenêtre. `timeMin`, `timeMax`, `orderBy`, `q`, `updatedMin`,
        // `iCalUID` et les propriétés étendues sont refusés avec un
        // curseur — la réponse serait un 400.
        singleEvents: "true",
        showDeleted: "true",
        maxResults: String(EVENTS_PAGE_SIZE),
        syncToken: cursor,
      },
      options.timezone,
      true,
    );
  },
};
