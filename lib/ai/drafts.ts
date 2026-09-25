import "server-only";
import { createClient } from "@/lib/supabase/server";
import { nowMs } from "@/lib/clock";

/* ═══════════════════════════════════════════════════════════════
   Les brouillons d'action — le rangement de « proposer, pas exécuter ».

   **C'est ce fichier qui rend la décision de la phase vraie** (D41).
   `lib/ai/tools.ts` n'écrit rien en base : il appelle `saveDraft()`,
   qui range un aperçu et rend un jeton. L'écriture, elle, part d'un
   geste humain qui consomme ce jeton — `actions/ia.ts`, et nulle part
   ailleurs.

   Ce n'est pas un découpage esthétique. `runTool` s'exécute **au
   moment où le modèle appelle le tool** : y brancher `createEvent()`
   créerait l'événement avant que personne n'ait rien vu, et D22
   tomberait en une ligne. Le contrôle « `lib/ai/tools.ts` ne contient
   aucun `.insert(` » de `verify:ai` garde exactement cette frontière.

   Tout ici passe par `createClient()`, donc sous la session de la
   personne : un brouillon qui n'est pas le sien n'est pas « refusé »,
   il est **introuvable**. C'est ce qui fait du simple identifiant de
   ligne un jeton, sans second secret à gérer.
   ═══════════════════════════════════════════════════════════════ */

/**
 * L'événement tel qu'il sera écrit, **entièrement résolu**.
 *
 * Des instants ISO et des identifiants d'habitants, jamais « samedi »
 * ni « Papa » : la traduction se fait une seule fois, dans le tool, et
 * c'est elle que la personne relit à l'écran. Garder le texte du modèle
 * et le retraduire à la validation reviendrait à valider une chose et
 * en écrire une autre.
 */
export type DraftEvent = {
  title: string;
  emoji?: string;
  location?: string;
  startAt: string;
  endAt: string;
  /** Une journée entière relue en base doit se réafficher comme telle. */
  allDay?: boolean;
  /**
   * Le délai de rappel, quand l'écran l'a corrigé (D56).
   *
   * Casa AI ne le propose jamais elle-même : ce n'est pas un contenu
   * qu'on dicte, c'est un réglage qu'on tape. Il n'arrive donc ici que
   * par la correction humaine devant l'aperçu — le geste qui,
   * justement, est la vraie barrière (D41).
   */
  rappelMinutes?: number | null;
  participantIds: string[];
  /**
   * Qui vient, **et ce que chacun a répondu** — seulement quand
   * l'événement a été relu en base.
   *
   * Absent sur une création : personne n'a encore rien répondu, et
   * l'aperçu montre qui est convié. Présent sur une suppression, où ce
   * sont précisément ces réponses qu'on s'apprête à effacer.
   *
   * Sans ce champ, l'aperçu de suppression affichait « n'a pas
   * répondu » pour tout le monde — y compris pour quelqu'un qui avait
   * dit « je viens ». Une information d'apparence normale, et fausse ;
   * vu à l'écran sur la Preview, pas en relisant.
   */
  participants?: { userId: string; status: "pending" | "accepted" | "declined" }[];
};

/**
 * Ce qu'un aperçu propose.
 *
 * **`eventId` ne sort jamais du serveur autrement que par ce
 * brouillon.** Le projet interdit délibérément aux identifiants de
 * voyager (« des prénoms, pas des identifiants ») : la cible d'une
 * modification ou d'une suppression vient **du brouillon**, et de nulle
 * part ailleurs. Le navigateur peut corriger un contenu, il ne désigne
 * jamais sur quoi on agit.
 *
 * `candidats` porte ce que la résolution a rencontré. « Supprime le
 * déjeuner de dimanche » dans une maison qui déjeune tous les dimanches
 * n'a pas une réponse, elle en a cinquante-deux — et l'aperçu doit
 * montrer que le serveur a dû **choisir**.
 */
export type ActionDraft =
  | { kind: "create_event"; event: DraftEvent }
  | {
      kind: "modify_event";
      eventId: string;
      /** Ce que ça deviendra. */
      event: DraftEvent;
      /** Ce que c'est aujourd'hui, relu en base — pas ce que le modèle a retenu. */
      avant: DraftEvent;
      candidats: number;
    }
  | { kind: "delete_event"; eventId: string; event: DraftEvent; candidats: number };

