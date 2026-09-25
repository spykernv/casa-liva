import "server-only";
import { createHash } from "node:crypto";
import { generateSpeech, MAX_CHARS } from "@/lib/voice/elevenlabs";
import { PREVIEW_TEXT, isKnownVoice } from "@/lib/voice/voices";
import {
  gatherBriefing,
  writeBriefing,
  type BriefingAudience,
  type BriefingScope,
} from "@/lib/voice/briefing";
import { createClient } from "@/lib/supabase/server";
import { getCasaContext, getUserId, myVoice } from "@/lib/data/casa";

/* ═══════════════════════════════════════════════════════════════
   « Écouter » — du texte au fichier, et le cache entre les deux.

   Tout ici passe par `createClient()`, donc sous la session de la
   personne : la table `audio_generations` (policy `audio_all_self`) et
   le bucket `casa-audio` (migration 0012) refusent tout le reste. Un
   client d'administration n'a rien à faire dans ce fichier, pour la
   même raison que dans `lib/ai/` — c'est la seule garantie qui ne
   dépend pas de la relecture d'un prompt.

   **Le texte lu n'est jamais celui que le navigateur envoie.** Les
   trois portes d'entrée reçoivent *de quoi il s'agit*, jamais *ce qu'il
   faut dire* :

   - `speakMessage` reçoit l'identifiant d'un message et relit son
     contenu en base ;
   - `previewVoice` reçoit une voix, et dit une phrase écrite dans
     `lib/voice/voices.ts` ;
   - `speakBriefing` reçoit `aujourdhui` ou `semaine`, et va chercher
     lui-même les événements.

   Deux raisons, et la seconde est la vraie :

   1. Sans ça, n'importe qui pourrait faire lire n'importe quoi et
      brûler le quota du compte.
   2. Un texte fabriqué ici est un texte **déjà passé par le masquage** —
      celui de `lib/ai/tools.ts` pour une réponse de chat, celui de
      `lib/voice/briefing.ts` pour un briefing. Faire confiance au
      navigateur reviendrait à rouvrir, par la porte de la voix, ce que
      JON-50 a fermé.
   ═══════════════════════════════════════════════════════════════ */

const BUCKET = "casa-audio";

/**
 * Durée de vie d'une URL signée.
 *
 * Une heure : assez pour qu'on puisse laisser la page ouverte et
 * appuyer sur lecture plus tard, assez court pour qu'un lien copié par
 * mégarde ne serve pas éternellement. Le fichier, lui, reste — c'est
 * l'accès qui expire, pas le cache.
 */
const SIGNED_FOR = 60 * 60;

export type SpokenAudio = {
  url: string;
  /** Vrai quand rien n'a été regénéré — c'est ce qui prouve que le cache sert. */
  cached: boolean;
};

export class TooLongError extends Error {}
export class NotSpeakableError extends Error {}

/**
 * L'empreinte de **ce dont il est question, et de la voix qui le dit**.
 *
 * **La voix en fait partie, et ce n'est pas un détail.** L'aperçu de
 * `/moi` dit exactement la même phrase pour les quatre voix : si la
 * clé n'en portait que le texte, le deuxième aperçu rejouerait l'audio
 * du premier — et on choisirait une voix en en écoutant une autre.
 * Une réponse d'apparence parfaitement normale, et fausse.
 *
 * Le corollaire vaut pour tout le reste : changer de voix ne rejoue
 * pas l'ancienne sur les nouvelles réponses.
 */
function fingerprint(voiceId: string, about: string): string {
  return createHash("sha256").update(`${voiceId}\n${about}`, "utf8").digest("hex");
}

/**
 * Lit à voix haute la réponse de Casa AI portant cet identifiant.
 *
 * **L'empreinte porte le texte et la voix, pas le message**, et c'est
 * ce qui rend la fraîcheur structurelle : un agenda qui change produit
 * une réponse différente, donc une empreinte différente, donc un nouvel
 * audio. Hacher l'identifiant du message aurait été plus simple et
 * aurait rejoué l'agenda de la veille pour toujours.
 *
 * La voix est celle de la personne qui écoute (JON-59), pas celle de
 * qui a posé la question — c'est la même ici, mais ça cessera de
 * l'être le jour où un briefing se partagera.
 */
