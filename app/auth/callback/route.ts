import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveCredentials } from "@/lib/google/credentials";
import { IDENTITY_GUARD_COOKIE } from "@/lib/google/oauth-guard";
import { nowMs } from "@/lib/clock";

/**
 * Retour OAuth (Google) et des liens email au format PKCE `?code=`.
 *
 * Le template email par défaut de Supabase passe par ce chemin ; le
 * template `token_hash` passe par `/auth/confirm`. Les deux sont
 * gérés, pour que l'app fonctionne quelle que soit la configuration du
 * projet.
 */

/**
 * Durée de vie supposée du jeton d'accès reçu au consentement.
 *
 * Supabase transmet le jeton du fournisseur mais pas sa date
 * d'expiration. Google émet des jetons d'une heure ; on retient 55
 * minutes, et un 401 reste rattrapé par un rafraîchissement
 * (`withGoogleAccessToken`). Une estimation prudente vaut mieux
 * qu'un champ vide qui forcerait un aller-retour à chaque lecture.
 */
const ASSUMED_TOKEN_LIFETIME_MS = 55 * 60_000;

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const flowId = searchParams.get("sb_flow_id");

  let next = searchParams.get("suite") ?? "/aujourdhui";
  if (!next.startsWith("/") || next.startsWith("//")) next = "/aujourdhui";

  /* ── Quelqu'un a dit non à Google ────────────────────────────────
     C'est l'issue la plus probable de tout le parcours : Google
     affiche « cette application n'est pas validée » (D8), et refuser
     est une réaction saine.

     Sans ce cas, on tombait dans l'erreur générique et on annonçait
     « Ce lien ne marche plus » à quelqu'un de toujours connecté, qui
     n'avait rien cassé et dont aucun lien n'avait expiré. Le message
     le plus faux de l'application, sur le geste le plus prévisible. */
  const refusal = searchParams.get("error");
  if (refusal && !code) {
    if (refusal !== "access_denied") {
      console.error("[casa] retour OAuth en erreur", refusal);
    }
    const separator = next.includes("?") ? "&" : "?";
    return NextResponse.redirect(
      new URL(`${next}${separator}erreur=refus`, request.url),
    );
  }

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    );

    if (!error) {
      /* ── La seule occasion de voir le refresh token ──────────────
         Supabase transmet `provider_refresh_token` dans la session
         qu'il vient de créer, puis l'oublie : il n'est stocké nulle
         part et ne reviendra pas. Si on ne le capture pas ici, il
         faut refaire consentir la personne.

         Google ne l'émet d'ailleurs que si la demande portait
         `access_type=offline` et `prompt=consent` — donc jamais lors
         d'une simple connexion par lien magique, où l'on passe
         simplement à côté sans rien casser.

         On attend l'écriture plutôt que de la reléguer à `after()` :
         perdre ce jeton coûte un nouveau passage par l'écran de
         consentement Google, ce qui n'est pas un prix acceptable pour
         gagner cent millisecondes une fois dans la vie. */
      const refreshToken = data.session?.provider_refresh_token;
      const userId = data.session?.user?.id;

      /* ── Est-on revenu sur le bon compte ? ──────────────────────
         Supabase apparie les identités sur l'adresse email, pas sur
         la session en cours. Autoriser un compte Google dont l'email
         diffère de celui du lien magique crée un SECOND utilisateur
         et remplace la session : la personne atterrit dans une maison
         vide sans comprendre pourquoi.

         On ne peut pas l'empêcher ici — le mal est déjà fait côté
         Supabase — mais on peut refuser d'y ajouter des jetons et le
         dire clairement, plutôt que de laisser quelqu'un croire que
         Casa Liva a perdu sa famille. */
      const jar = await cookies();
      const expectedUserId = jar.get(IDENTITY_GUARD_COOKIE)?.value;
      jar.delete(IDENTITY_GUARD_COOKIE);

      if (expectedUserId && userId && expectedUserId !== userId) {
        console.error(
          "[casa] consentement Google donné depuis un autre compte que celui connecté",
        );
        // Supabase a déjà basculé la session sur ce nouveau compte, qui
        // n'a pas de maison. L'y laisser afficherait un onboarding
        // vide et donnerait l'impression que tout a disparu. On
        // déconnecte et on explique.
        await supabase.auth.signOut();
        return NextResponse.redirect(
          new URL("/auth/erreur?raison=compte-google", request.url),
        );
      }

      if (refreshToken && userId) {
        try {
          await saveCredentials(userId, {
            refreshToken,
            accessToken: data.session?.provider_token ?? null,
            expiresAt: new Date(nowMs() + ASSUMED_TOKEN_LIFETIME_MS).toISOString(),
            // Les droits réellement accordés ne se devinent pas : Google
            // laisse décocher un scope sur l'écran de consentement. On
            // les apprendra au premier rafraîchissement, et le premier
            // appel à l'API dira la vérité mieux que nous.
            scopes: null,
          });
        } catch (credentialsError) {
          // La connexion à Casa Liva, elle, a réussi : on ne renvoie
          // pas quelqu'un sur un écran d'erreur parce que le rangement
          // du jeton a échoué. L'écran « Mon agenda » proposera de
          // reconnecter.
          console.error(
            "[casa] capture du refresh token Google échouée",
            credentialsError instanceof Error
              ? credentialsError.message
              : credentialsError,
          );
        }
      }

      // Derrière un proxy, `origin` peut désigner l'hôte interne.
      const forwardedHost = request.headers.get("x-forwarded-host");
      const base =
        process.env.NODE_ENV === "development" || !forwardedHost
          ? origin
          : `https://${forwardedHost}`;
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  return NextResponse.redirect(new URL("/auth/erreur", request.url));
}
