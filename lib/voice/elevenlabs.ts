import "server-only";

/* ═══════════════════════════════════════════════════════════════
   La synthèse vocale — ElevenLabs, en direct par HTTP.

   Pas de SDK, comme pour Resend et Groq : un `POST` sur une URL et une
   clé dans un en-tête. Envelopper trente lignes de `fetch` ne vaut pas
   une dépendance de plus à suivre.

   **La clé ne quitte jamais le serveur** (§33). C'est une règle
   d'`AGENTS.md`, et `npm run verify:ai` refuse déjà qu'une variable
   `NEXT_PUBLIC_ELEVENLABS_*` apparaisse où que ce soit dans le dépôt —
   le contrôle existait avant le code qu'il protège.
   ═══════════════════════════════════════════════════════════════ */

const ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";

/**
 * Le modèle. `flash` plutôt que `multilingual` : deux fois moins cher,
 * nettement plus rapide, et la différence de rendu ne s'entend pas sur
 * trois phrases d'agenda. Surchargeable par `ELEVENLABS_MODEL`.
 */
const MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_flash_v2_5";

/**
 * Au-delà, on ne lit pas : on refuse.
 *
 * ElevenLabs facture au caractère. Une réponse de Casa AI en fait
 * trois cents ; un briefing hebdomadaire, mille. Deux mille est donc
 * large — et le plafond n'est pas là contre les gens, mais contre le
 * jour où un appelant enverra une page entière par erreur.
 */
export const MAX_CHARS = 2000;

export class VoiceUnavailableError extends Error {}

/**
 * Le motif quand la valeur ne peut **structurellement pas** être une
 * clé ElevenLabs — `null` si sa forme est plausible.
 *
 * **Ce contrôle ne coûte pas un appel réseau, et c'est tout son
 * intérêt.** Le 5 août, `ELEVENLABS_API_KEY` portait l'*identifiant*
 * d'une clé. Il a fallu trois semaines pour le voir, parce que le seul
 * endroit qui le disait était la réponse d'ElevenLabs, recopiée dans
 * les journaux Vercel — donc invisible tant que personne n'allait les
 * lire. Or un identifiant est reconnaissable **hors ligne** : c'est
 * 32 caractères hexadécimaux ou plus, là où une clé commence par
 * `sk_`.
 *
 * La confusion n'a rien d'une étourderie : le tableau de bord
 * d'ElevenLabs affiche l'identifiant en permanence, et la clé **une
 * seule fois**, à sa création ou à sa rotation. C'est donc l'erreur
 * qu'on refera, et elle mérite d'être nommée plutôt que devinée.
 *
 * On ne valide pas la longueur au-delà de ça : le format d'ElevenLabs
 * peut changer, et un contrôle trop serré refuserait un jour une clé
 * parfaitement valide. Ce qu'on attrape ici, c'est la faute connue.
 */
export function refusDeForme(key: string): string | null {
  if (/^[0-9a-f]{32,}$/i.test(key)) {
    return "ELEVENLABS_API_KEY porte un identifiant de clé, pas la clé — les clés commencent par « sk_ » et ne s'affichent qu'à la création ou à la rotation";
  }
  if (!key.startsWith("sk_")) {
    return "ELEVENLABS_API_KEY ne commence pas par « sk_ » — ce n'est pas une clé ElevenLabs";
  }
  return null;
}

/**
 * La clé, ou une erreur qui dit **laquelle des trois pannes** c'est :
 * absente, mal formée, ou (plus loin, après la réponse d'ElevenLabs)
 * refusée.
 *
 * Les trois sortent en `VoiceUnavailableError`, donc le même 503 et la
 * même phrase à l'écran — « ce n'est pas toi, c'est nous ». La
 * distinction n'est pas pour l'habitant, qui n'y peut rien : elle est
 * pour celui qui exploite l'app et qui, lui, doit savoir où aller.
 */
export function cleElevenLabs(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new VoiceUnavailableError("ELEVENLABS_API_KEY manquante");

  const forme = refusDeForme(key);
  if (forme) throw new VoiceUnavailableError(forme);

  return key;
}

/**
 * ElevenLabs a-t-il refusé **la clé**, plutôt que la demande ?
 *
 * **Pourquoi cette distinction existe, et ce qu'elle a coûté.** Une clé
 * *absente* était déjà nommée à l'écran — c'est la panne la plus
 * probable d'une mise en production. Une clé *présente et refusée*, en
 * revanche, tombait dans le 502 générique « Casa AI n'a pas réussi à
 * t'entendre ». Les deux sont pourtant le même problème pour qui
 * exploite l'app : **le serveur n'est pas configuré correctement**, et
 * personne devant l'écran n'y peut rien.
 *
 * Le 26 août, la voix était morte — dictée **et** synthèse — depuis le
 * 5 août : `ELEVENLABS_API_KEY` portait l'*identifiant* d'une clé au
 * lieu de la clé (`sk_…`). Trois semaines pendant lesquelles l'app
 * disait « réessaie » à des gens qui n'avaient rien à réessayer. Le
 * motif exact n'existait que dans les journaux Vercel.
 *
 * On ne montre toujours pas le message d'ElevenLabs — il est en anglais
 * et parle d'API. Mais on dit **de quel côté est le problème.**
 *
 * `400` en fait partie : c'est ce que rend ElevenLabs quand la clé a la
 * mauvaise forme, là où on attendrait `401`.
 */
export function estRefusDeCle(statut: number, corps: string): boolean {
  if (statut === 401 || statut === 403) return true;
  return statut === 400 && /authentication_error|invalid_api_key|api_key/i.test(corps);
}


/**
 * Rend le MP3 d'un texte, dit par une voix précise.
 *
 * **La voix est un argument, pas un réglage de serveur** : depuis
 * JON-59, chaque habitant a la sienne. L'appelant a déjà décidé
 * laquelle — ce fichier ne fait que parler.
 *
 * Lève plutôt que de rendre un flux vide : un fichier de zéro octet
 * déposé dans le bucket serait pris pour un audio valide par le cache,
 * et se rejouerait en silence pour toujours. Une erreur, elle, se voit.
 */
export async function generateSpeech(
  text: string,
  voiceId: string,
): Promise<ArrayBuffer> {
  const key = cleElevenLabs();

  if (text.length > MAX_CHARS) {
    throw new Error(`texte trop long (${text.length} > ${MAX_CHARS})`);
  }

  const response = await fetch(`${ENDPOINT}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: {
        // Assez stable pour que deux briefings se ressemblent, assez
        // libre pour ne pas sonner comme une annonce de gare.
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    // Le motif, jamais le texte : il porte l'agenda de la maison (§74).
    const reason = await response.text();
    console.error(
      `[casa-voix] ElevenLabs a refusé (${response.status})`,
      reason.slice(0, 200),
    );
    if (estRefusDeCle(response.status, reason)) {
      throw new VoiceUnavailableError(`ELEVENLABS_API_KEY refusée (${response.status})`);
    }
    throw new Error(`elevenlabs ${response.status}`);
  }

  const audio = await response.arrayBuffer();
  if (audio.byteLength === 0) throw new Error("elevenlabs a rendu un flux vide");

  return audio;
}
