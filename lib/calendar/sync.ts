import "server-only";
import type { Interval } from "@/types";
import type { Tables, TablesInsert, VisibilityModeDb } from "@/types/database";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/calendar-providers";
import type { ChangeSet, ExternalEvent } from "@/lib/calendar-providers/types";
import {
  CalendarGoneError,
  CursorExpiredError,
  CursorNotSupportedError,
  ProviderUnavailableError,
  ReauthRequiredError,
} from "@/lib/calendar-providers/types";
import { withGoogleAccessToken } from "@/lib/google/token";
import { nowMs } from "@/lib/clock";
import { CASA_TZ } from "@/lib/date";

/* ═══════════════════════════════════════════════════════════════
   Synchronisation des agendas externes.

   Tout passe par le client admin. Ce n'est pas un raccourci : la
   migration 0004 interdit à `authenticated` d'écrire une ligne portant
   un `connection_id`, précisément pour qu'un événement importé ne
   puisse pas être fabriqué ni modifié depuis le navigateur. Le cron
   n'a d'ailleurs aucune session utilisateur.

   En contrepartie, ce fichier re-filtre lui-même sur `family_id` et
   `user_id` partout : la RLS ne le protège plus.
   ═══════════════════════════════════════════════════════════════ */

const DAY_MS = 24 * 60 * 60_000;

/**
 * Fenêtre synchronisée : un mois derrière, un an devant.
 *
 * Derrière, parce qu'un agenda familial sert aussi à se rappeler ce
 * qu'on a fait. Devant, parce que Google ne développe les occurrences
 * d'un événement récurrent que jusqu'à cette borne — au-delà, elles
 * n'existent tout simplement pas encore.
 */
export const SYNC_PAST_DAYS = 30;
export const SYNC_FUTURE_DAYS = 365;

/**
 * Âge maximal d'une lecture complète.
 *
 * Corollaire de la fenêtre : une lecture incrémentale ne fait jamais
 * avancer l'horizon, puisqu'elle ne rapporte que ce qui a changé. Sans
 * relecture complète régulière, l'agenda se viderait par le fond au
 * bout d'un an, sans erreur et sans que personne ne comprenne
 * pourquoi.
 */
export const FULL_SYNC_MAX_AGE_DAYS = 7;

/**
 * En deçà, ouvrir une page ne redéclenche pas de synchronisation.
 *
 * Deux minutes, pas dix : écrire un rendez-vous dans Google puis
 * basculer sur Casa Liva est le geste le plus naturel du monde, et
 * attendre dix minutes pour le voir donne l'impression que la
 * synchronisation ne marche pas. Le quota Google est à trois ordres de
 * grandeur de ce qu'une famille consomme — la retenue n'y sert à rien.
 */
export const STALE_AFTER_MS = 2 * 60_000;

export type SyncOutcome =
  | { status: "ok"; imported: number; removed: number; full: boolean }
  /** Le jeton est mort : seule une reconnexion humaine s'en sort. */
  | { status: "reauth"; message: string }
  /** L'agenda n'existe plus chez le fournisseur ; la connexion a été retirée. */
  | { status: "gone" }
  | { status: "error"; message: string };

type Connection = Tables<"calendar_connections">;

/** La fenêtre de temps synchronisée, à cet instant. */
function syncWindow(): Interval {
  const now = nowMs();
  return {
    start: now - SYNC_PAST_DAYS * DAY_MS,
    end: now + SYNC_FUTURE_DAYS * DAY_MS,
  };
}

/**
 * Ce qu'on accepte de stocker d'un événement, selon ce que la personne
 * a choisi de montrer (§19).
 *
 * Le réglage s'applique **à l'import**, pas à l'affichage. En mode
 * `availability`, le titre réel n'entre jamais dans la base : on ne
 * peut pas divulguer ce qu'on n'a pas stocké — ni par une requête, ni
 * par une fuite d'`aria-label`, ni par Casa AI.
 */
function applyVisibility(
  event: ExternalEvent,
  mode: VisibilityModeDb,
): Pick<
  TablesInsert<"events">,
  "title" | "description" | "location" | "is_private"
> {
  if (mode === "availability") {
    return {
      title: "Occupé",
      description: null,
      location: null,
      is_private: true,
    };
  }

  if (mode === "titles") {
    return {
      title: event.title,
      description: null,
      location: null,
      is_private: false,
    };
  }

  return {
    title: event.title,
    description: event.description ?? null,
    location: event.location ?? null,
    is_private: false,
  };
}

