import "server-only";
import { cleElevenLabs, estRefusDeCle, VoiceUnavailableError } from "@/lib/voice/elevenlabs";

/* ═══════════════════════════════════════════════════════════════
   Entendre — ElevenLabs Speech-to-Text, en direct par HTTP.

   **Le pendant exact de `elevenlabs.ts`, et chez le même prestataire**
   (D39). D1 avait choisi Groq/Whisper « pour économiser un fournisseur
   supplémentaire » ; depuis la phase 8, ElevenLabs est dans le projet
   et c'est Groq qui serait le fournisseur en trop. La voix écoute et
   parle au même endroit, avec **la même clé** — il n'y a pas de
   variable d'environnement nouvelle à régler.

   Ce qui suit ne concerne que la mise en mots. Ce que devient le texte
   ensuite ne regarde pas ce fichier : il part dans le champ de saisie,
   sous les yeux de la personne, et c'est elle qui décide de l'envoyer.
   ═══════════════════════════════════════════════════════════════ */

const ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";

/**
 * Le modèle.
 *
 * **`scribe_v2`, et ce n'est pas un choix ouvert.** `scribe_v1` répond
 * encore, mais son retrait était annoncé pour le 9 juillet 2026 — une
 * date déjà passée. L'écrire en dur reviendrait à programmer une panne
 * à une date que personne ne connaît. Surchargeable par
 * `ELEVENLABS_STT_MODEL`, comme `ELEVENLABS_MODEL` l'est pour la
 * synthèse : le jour où v3 arrive, on n'a pas à redéployer pour l'essayer.
 */
const MODEL = process.env.ELEVENLABS_STT_MODEL ?? "scribe_v2";

/**
 * La langue, forcée.
 *
 * Sans elle, la détection automatique tranche sur trois secondes de son
 * — et se trompe : du bruit bref se fait reconnaître comme du
 * serbo-croate avec une confiance dérisoire, puis se transcrit en
 * charabia **sans lever la moindre erreur**. Une cuisine bruyante suffit
 * à reproduire le cas. Le paramètre est gratuit ; le doute, non.
 */
const LANGUE = "fra";

/**
 * Au-delà, on ne transcrit pas.
 *
 * ElevenLabs facture **à la durée de l'audio**, pas à la longueur du
 * texte rendu. Une minute est très large pour « qui est libre samedi ? »
 * — le plafond n'est pas là contre les gens, mais contre le micro qu'on
 * oublie ouvert. Même raison d'être que `MAX_CHARS` pour la synthèse.
 */
export const MAX_SECONDS = 60;

/** Ce que le navigateur a le droit d'envoyer, et ce qu'il pèse au plus. */
export const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Rien d'audible.
 *
 * **Ce n'est pas une panne, c'est le cas courant** : un micro effleuré,
 * une phrase avalée, un téléphone au fond d'une poche. L'API répond
 * alors `200` avec un texte **vide** — mesuré sur cinquante
 * millisecondes comme sur deux secondes de silence. Un code qui ne
 * regarde que `response.ok` enverrait donc une chaîne vide dans le chat,
 * et Casa AI répondrait sérieusement à rien du tout.
 */
export class NothingHeardError extends Error {}

/**
 * Met en mots ce qui a été dit.
 *
 * **La clé ne quitte jamais le serveur** (§33), et le texte rendu ne
 * repart nulle part d'autre que vers l'appelant : ni base, ni journal.
 * L'enregistrement, lui, n'est stocké nulle part de notre côté — voir
 * la réserve honnête en fin de fichier.
 */
