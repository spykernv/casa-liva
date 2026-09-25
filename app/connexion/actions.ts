"use server";

import { createClient } from "@/lib/supabase/server";
import { invitationOuvertePour } from "@/lib/data/ouverture";
import { appOrigin } from "@/lib/url";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

/** Chemin interne uniquement — une redirection ouverte serait exploitable. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/aujourdhui";
}

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return { status: "error", message: "Cette adresse ne ressemble pas à une adresse." };
  }

  const supabase = await createClient();
  const origin = await appOrigin();
  const next = safeNext(formData.get("suite"));

  /* ── La porte se ferme ici (JON-81) ──────────────────────────
     `shouldCreateUser` était à `true` sans condition : n'importe qui
     tapait une adresse et repartait avec un compte et sa propre maison.
     Deux inconnus étaient déjà entrés, dont un `admin@…`.

     Un compte ne naît désormais **que pour une adresse invitée**. Les
     habitants existants ne sont pas concernés : `signInWithOtp` envoie
     son lien à un compte qui existe déjà, `shouldCreateUser` ou non —
     ce drapeau ne décide que de la CRÉATION.

     C'est ce qui permet d'inviter sans déployer : l'autorisation se
     donne depuis l'app, pas dans une liste en dur. */
  const attendu = await invitationOuvertePour(email);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: attendu,
      emailRedirectTo: `${origin}/auth/callback?suite=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    // Le message brut de Supabase est en anglais et parle de « OTP » :
    // il n'aide personne. On le garde dans les logs serveur et on
    // traduit les deux cas qui arrivent réellement.
    console.error("[casa] envoi du lien de connexion échoué", error.status, error.message);

    // Un échec SMTP est un problème de configuration, pas un problème
    // d'utilisateur : le dire évite de faire réessayer dans le vide.
    const smtpBroken =
      error.status === 500 ||
      /smtp|mail|sending|dial|connection/i.test(error.message);

    /* ── Une adresse inconnue rend le MÊME écran qu'une adresse
       connue, et c'est délibéré ──

       Depuis que la création est fermée, Supabase refuse une adresse
       sans compte ni invitation. Afficher ce refus tel quel ferait de
       cette page un **annuaire** : on taperait des adresses une à une
       pour apprendre lesquelles ont un compte chez nous. Une porte
       qu'on vient de fermer ne doit pas devenir une fenêtre.

       On rend donc « lien envoyé », comme pour tout le monde — et
       l'écran de confirmation dit, lui, qu'une adresse non invitée ne
       reçoit rien. La personne qui s'est trompée d'adresse le sait ;
       celle qui sonde n'apprend rien. */
    /* On se fie au MESSAGE, pas au seul statut. Premier jet : le
       filtre exigeait `400`, or Supabase rend **`422 "Signups not
       allowed for otp"`** — mesuré sur la Preview, pas deviné. L'écran
       affichait donc « L'envoi a échoué », c'est-à-dire exactement la
       différence observable qu'on cherchait à supprimer.

       Les deux statuts sont acceptés : celui d'aujourd'hui et celui
       qu'une version future pourrait rendre. C'est le libellé qui
       porte le sens. */
    const inconnue =
      (error.status === 400 || error.status === 422) &&
      /signup|not allowed|otp_disabled|user not found/i.test(error.message);
    if (inconnue) return { status: "sent", email };

    return {
      status: "error",
      message:
        error.status === 429
          ? "Doucement — un lien vient déjà d'être envoyé. Regarde tes emails."
          : smtpBroken
            ? "L'envoi d'emails n'est pas configuré correctement. Ce n'est pas toi, c'est nous."
            : "L'envoi a échoué. Réessaie dans un instant.",
    };
  }

  return { status: "sent", email };
}