export type StoredDraft = {
  token: string;
  familyId: string;
  draft: ActionDraft;
};

/** Ce que la lecture d'un jeton peut donner, et qui ne se confond pas. */
export type DraftClaim =
  | { status: "ready"; draft: StoredDraft }
  /** Introuvable, ou à quelqu'un d'autre — la RLS ne les distingue pas, et c'est voulu. */
  | { status: "inconnu" }
  /** Déjà exécuté. On dit quoi, plutôt que de refuser sèchement. */
  | { status: "deja"; eventId: string | null }
  | { status: "perime" };

/**
 * Range un aperçu et rend son jeton.
 *
 * Le jeton **est** l'identifiant de la ligne : sous RLS, il ne sert à
 * personne d'autre qu'à son propriétaire. C'est la différence avec les
 * jetons d'email (D26), qui vivent dans une table sans policy parce
 * qu'aucune session n'existe derrière un lien reçu par message.
 */
export async function saveDraft({
  draft,
  familyId,
  conversationId,
}: {
  draft: ActionDraft;
  familyId: string;
  conversationId?: string;
}): Promise<string> {
  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  const userId = me.user?.id;
  if (!userId) throw new Error("aucune session");

  const { data, error } = await supabase
    .from("ai_action_drafts")
    .insert({
      user_id: userId,
      family_id: familyId,
      conversation_id: conversationId ?? null,
      tool: draft.kind,
      /* On range **tout** ce que l'aperçu montre : la cible, ce qu'elle
         deviendra, et ce qu'elle était. La validation ne redemandera
         rien au modèle, et ne relira rien que la personne n'ait vu. */
      payload: { ...draft, kind: undefined },
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(`brouillon non rangé : ${error?.message}`);
  return data.id;
}

/**
 * Consomme un jeton, une fois et une seule.
 *
 * **L'arbitrage est fait par Postgres, pas par nous** : le `is(...,
 * null)` est dans le `where` de l'`update`, donc deux taps simultanés
 * ne peuvent pas gagner tous les deux. Un drapeau relu puis écrit
 * aurait laissé passer les deux, et c'est précisément le geste qu'on
 * fait sans y penser quand la connexion rame et qu'on réappuie.
 *
 * Le second `select` ne sert qu'à **dire pourquoi** ça n'a pas marché.
 * Sans lui on répondrait « ça n'a pas marché » à quelqu'un dont
 * l'événement est déjà créé, et il recommencerait.
 */
export async function claimDraft(token: string): Promise<DraftClaim> {
  const supabase = await createClient();
  const now = new Date(nowMs()).toISOString();

  const { data: claimed } = await supabase
    .from("ai_action_drafts")
    .update({ consumed_at: now })
    .eq("id", token)
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("id, family_id, tool, payload")
    .maybeSingle();

  if (claimed) {
    const draft = readPayload(claimed.tool, claimed.payload);
    if (!draft) {
      // Une forme illisible en base ne se croit pas sur parole : on
      // rend le jeton et on refuse, plutôt que d'écrire à moitié.
      await releaseDraft(token);
      return { status: "inconnu" };
    }
    return {
      status: "ready",
      draft: { token: claimed.id, familyId: claimed.family_id, draft },
    };
  }

  const { data: known } = await supabase
    .from("ai_action_drafts")
    .select("consumed_at, expires_at, result_event_id")
    .eq("id", token)
    .maybeSingle();

  if (!known) return { status: "inconnu" };
  if (known.consumed_at) return { status: "deja", eventId: known.result_event_id };
  return { status: "perime" };
}

/**
 * Rend un jeton consommé à son état neuf, quand l'exécution a échoué.
 *
 * L'ordre compte, et il n'est pas symétrique : **on consomme d'abord,
 * on exécute ensuite.** L'inverse — exécuter puis marquer — laisserait
 * deux appuis rapides créer deux événements, ce qui est bien pire
 * qu'un jeton brûlé pour rien. La fenêtre entre l'échec et cette
 * restitution existe ; ce qu'elle produit, c'est un « déjà utilisé »
 * sur un second tap, soit la réponse prudente.
 */
export async function releaseDraft(token: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("ai_action_drafts")
    .update({ consumed_at: null })
    .eq("id", token);
}

/**
 * Un brouillon **déjà exécuté**, relu pour pouvoir défaire.
 *
 * Volontairement distinct de `claimDraft` : celui-ci ne consomme rien
 * et n'accepte que ce qui a déjà servi. Les deux portes ont des
 * conditions opposées, et les mélanger ferait qu'un « Annuler » mal
 * placé pourrait exécuter au lieu de défaire.
 */
export async function readConsumedDraft(token: string): Promise<StoredDraft | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("ai_action_drafts")
    .select("id, family_id, tool, payload, consumed_at")
    .eq("id", token)
    .not("consumed_at", "is", null)
    .maybeSingle();

  if (!data) return null;
  const draft = readPayload(data.tool, data.payload);
  if (!draft) return null;
  return { token: data.id, familyId: data.family_id, draft };
}

/** Ce qui a été créé, pour pouvoir dire « c'est déjà fait » au second appui. */
export async function recordDraftResult(
  token: string,
  eventId: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("ai_action_drafts")
    .update({ result_event_id: eventId })
    .eq("id", token);
}

/**
 * Relit un `payload` jsonb et refuse ce qui n'a pas la bonne forme.
 *
 * Postgres ne garantit rien de la structure d'un `jsonb` : ce qu'on a
 * rangé hier n'est pas forcément ce que le code d'aujourd'hui attend.
 * Un aperçu à moitié lisible ne s'exécute pas — on ne devine pas
 * l'heure manquante d'un événement qu'on s'apprête à créer.
 */
function readPayload(tool: string, payload: unknown): ActionDraft | null {
  const brut = payload as Record<string, unknown> | null;
  const event = readEvent(brut?.event);
  if (!event) return null;

  if (tool === "create_event") return { kind: "create_event", event };

  /* La cible est relue **depuis la ligne**, jamais depuis l'appel. Un
     `eventId` absent ou mal formé fait échouer l'aperçu plutôt que de
     laisser deviner sur quoi on allait agir. */
  const eventId = typeof brut?.eventId === "string" ? brut.eventId : null;
  if (!eventId) return null;
  const candidats = typeof brut?.candidats === "number" ? brut.candidats : 1;

  if (tool === "delete_event") {
    return { kind: "delete_event", eventId, event, candidats };
  }
  if (tool === "modify_event") {
    const avant = readEvent(brut?.avant);
    if (!avant) return null;
    return { kind: "modify_event", eventId, event, avant, candidats };
  }
  return null;
}

function readEvent(value: unknown): DraftEvent | null {
  if (typeof value !== "object" || value === null) return null;

  /* `champs` et pas `e` : `verify:ai` refuse tout `e.title` sous
     `lib/ai/`, et il a raison de ne pas chercher à distinguer. Un
     `e.title` y désigne partout ailleurs le titre **brut** d'un
     événement en base — celui qui doit passer par `visibleTitle`. Un
     nom qui ressemble à l'interdit finit par faire ajouter une
     exception au contrôle, et c'est l'exception qui laisse passer la
     vraie. */
  const champs = value as Record<string, unknown>;
  const requis = ["title", "startAt", "endAt"] as const;
  if (requis.some((k) => typeof champs[k] !== "string" || !(champs[k] as string).trim())) {
    return null;
  }
  if (!Array.isArray(champs.participantIds)) return null;
  if (!champs.participantIds.every((id) => typeof id === "string")) return null;

  return {
    title: champs.title as string,
    emoji: typeof champs.emoji === "string" ? champs.emoji : undefined,
    location: typeof champs.location === "string" ? champs.location : undefined,
    startAt: champs.startAt as string,
    endAt: champs.endAt as string,
    allDay: champs.allDay === true,
    participantIds: champs.participantIds as string[],
    participants: readParticipants(champs.participants),
  };
}

/** Les réponses, quand la ligne en portait — refusées si mal formées. */
function readParticipants(value: unknown): DraftEvent["participants"] {
  if (!Array.isArray(value)) return undefined;
  const kept = value.filter(
    (p): p is { userId: string; status: "pending" | "accepted" | "declined" } =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as { userId?: unknown }).userId === "string" &&
      ["pending", "accepted", "declined"].includes(
        (p as { status?: unknown }).status as string,
      ),
  );
  return kept.length > 0 ? kept : undefined;
}
