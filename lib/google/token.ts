import "server-only";
import {
  AccessTokenRejectedError,
  ProviderUnavailableError,
  ReauthRequiredError,
} from "@/lib/calendar-providers/types";
import { nowMs } from "@/lib/clock";
import { GOOGLE_PROVIDER, readCredentials, saveAccessToken } from "./credentials";

/* ═══════════════════════════════════════════════════════════════
   Jetons d'accès Google.

   Supabase gère la session Casa Liva ; il ne gère pas notre accès à
   l'API Google. Le rafraîchissement est donc à notre charge, et c'est
   ici — et seulement ici — qu'on sait fabriquer un jeton valide.

   L'adaptateur Google, lui, reçoit un jeton déjà bon et ne sait rien
   de tout ça. C'est ce qui permet de ne pas dupliquer cette logique
   au prochain fournisseur.
   ═══════════════════════════════════════════════════════════════ */

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

/**
 * Marge avant l'expiration annoncée.
 *
 * Généreuse à dessein : la date stockée après un consentement est une
 * estimation (Supabase ne transmet pas la durée de vie du jeton
 * fournisseur), les horloges dérivent, et une synchronisation peut
 * durer plusieurs secondes entre la vérification et l'appel. Se
 * tromper coûte un aller-retour ; ne pas se tromper coûte un 401.
 */
const EXPIRY_MARGIN_MS = 5 * 60_000;

export type GoogleOAuthConfig = { clientId: string; clientSecret: string };

/**
 * Les identifiants du client OAuth. Absents en local tant que
 * `.env.local` n'est pas complété — on le dit clairement plutôt que
 * de laisser Google répondre « invalid_client ».
 */
export function googleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants — l'agenda Google ne peut pas fonctionner.",
    );
  }

  return { clientId, clientSecret };
}

/** Y a-t-il de quoi proposer la connexion Google ? */
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/**
 * Un jeton d'accès valide, rafraîchi si nécessaire.
 *
 * Lève `ReauthRequiredError` si la personne n'a jamais connecté son
 * agenda, ou si Google refuse définitivement le refresh token.
 */
export async function getAccessToken(userId: string): Promise<string> {
  const credentials = await readCredentials(userId);

  if (!credentials) {
    throw new ReauthRequiredError(GOOGLE_PROVIDER, "aucun agenda connecté");
  }

  if (credentials.accessToken && credentials.expiresAt) {
    const expiresAt = new Date(credentials.expiresAt).getTime();
    if (Number.isFinite(expiresAt) && expiresAt - EXPIRY_MARGIN_MS > nowMs()) {
      return credentials.accessToken;
    }
  }

  return refreshAccessToken(userId);
}

/**
 * Redemande un jeton à Google, quelle que soit la date d'expiration
 * connue. Sert quand Google a refusé le jeton qu'on croyait bon.
 */
export async function refreshAccessToken(userId: string): Promise<string> {
  const credentials = await readCredentials(userId);

  if (!credentials) {
    throw new ReauthRequiredError(GOOGLE_PROVIDER, "aucun agenda connecté");
  }

  const { clientId, clientSecret } = googleOAuthConfig();

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }),
    // Aucun cache : un jeton se demande, il ne se relit pas.
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !payload?.access_token) {
    const code = payload?.error ?? `http_${response.status}`;
    const detail = payload?.error_description ?? "";

    // `invalid_grant` = le refresh token est mort. Cinq causes, toutes
    // définitives de notre point de vue : accès retiré depuis le
    // compte Google, mot de passe changé, consentement expiré parce
    // que l'écran est resté en « Testing » (cf. DECISIONS.md, D8),
    // jeton inutilisé pendant six mois, ou compte supprimé.
    // Aucun réessai ne le ranimera : il faut un humain.
    if (code === "invalid_grant") {
      throw new ReauthRequiredError(GOOGLE_PROVIDER, detail || "jeton révoqué");
    }

    // `invalid_client` est une erreur de configuration, pas d'un
    // utilisateur : la signaler comme un problème passager ferait
    // chercher au mauvais endroit.
    if (code === "invalid_client") {
      throw new Error(
        "Le client OAuth Google est mal configuré (invalid_client) — vérifier GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.",
      );
    }

    throw new ProviderUnavailableError(GOOGLE_PROVIDER, response.status, code);
  }

  // Google ne renvoie pas de nouveau refresh token ici : celui qu'on a
  // reste valable, et c'est bien pour ça qu'il fallait le capturer au
  // consentement.
  const expiresAt = new Date(
    nowMs() + (payload.expires_in ?? 3600) * 1000,
  ).toISOString();

  await saveAccessToken(userId, payload.access_token, expiresAt);

  return payload.access_token;
}

/**
 * Exécute un appel Google avec un jeton valide, et le rejoue **une**
 * fois si Google a répondu 401.
 *
 * Une seule reprise, jamais de boucle : si le jeton fraîchement émis
 * est refusé à son tour, le problème n'est pas le jeton, et réessayer
 * ne ferait que transformer une erreur en tempête de requêtes.
 */
export async function withGoogleAccessToken<T>(
  userId: string,
  call: (accessToken: string) => Promise<T>,
): Promise<T> {
  const accessToken = await getAccessToken(userId);

  try {
    return await call(accessToken);
  } catch (error) {
    if (!(error instanceof AccessTokenRejectedError)) throw error;
    return call(await refreshAccessToken(userId));
  }
}
