import "server-only";

/* ═══════════════════════════════════════════════════════════════
   L'envoi d'emails — Resend, en direct par HTTP.

   Pas de SDK : un `POST` sur une URL et une clé dans un en-tête. Le
   paquet `resend` ajouterait une dépendance et une surface de mise à
   jour pour envelopper quinze lignes de `fetch`.

   Le domaine `casaliva.app` est vérifié chez Resend depuis le 3 août
   (JON-36). Avant ça, Resend refusait d'écrire à toute adresse autre
   que celle du titulaire du compte — et comme le lien de connexion est
   un email, personne d'autre que Jonathan ne pouvait entrer dans
   l'application. La leçon vaut d'être gardée sous les yeux : ici, un
   envoi refusé ne casse jamais l'action qui l'a déclenché.
   ═══════════════════════════════════════════════════════════════ */

const ENDPOINT = "https://api.resend.com/emails";

/** L'expéditeur. Le nom compte : « Casa Liva » se reconnaît, `hello@` non. */
const FROM = "Casa Liva <hello@casaliva.app>";

export type Mail = {
  to: string;
  subject: string;
  html: string;
  /** Version texte — certains clients ne rendent que celle-ci. */
  text: string;
  /**
   * L'URL que le client mail appelle en `POST` pour le désabonnement
   * en un clic. Absente pour les envois qui répondent à une action
   * (invitation, lien de connexion) : ceux-là ne sont pas subis, et
   * proposer de les couper serait offrir de casser l'app.
   */
  unsubscribePostUrl?: string;
};

export type SendOutcome =
  | { ok: true; id: string }
  | { ok: false; reason: string };

/**
 * Envoie un email. **N'échoue jamais bruyamment.**
 *
 * Le résultat est renvoyé, pas levé : aucun appelant ne doit voir son
 * action échouer parce qu'un email n'est pas parti. Créer un événement
 * est le produit ; prévenir les invités est un service rendu par-dessus.
 * Inverser les deux ferait perdre le golf pour sauver la notification.
 */
export async function sendMail(mail: Mail): Promise<SendOutcome> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[casa] RESEND_API_KEY manquante — email non envoyé");
    return { ok: false, reason: "clé absente" };
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        /* `List-Unsubscribe` n'est pas de la décoration : Gmail et
           Outlook affichent leur propre bouton « Se désabonner » quand
           il est là, et pénalisent la réputation du domaine quand il
           manque sur des envois périodiques. Le `One-Click` exige que
           l'URL accepte un POST — la nôtre le fait. */
        ...(mail.unsubscribePostUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${mail.unsubscribePostUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      // On journalise le motif, jamais le contenu : un corps d'email
      // porte l'agenda de quelqu'un (§74, « ne jamais logger le
      // contenu de calendrier sensible »).
      console.error(`[casa] Resend a refusé (${response.status})`, body.slice(0, 300));
      return { ok: false, reason: `resend ${response.status}` };
    }

    const data = (await response.json()) as { id?: string };
    return { ok: true, id: data.id ?? "" };
  } catch (error) {
    console.error("[casa] envoi d'email impossible", error);
    return { ok: false, reason: "réseau" };
  }
}