export async function speakMessage(messageId: string): Promise<SpokenAudio> {
  const userId = await getUserId();
  if (!userId) throw new NotSpeakableError("personne n'est connecté");

  const supabase = await createClient();

  /* La RLS fait le tri : un message qui n'est pas dans une conversation
     de l'appelant n'est pas « refusé », il est introuvable. C'est le
     bon échec — il n'y a rien à déduire d'une absence. */
  const { data: message } = await supabase
    .from("ai_messages")
    .select("content, role")
    .eq("id", messageId)
    .maybeSingle();

  if (!message) throw new NotSpeakableError("message introuvable");

  // On ne relit pas à quelqu'un sa propre question : il vient de
  // l'écrire, et l'entendre n'apprend rien.
  if (message.role !== "assistant") {
    throw new NotSpeakableError("seules les réponses de Casa AI se lisent");
  }

  const text = message.content.trim();

  /* Ici, ce dont il est question **est** le texte : deux réponses
     identiques de Casa AI sont le même audio. C'est le cas simple, et
     c'était le seul jusqu'au briefing. */
  return render({
    about: text,
    say: async () => text,
    voiceId: await myVoice(),
    userId,
  });
}

/**
 * Lit à voix haute le briefing du jour ou de la semaine (JON-56).
 *
 * **La route ne reçoit jamais le texte, ni même une phrase : elle
 * reçoit ce sur quoi porte la lecture** (`aujourdhui` / `semaine`, et le
 * jour visé). Le serveur va chercher les événements, les masque, les
 * fait mettre en phrases, puis les dit. Une route qui aurait pris le
 * texte du navigateur aurait rouvert par la voix tout ce que le masquage
 * ferme à l'écrit — c'est l'interdit de D36, et c'est ici qu'il devient
 * facile à enfreindre, puisqu'aucun message n'existe en base.
 *
 * **Le cache s'indexe sur les faits, pas sur la prose.** Un modèle ne
 * réécrit jamais deux fois la même phrase : une clé posée sur le texte
 * dit n'aurait jamais rejoué un briefing, et chaque écoute aurait payé
 * ElevenLabs. Sur les faits, elle ne bouge que quand l'agenda bouge —
 * la fraîcheur vient du contenu, jamais d'un horodatage (D36, D37).
 */
export async function speakBriefing(
  scope: BriefingScope,
  day: number,
  now: number,
  audience: BriefingAudience = "maison",
): Promise<SpokenAudio> {
  const userId = await getUserId();
  if (!userId) throw new NotSpeakableError("personne n'est connecté");

  const context = await getCasaContext();
  if (!context) throw new NotSpeakableError("aucune maison");

  const briefing = await gatherBriefing({
    scope,
    audience,
    listenerId: context.me.id,
    familyId: context.familyId,
    members: context.members,
    day,
    now,
  });

  return render({
    about: briefing.about,
    // Appelé **seulement** si le cache n'a rien : la deuxième écoute du
    // même agenda ne coûte ni modèle, ni synthèse.
    say: () =>
      writeBriefing({ briefing, listener: context.me, members: context.members }),
    voiceId: await myVoice(),
    userId,
  });
}

/**
 * Fait dire à une voix la phrase d'aperçu, pour qu'on l'entende avant
 * de la choisir (JON-59).
 *
 * **La voix demandée est validée contre la liste**, et c'est le point
 * qui compte : sans ce filtre, cette route serait un proxy ouvert vers
 * ElevenLabs — n'importe quelle voix du catalogue, autant de fois
 * qu'on veut, sur le quota du compte.
 *
 * Le texte, lui, ne vient pas du navigateur non plus : il est écrit
 * ici. Un aperçu qu'on choisirait ferait dire n'importe quoi à Casa AI.
 */
export async function previewVoice(voiceId: string): Promise<SpokenAudio> {
  const userId = await getUserId();
  if (!userId) throw new NotSpeakableError("personne n'est connecté");
  if (!isKnownVoice(voiceId)) throw new NotSpeakableError("voix inconnue");

  return render({
    about: PREVIEW_TEXT,
    say: async () => PREVIEW_TEXT,
    voiceId,
    userId,
  });
}

type RenderInput = {
  /**
   * **Ce sur quoi porte la lecture** — la clé du cache.
   *
   * Souvent le texte lui-même (une réponse de Casa AI, la phrase
   * d'aperçu). Pour un briefing, c'est la feuille de faits : le texte,
   * lui, est réécrit à chaque fois par un modèle et ne se répète jamais
   * à l'identique. Séparer les deux est ce qui rend le cache utile là où
   * il ne l'aurait pas été — et ça ne change rien à la garantie, puisque
   * ni l'un ni l'autre ne vient du navigateur.
   */
  about: string;
  /** Le texte à dire. **Appelé seulement en cas de manque au cache.** */
  say: () => Promise<string>;
  voiceId: string;
  userId: string;
};