/** Découpe une liste en tranches — les `in (…)` géants passent mal en URL. */
function chunk<T>(items: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Trace l'échec sur la connexion pour que l'écran des réglages puisse en parler. */
async function recordFailure(
  connectionId: string,
  message: string,
  needsReauth = false,
): Promise<void> {
  const supabase = createAdminClient();
  const stamp = new Date(nowMs()).toISOString();

  await supabase
    .from("calendar_connections")
    .update({
      last_error: message.slice(0, 300),
      last_error_at: stamp,
      // `last_synced_at` marque la dernière TENTATIVE, pas le dernier
      // succès. Sans ça, une connexion en panne restait éternellement
      // « périmée » et `syncIfStale` rappelait Google à chaque
      // ouverture de page — un pilonnage silencieux pendant une panne,
      // exactement le moment où il ne faut pas insister.
      last_synced_at: stamp,
      ...(needsReauth ? { needs_reauth: true } : {}),
    })
    .eq("id", connectionId);
}

/**
 * Synchronise un agenda connecté.
 *
 * Ne lève jamais : tout échec devient un `SyncOutcome`, parce que
 * l'appelant est soit un cron qui doit continuer avec les connexions
 * suivantes, soit une page qui ne doit pas tomber parce que Google
 * tousse.
 */
export async function syncConnection(connection: Connection): Promise<SyncOutcome> {
  const supabase = createAdminClient();

  const provider = getProvider(connection.provider);
  if (!provider) {
    return { status: "error", message: `fournisseur inconnu : ${connection.provider}` };
  }

  const familyId = connection.family_id;
  if (!familyId) {
    return { status: "error", message: "connexion sans maison" };
  }

  // Le fuseau de la personne décide de l'heure à laquelle commence une
  // journée entière.
  const { data: owner } = await supabase
    .from("users")
    .select("timezone")
    .eq("id", connection.user_id)
    .maybeSingle();
  const timezone = owner?.timezone || CASA_TZ;

  const window = syncWindow();

  const fullSyncAge = connection.last_full_sync_at
    ? nowMs() - new Date(connection.last_full_sync_at).getTime()
    : Number.POSITIVE_INFINITY;

  let full =
    !connection.sync_cursor || fullSyncAge > FULL_SYNC_MAX_AGE_DAYS * DAY_MS;

  const readWindow = () =>
    withGoogleAccessToken(connection.user_id, (token) =>
      provider.fetchWindow(token, connection.external_calendar_id, {
        window,
        timezone,
      }),
    );

  let changes: ChangeSet;

  try {
    changes = full
      ? await readWindow()
      : await withGoogleAccessToken(connection.user_id, (token) =>
          provider.fetchChanges(
            token,
            connection.external_calendar_id,
            connection.sync_cursor!,
            { timezone },
          ),
        );
  } catch (error) {
    if (error instanceof CursorExpiredError) {
      /* Le curseur a été invalidé par le serveur — expiration, ou
         changement de partage de l'agenda. Tout ce qu'on croyait
         savoir est caduc : on relit la fenêtre entière.

         Pas de compteur anti-boucle, parce qu'aucune boucle n'est
         possible : `fetchWindow` n'envoie pas de curseur, donc ne
         peut pas en voir un expirer. La garantie est structurelle,
         pas comptable. */
      console.warn(
        `[casa] curseur de synchronisation expiré (${connection.external_calendar_id}) — relecture complète`,
      );
      full = true;
      try {
        changes = await readWindow();
      } catch (retryError) {
        return failure(connection.id, retryError);
      }
    } else {
      return failure(connection.id, error);
    }
  }

  /* ── Ce qui entre, ce qui sort ──────────────────────────────────
     Google ne documente pas si un curseur retient la fenêtre de la
     lecture initiale. On re-filtre donc nous-mêmes : ce qui tombe
     hors fenêtre n'a rien à faire en base, et doit en sortir s'il y
     était. Défensif, et sans coût. */
  const kept: ExternalEvent[] = [];
  const removed = new Set(changes.removed);

  for (const event of changes.changed) {
    const start = new Date(event.startAt).getTime();
    const end = new Date(event.endAt).getTime();
    const overlapsWindow = end > window.start && start < window.end;
    if (overlapsWindow) kept.push(event);
    else removed.add(event.externalId);
  }

  /* ── Le réglage a-t-il bougé pendant qu'on lisait ? ─────────────
     Une lecture complète prend plusieurs secondes. Si quelqu'un
     resserre sa confidentialité pendant ce temps, ce qu'on tient en
     mémoire porte encore l'ancien mode — et l'écrire réinstallerait
     les vrais titres par-dessus les « Occupé » qui viennent d'être
     posés. L'écran afficherait « Seulement mes disponibilités »
     pendant que la maison lit « Rendez-vous cardiologue ».

     On relit donc juste avant d'écrire, et on abandonne si le
     compteur a bougé : la synchronisation déclenchée par ce
     changement fait autorité, pas la nôtre. */
  const { data: fresh } = await supabase
    .from("calendar_connections")
    .select("visibility_mode, sync_generation")
    .eq("id", connection.id)
    .maybeSingle();

  if (!fresh) return { status: "gone" };

  if (fresh.sync_generation !== connection.sync_generation) {
    console.warn(
      `[casa] réglages modifiés pendant la synchronisation (${connection.external_calendar_id}) — lecture abandonnée`,
    );
    return { status: "ok", imported: 0, removed: 0, full };
  }

  const rows: TablesInsert<"events">[] = kept.map((event) => ({
    family_id: familyId,
    creator_id: connection.user_id,
    connection_id: connection.id,
    source: "google" as const,
    external_event_id: event.externalId,
    start_at: event.startAt,
    end_at: event.endAt,
    all_day: event.allDay,
    busy: event.busy,
    ...applyVisibility(event, fresh.visibility_mode),
  }));

  const savedIds: string[] = [];

  for (const batch of chunk(rows)) {
    const { data, error } = await supabase
      .from("events")
      .upsert(batch, { onConflict: "connection_id,external_event_id" })
      .select("id");

    if (error) {
      await recordFailure(connection.id, error.message);
      return { status: "error", message: error.message };
    }
    savedIds.push(...(data ?? []).map((r) => r.id));
  }

  /* Une ligne de participation, sinon rien n'existe.

     Le filtrage des vues et le calcul des disponibilités reposent tous
     deux sur `event_participants` : sans ligne, l'événement est
     invisible ET n'occupe personne. On afficherait « ✨ tout le monde
     est libre » par-dessus un vrai rendez-vous — exactement le
     contraire de ce que le produit promet.

     `accepted`, et pas le défaut `pending` : un rendez-vous qu'on a
     déjà dans son agenda Google n'est pas une invitation en attente,
     et l'UI dessinerait une bordure pointillée trompeuse. */
  for (const batch of chunk(savedIds)) {
    const { error } = await supabase.from("event_participants").upsert(
      batch.map((eventId) => ({
        event_id: eventId,
        user_id: connection.user_id,
        status: "accepted" as const,
      })),
      { onConflict: "event_id,user_id", ignoreDuplicates: true },
    );

    if (error) {
      await recordFailure(connection.id, error.message);
      return { status: "error", message: error.message };
    }
  }

  // Les suppressions annoncées par le fournisseur.
  let removedCount = 0;
  for (const batch of chunk([...removed])) {
    const { data, error } = await supabase
      .from("events")
      .delete()
      .eq("connection_id", connection.id)
      .in("external_event_id", batch)
      .select("id");

    if (!error) removedCount += data?.length ?? 0;
  }

  /* ── Réconciliation, uniquement après une lecture complète ──────
     Une lecture complète est une photographie : ce qu'elle ne montre
     pas dans la fenêtre n'existe plus. C'est le seul moyen de
     rattraper les suppressions survenues pendant que le curseur était
     invalide — elles ne sont annoncées nulle part.

     Sûr parce que l'adaptateur lève une erreur plutôt que de tronquer
     une pagination : on ne réconcilie jamais sur une lecture partielle,
     ce qui effacerait un agenda entier. */
  if (full) {
    const keepIds = new Set(kept.map((e) => e.externalId));

    const { data: existing } = await supabase
      .from("events")
      .select("id, external_event_id")
      .eq("connection_id", connection.id)
      .lt("start_at", new Date(window.end).toISOString())
      .gt("end_at", new Date(window.start).toISOString());

    const stale = (existing ?? [])
      .filter((row) => !row.external_event_id || !keepIds.has(row.external_event_id))
      .map((row) => row.id);

    for (const batch of chunk(stale)) {
      const { data } = await supabase
        .from("events")
        .delete()
        .in("id", batch)
        .select("id");
      removedCount += data?.length ?? 0;
    }
  }

  /* Le curseur ne s'enregistre qu'ici, une fois toute la pagination
     consommée et tous les événements écrits. L'enregistrer plus tôt
     ferait sauter définitivement les changements non encore lus si
     l'exécution s'arrêtait au milieu. */
  /* Dernière vérification, après écriture.

     Le contrôle d'avant rétrécit la fenêtre ; il ne la ferme pas. Si
     le réglage a changé pendant nos écritures, ce qu'on vient de poser
     est périmé — et potentiellement plus bavard que ce que la personne
     a demandé. On retire ce qu'on a écrit et on laisse la
     synchronisation déclenchée par le changement faire son travail.

     Mieux vaut un agenda momentanément vide qu'un titre qui n'aurait
     pas dû sortir. */
  const { data: after } = await supabase
    .from("calendar_connections")
    .select("sync_generation")
    .eq("id", connection.id)
    .maybeSingle();

  if (after && after.sync_generation !== connection.sync_generation) {
    console.warn(
      `[casa] réglages modifiés pendant l'écriture (${connection.external_calendar_id}) — annulation`,
    );
    for (const batch of chunk(savedIds)) {
      await supabase.from("events").delete().in("id", batch);
    }
    return { status: "ok", imported: 0, removed: removedCount, full };
  }

  const stamp = new Date(nowMs()).toISOString();

  await supabase
    .from("calendar_connections")
    .update({
      sync_cursor: changes.cursor ?? null,
      last_synced_at: stamp,
      ...(full ? { last_full_sync_at: stamp } : {}),
      needs_reauth: false,
      last_error: null,
      last_error_at: null,
    })
    .eq("id", connection.id);

  return { status: "ok", imported: rows.length, removed: removedCount, full };
}

/** Traduit une exception en état persistant + résultat. */
async function failure(connectionId: string, error: unknown): Promise<SyncOutcome> {
  const supabase = createAdminClient();

  if (error instanceof ReauthRequiredError) {
    await recordFailure(connectionId, error.reason, true);
    return { status: "reauth", message: error.reason };
  }

  if (error instanceof CalendarGoneError) {
    /* L'agenda ne répond plus chez le fournisseur.
       On **ne supprime pas** la connexion.

       Supprimer emporterait ses événements par cascade — des centaines
       de rendez-vous effacés pour toute la maison, sans confirmation,
       sans annulation, et sans même une ligne de journal. Or un 404
       peut être passager : un partage retiré puis rendu, un incident
       Google, un identifiant momentanément non résolu. Une seule
       requête malheureuse détruisait des données irrécupérables, ce
       qui contredit frontalement la règle « toujours un Annuler »
       (AGENTS.md).

       On marque donc la connexion comme demandant un humain. Elle
       sort du cron, l'écran des réglages l'explique, et la personne
       décide — reconnecter, ou retirer l'agenda elle-même. */
    await recordFailure(
      connectionId,
      "Cet agenda ne répond plus chez Google — il a peut-être été supprimé ou n'est plus partagé.",
      true,
    );
    return { status: "gone" };
  }

  if (error instanceof CursorNotSupportedError) {
    // Bug de l'adaptateur, pas panne du fournisseur. On efface le
    // curseur pour repartir proprement, et on le dit fort : réessayer
    // en boucle ne réparerait rien.
    console.error("[casa] paramètres de synchronisation refusés", error.detail);
    await supabase
      .from("calendar_connections")
      .update({ sync_cursor: null })
      .eq("id", connectionId);
    await recordFailure(connectionId, error.message);
    return { status: "error", message: error.message };
  }

  const message =
    error instanceof ProviderUnavailableError
      ? error.message
      : error instanceof Error
        ? error.message
        : "échec inconnu";

  await recordFailure(connectionId, message);
  return { status: "error", message };
}

/** Toutes les connexions d'une personne. */
export async function syncUser(userId: string): Promise<SyncOutcome[]> {
  const supabase = createAdminClient();

  const { data: connections } = await supabase
    .from("calendar_connections")
    .select("*")
    .eq("user_id", userId);

  const outcomes: SyncOutcome[] = [];
  for (const connection of connections ?? []) {
    outcomes.push(await syncConnection(connection));
  }
  return outcomes;
}
