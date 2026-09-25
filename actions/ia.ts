"use server";

import type { ActionResult } from "@/actions/events";
import { createEvent, deleteEvent, restoreEvent, updateEvent } from "@/actions/events";
import { getCasaContext } from "@/lib/data/casa";
import {
  claimDraft,
  readConsumedDraft,
  recordDraftResult,
  releaseDraft,
  type ActionDraft,
  type DraftEvent,
} from "@/lib/ai/drafts";

/* ═══════════════════════════════════════════════════════════════
   L'exécution d'un aperçu — le seul endroit où Casa AI écrit.

   **Et elle n'écrit rien elle-même** : ce fichier reprend le brouillon
   rangé par le tool et appelle `createEvent()`, la Server Action de la
   phase 2, sous la session de la personne. Trois conséquences, et la
   dernière est celle qui compte :

   - `creator_id` est forcé à l'appelant et `source` à `casa-liva` —
     donc **l'événement créé par l'IA appartient à qui a parlé**, pas à
     Casa AI. C'est la règle des trois propriétaires appliquée
     mécaniquement, sans avoir à s'en souvenir ;
   - la RLS, `refusalFor`, le filtrage des participants sur les membres
     connus et l'envoi des invitations restent au même endroit qu'avant.
     Un second chemin d'écriture serait un second endroit où les
     oublier ;
   - **rien ici ne vient du modèle.** Le brouillon a été validé et
     résolu au moment de sa création ; le navigateur peut en corriger
     le *contenu*, jamais la *cible*.

   Cette dernière nuance est la raison d'être de `CORRIGEABLE`.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Ce que le navigateur a le droit de changer avant de valider.
 *
 * **La liste est fermée, et son absence de clé de ciblage est le
 * garde-fou.** « Corriger » ouvre les champs déjà remplis : c'est du
 * contenu — un titre, une heure, un invité de plus. Rien là-dedans ne
 * désigne *sur quoi* on agit ; ça, c'est le jeton, et lui seul.
 *
 * C'est le miroir exact de la règle de la voix (D36) : la route reçoit
 * un identifiant de message, jamais le texte à prononcer. Ici, le
 * navigateur reçoit le droit de corriger un texte, jamais celui de
 * désigner une cible. `verify:ai` refuse le jour où une clé de ciblage
 * entre dans cette liste.
 */
const CORRIGEABLE = [
  "title",
  "emoji",
  "location",
  "startAt",
  "endAt",
  "participantIds",
  /* Un délai n'est pas une cible : il ne désigne rien, il décrit le
     même événement que les autres champs. Corrigeable, donc — c'est
     l'écran qui le pose, jamais le modèle (D56). */
  "rappelMinutes",
] as const;

export type DraftCorrections = Partial<Pick<DraftEvent, (typeof CORRIGEABLE)[number]>>;

export type ConfirmResult = ActionResult | { ok: false; error: string; deja?: true };

/**
 * Exécute l'aperçu portant ce jeton, une fois et une seule.
 *
 * **Le jeton est consommé avant l'écriture, jamais après.** L'inverse
 * laisserait deux appuis rapides — le geste exact qu'on fait quand la
 * connexion rame — créer deux événements. Un jeton brûlé pour rien est
 * un désagrément ; un double dîner de famille est un incident.
 */
export async function confirmDraft(
  token: string,
  corrections?: DraftCorrections,
): Promise<ConfirmResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  const claim = await claimDraft(token);

  if (claim.status === "inconnu") {
    return { ok: false, error: "Cet aperçu n'existe plus. Redemande à Casa AI." };
  }
  if (claim.status === "perime") {
    return {
      ok: false,
      error: "Cet aperçu a un peu trop attendu. Redemande-le à Casa AI, l'agenda a pu bouger.",
    };
  }
  if (claim.status === "deja") {
    // Recharger la page et rejouer la validation : on dit ce qui s'est
    // passé plutôt que de refuser sèchement, sinon on recommence.
    return { ok: false, error: "C'est déjà fait — l'événement existe.", deja: true };
  }

  const { draft } = claim.draft;

  /* La maison du brouillon est relue et comparée à celle d'aujourd'hui.
     La RLS garantit déjà qu'il nous appartient ; elle ne garantit pas
     qu'on habite encore la même maison qu'au moment de la demande —
     rejoindre une maison, c'est déménager (D18), et un aperçu préparé
     avant le déménagement écrirait chez les anciens. */
  if (claim.draft.familyId !== context.familyId) {
    await releaseDraft(token);
    return { ok: false, error: "Tu as changé de maison depuis. Redemande à Casa AI." };
  }

  /* `voulu` et pas `event` : `verify:ai` refuse tout `event.title` dans
     le périmètre de Casa AI, parce qu'ailleurs c'est le titre brut d'un
     événement en base, celui qui doit passer par `visibleTitle`. Ce
     n'en est pas un — c'est ce que la personne vient de valider.

     **La suppression n'accepte aucune correction** : il n'y a rien à
     corriger dans « supprimer ceci ». Les laisser passer donnerait au
     navigateur un moyen d'influer sur une action dont il ne doit
     désigner ni la cible ni le contenu. */
  const voulu =
    draft.kind === "delete_event"
      ? draft.event
      : { ...draft.event, ...pickCorrections(corrections) };

  const result = await execute(draft, voulu);

  if (!result.ok) {
    /* L'écriture a échoué **avant** d'avoir eu lieu : on rend le jeton,
       sinon une date mal corrigée coûterait tout l'aperçu et il
       faudrait refaire parler le modèle pour rien. */
    await releaseDraft(token);
    return result;
  }

  await recordDraftResult(token, result.id);
  return result;
}