/**
 * Le cœur commun : trouver l'audio, ou le fabriquer.
 *
 * L'aperçu, la lecture d'une réponse et le briefing passent tous par
 * ici, donc profitent du même cache — et de la même isolation, puisque
 * `user_id` entre dans la clé comme dans le chemin du fichier.
 *
 * **Le cache n'est jamais mutualisé entre habitants**, même quand deux
 * personnes de la même maison demandent exactement le même briefing.
 * Deux agendas différents peuvent produire deux textes différents ; rien
 * ne garantit l'inverse, et faire entendre à l'un l'audio fabriqué pour
 * l'autre serait précisément la fuite que le bucket privé empêche.
 */
async function render({
  about,
  say,
  voiceId,
  userId,
}: RenderInput): Promise<SpokenAudio> {
  const supabase = await createClient();

  const hash = fingerprint(voiceId, about);
  const path = `${userId}/${hash}.mp3`;

  /* Le cache. La contrainte `unique (user_id, text_hash)` existe depuis
     la migration 0001 — elle attendait ce code depuis le premier jour. */
  const { data: known } = await supabase
    .from("audio_generations")
    .select("id, audio_url, status")
    .eq("user_id", userId)
    .eq("text_hash", hash)
    .maybeSingle();

  if (known?.status === "ready" && known.audio_url) {
    const signed = await sign(supabase, known.audio_url);
    // Un fichier disparu du bucket ne doit pas rendre la ligne
    // définitivement muette : on retombe sur la génération.
    if (signed) return { url: signed, cached: true };
  }

  /* Le texte n'est fabriqué qu'ici, une fois le cache consulté. Pour un
     briefing, c'est un appel au modèle : le déclencher avant la lecture
     du cache aurait payé la rédaction à chaque écoute, pour finalement
     rejouer le même fichier. */
  const text = await say();
  if (!text.trim()) throw new NotSpeakableError("il n'y a rien à lire");
  if (text.length > MAX_CHARS) {
    throw new TooLongError(`texte trop long (${text.length} > ${MAX_CHARS})`);
  }

  /* La ligne est posée **avant** l'appel, en `pending`. Si ElevenLabs
     tombe au milieu, il reste une trace de ce qu'on essayait de faire
     plutôt qu'un trou — et la reprise réécrit par-dessus.

     `voice_id` est rempli depuis JON-59 : la colonne existait déjà, et
     une ligne qui ne dit pas quelle voix l'a produite rend indébuggable
     le jour où deux habitants trouvent que « ça ne sonne pas pareil ». */
  if (!known) {
    await supabase.from("audio_generations").insert({
      user_id: userId,
      text_hash: hash,
      text,
      provider: "elevenlabs",
      voice_id: voiceId,
      status: "pending",
    });
  } else {
    // Une reprise après échec : le texte a pu être réécrit entre-temps.
    await supabase
      .from("audio_generations")
      .update({ text, voice_id: voiceId })
      .eq("user_id", userId)
      .eq("text_hash", hash);
  }

  let audio: ArrayBuffer;
  try {
    audio = await generateSpeech(text, voiceId);
  } catch (error) {
    await supabase
      .from("audio_generations")
      .update({ status: "failed" })
      .eq("user_id", userId)
      .eq("text_hash", hash);
    throw error;
  }

  const { error: upload } = await supabase.storage
    .from(BUCKET)
    .upload(path, audio, { contentType: "audio/mpeg", upsert: true });

  if (upload) {
    await supabase
      .from("audio_generations")
      .update({ status: "failed" })
      .eq("user_id", userId)
      .eq("text_hash", hash);
    console.error("[casa-voix] dépôt du fichier impossible", upload.message);
    throw new Error("dépôt impossible");
  }

  /* On range le **chemin**, pas l'URL signée : celle-ci expire dans une
     heure, et une colonne qui contient une valeur périmée est pire
     qu'une colonne vide. Le nom `audio_url` vient de la migration
     0001 ; il dit l'intention, pas le format. */
  await supabase
    .from("audio_generations")
    .update({ audio_url: path, status: "ready" })
    .eq("user_id", userId)
    .eq("text_hash", hash);

  const signed = await sign(supabase, path);
  if (!signed) throw new Error("signature impossible");

  return { url: signed, cached: false };
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function sign(supabase: Supabase, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_FOR);

  if (error || !data) {
    console.warn("[casa-voix] fichier introuvable dans le bucket, on regénère");
    return null;
  }
  return data.signedUrl;
}