export async function transcribeAudio(audio: Blob): Promise<string> {
  const key = cleElevenLabs();

  const form = new FormData();
  form.append("file", audio, `question${extensionFor(audio.type)}`);
  form.append("model_id", MODEL);
  form.append("language_code", LANGUE);

  /* **Le défaut de ce paramètre est `true`**, et c'est un piège discret :
     activé, il glisse « [pause] », « [rire] », « [sonnerie] » **dans le
     champ `text` lui-même**, au milieu de la phrase. On enverrait alors
     un raclement de gorge à Casa AI comme si c'était une question. */
  form.append("tag_audio_events", "false");

  // On ne lit que le texte : les horodatages par mot sont du poids pour rien.
  form.append("timestamps_granularity", "none");

  const response = await fetch(ENDPOINT, {
    method: "POST",
    /* **Aucun `content-type` ici, et c'est délibéré.** Le poser à la
       main sur un corps `FormData` écrase la frontière (`boundary`) que
       le runtime génère, et l'API répond `422`. `elevenlabs.ts` en pose
       un parce qu'il envoie du JSON ; ce n'est pas le cas ici. */
    headers: { "xi-api-key": key },
    body: form,
  });

  if (!response.ok) {
    /* Le motif, jamais le contenu (§74). Ce qui a été dicté porte
       l'agenda de la maison au même titre que ce qui est lu à voix
       haute — et un journal Vercel se relit longtemps.

       La forme de `detail` change avec le code : un objet sur 400 et
       401, un tableau de validations sur 422. On ne s'y fie donc pas
       pour composer quoi que ce soit — seul le statut décide. */
    const reason = await response.text();
    console.error(
      `[casa-voix] ElevenLabs n'a pas transcrit (${response.status})`,
      reason.slice(0, 200),
    );
    /* Une clé refusée est un défaut de configuration, pas une panne
       passagère : on la nomme, comme une clé absente. Sans ça, l'écran
       dit « réessaie » à quelqu'un qui n'a rien à réessayer. */
    if (estRefusDeCle(response.status, reason)) {
      throw new VoiceUnavailableError(`ELEVENLABS_API_KEY refusée (${response.status})`);
    }
    throw new Error(`elevenlabs-stt ${response.status}`);
  }

  const data = (await response.json()) as { text?: unknown };
  const text = typeof data.text === "string" ? data.text.trim() : "";

  /* `transcription_id` figure dans la réponse et n'est **jamais** lu :
     il désigne l'enregistrement conservé chez ElevenLabs. Le ranger
     « au cas où » serait exactement le geste que la règle interdit. */
  if (!text) throw new NothingHeardError("rien d'audible");

  return text;
}

/**
 * L'extension qui correspond au type réel du blob.
 *
 * **Jamais `.webm` en dur.** Jusqu'à iOS 18.3 inclus, Safari
 * n'enregistre qu'en `audio/mp4` — et c'est *le* navigateur de la
 * maison. Un nom de fichier écrit d'avance marche parfaitement sur le
 * Chrome du poste de développement et ment sur le téléphone de Mamie.
 * Le format est décidé par le navigateur ; on se contente de le suivre.
 */
function extensionFor(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  switch (base) {
    case "audio/mp4":
    case "video/mp4":
      return ".mp4";
    case "audio/mpeg":
      return ".mp3";
    case "audio/ogg":
      return ".ogg";
    case "audio/wav":
    case "audio/x-wav":
      return ".wav";
    case "audio/webm":
    case "video/webm":
      return ".webm";
    default:
      // ElevenLabs sniffe le contenu ; l'extension n'est qu'une aide.
      return ".bin";
  }
}

/* ═══════════════════════════════════════════════════════════════
   La réserve honnête, et elle a été essayée.

   « L'enregistrement est transcrit puis oublié » est vrai **de notre
   côté** : aucune colonne ne le stocke, aucun bucket ne le reçoit,
   aucun journal ne le mentionne, et le blob meurt avec la requête.

   Ça ne va pas plus loin. ElevenLabs conserve l'audio de son côté —
   c'est ce que désigne le `transcription_id` de la réponse. Le mode
   zéro rétention existe (`?enable_logging=false`) et **a été essayé
   contre le vrai compte le 4 août** : il répond

       403 — Only users from the enterprise or trial tier can use ZRM mode.

   Il est donc hors de portée du plan actuel. On l'écrit plutôt que de
   laisser croire à une garantie de bout en bout : la promesse s'arrête
   à la frontière du dépôt, et c'est déjà le cas pour l'agenda, qui
   traverse Anthropic et Groq depuis la phase 7.
   ═══════════════════════════════════════════════════════════════ */