/**
 * Remet en place ce qu'un aperçu vient de supprimer.
 *
 * **`UndoBar` n'est montée que sur les deux grilles, jamais sur `/ia`**
 * — et c'est précisément là que les suppressions vont devenir
 * fréquentes. Le filet doit donc suivre l'action, pas l'écran.
 *
 * Le jeton reste la seule référence : on ne redemande ni au navigateur
 * ni au modèle ce qu'il fallait remettre, on relit le brouillon. Et le
 * propriétaire n'est pas à revérifier — `refusalFor` a dit oui à
 * l'aperçu, puis `deleteEvent` l'a redit avant d'écrire : personne
 * d'autre n'a pu arriver jusqu'ici.
 */
export async function undoDraft(token: string): Promise<ConfirmResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  const draft = await readConsumedDraft(token);
  if (!draft || draft.draft.kind !== "delete_event") {
    return { ok: false, error: "Il n'y a rien à remettre." };
  }
  if (draft.familyId !== context.familyId) {
    return { ok: false, error: "Tu as changé de maison depuis." };
  }

  const remis = draft.draft.event;
  return restoreEvent({
    title: remis.title,
    emoji: remis.emoji,
    location: remis.location,
    startAt: remis.startAt,
    endAt: remis.endAt,
    allDay: remis.allDay,
    source: "casa-liva",
    creatorId: context.me.id,
    // Les réponses d'avant, pas `pending` : quelqu'un qui avait dit
    // « pas dispo » n'a pas changé d'avis parce qu'on a hésité.
    participants: remis.participants ?? remis.participantIds.map((userId) => ({
      userId,
      status: "pending" as const,
    })),
  });
}

/**
 * L'aiguillage, et **le seul endroit où Casa AI écrit**.
 *
 * Chaque branche passe par une Server Action de la phase 2, donc par
 * `refusalFor` — qui refait le contrôle **au moment de l'écriture**, et
 * pas seulement au moment de l'aperçu. Ce n'est pas de la redondance :
 * entre les deux, l'événement a pu changer de main, ou disparaître.
 * `resolveTarget` refuse avant d'afficher pour ne pas promettre ; les
 * Server Actions refusent avant d'écrire pour ne pas mentir.
 */
async function execute(draft: ActionDraft, voulu: DraftEvent): Promise<ActionResult> {
  if (draft.kind === "create_event") {
    return createEvent({
      title: voulu.title,
      emoji: voulu.emoji,
      location: voulu.location,
      startAt: voulu.startAt,
      endAt: voulu.endAt,
      participantIds: voulu.participantIds,
      rappelMinutes: voulu.rappelMinutes,
    });
  }

  if (draft.kind === "modify_event") {
    return updateEvent({
      id: draft.eventId,
      title: voulu.title,
      emoji: voulu.emoji ?? null,
      location: voulu.location ?? null,
      startAt: voulu.startAt,
      endAt: voulu.endAt,
      participantIds: voulu.participantIds,
      rappelMinutes: voulu.rappelMinutes,
    });
  }

  return deleteEvent(draft.eventId);
}

/**
 * Ne garde des corrections que ce qui figure dans la liste fermée.
 *
 * Un `...corrections` direct aurait suffi à faire marcher l'écran, et
 * aurait laissé passer n'importe quelle clé que le navigateur invente —
 * y compris celles qu'un jour on ajouterait au brouillon sans y penser.
 * La liste se relit ; un étalement, non.
 */
function pickCorrections(c: DraftCorrections | undefined): DraftCorrections {
  const kept: DraftCorrections = {};
  if (!c) return kept;

  /* Ce qui n'est pas dans la liste est ignoré **et dit**. Ignorer en
     silence est ce qui rend une faille agréable à exploiter : on
     tâtonne sans jamais laisser de trace. Les noms de clés seulement,
     jamais leur contenu — §74 vaut ici comme ailleurs. */
  const inconnues = Object.keys(c).filter(
    (key) => !(CORRIGEABLE as readonly string[]).includes(key),
  );
  if (inconnues.length > 0) {
    console.warn("[casa-ia] corrections hors liste, ignorées :", inconnues.join(", "));
  }

  // Une clé par ligne, sans boucle : c'est plus long, et c'est ce qui
  // permet à `verify:ai` de vérifier qu'aucune clé de `CORRIGEABLE` n'a
  // été déclarée sans être réellement lue — ni l'inverse.
  if (typeof c.title === "string") kept.title = c.title;
  if (typeof c.emoji === "string") kept.emoji = c.emoji;
  if (typeof c.location === "string") kept.location = c.location;
  if (typeof c.startAt === "string") kept.startAt = c.startAt;
  if (typeof c.endAt === "string") kept.endAt = c.endAt;
  if (c.rappelMinutes === null || typeof c.rappelMinutes === "number") {
    kept.rappelMinutes = c.rappelMinutes;
  }
  if (
    Array.isArray(c.participantIds) &&
    c.participantIds.every((id) => typeof id === "string")
  ) {
    kept.participantIds = c.participantIds;
  }

  return kept;
}
