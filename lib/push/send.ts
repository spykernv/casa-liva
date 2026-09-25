import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/* ═══════════════════════════════════════════════════════════════
   L'envoi d'une notification à un appareil (§66 bis, JON-47).

   **Pourquoi une bibliothèque ici, alors que Resend est un simple
   POST.** Un email s'écrit à la main parce que c'est du texte sur une
   URL. Le Web Push, non : la charge utile est chiffrée de bout en bout
   pour le navigateur (ECDH P-256, HKDF, AES-128-GCM — RFC 8291) et
   l'appel est signé par un jeton VAPID (RFC 8292). Écrire ça soi-même
   pour un agenda familial, c'est prendre le risque d'une charge que le
   service de push **accepte** et que le navigateur ne sait pas
   déchiffrer : rien n'échoue, rien n'arrive, et rien ne le dit.

   **Aucune clé ne part au navigateur.** Seule `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   est exposée — c'est sa raison d'être : le navigateur en a besoin
   pour créer l'abonnement. La privée vit ici, derrière `server-only`.
   ═══════════════════════════════════════════════════════════════ */

/** Ce qu'un appareil reçoit. Voir `lib/push/notify.ts` pour qui l'écrit. */
export type PushPayload = {
  titre: string;
  corps: string;
  /** Où le tap amène. Toujours un chemin de l'app, jamais une URL reçue. */
  url: string;
  /**
   * Regroupe les notifications qui parlent de la même chose : une
   * seconde invitation au même événement remplace la première au lieu
   * d'empiler deux lignes qui disent pareil.
   */
  tag?: string;
};

export type PushOutcome =
  | { ok: true }
  | { ok: false; raison: string; morte: boolean };

/** La configuration VAPID, ou `null` si le serveur n'est pas équipé. */
function vapid(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  return {
    publicKey,
    privateKey,
    subject: process.env.VAPID_SUBJECT ?? "mailto:hello@casaliva.app",
  };
}

/** Y a-t-il de quoi notifier ? Sert à ne pas proposer ce qu'on ne sait pas faire. */
export function isPushConfigured(): boolean {
  return vapid() !== null;
}

/**
 * Envoie à **un** appareil, et tient la comptabilité de sa santé.
 *
 * **N'échoue jamais bruyamment**, comme `sendMail` : créer un événement
 * est le produit, prévenir les invités est un service rendu par-dessus.
 * Inverser les deux ferait perdre le golf pour sauver la notification.
 *
 * **Un abonnement mort est supprimé, pas réessayé.** `404` et `410` ne
 * sont pas des pannes passagères : ils disent que cette installation
 * n'existe plus — désinstallation, permission retirée, appareil effacé.
 * Le service les rend **une seule fois**, puis accepte tout sans rien
 * livrer. Ne pas les traiter, c'est laisser la file se remplir
 * d'adresses fantômes et croire qu'on notifie. Même famille de panne
 * que `needs_reauth` sur les jetons Google.
 */
export async function sendToDevice(
  subscription: { id: string; endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<PushOutcome> {
  const config = vapid();
  if (!config) {
    console.error("[casa-push] clés VAPID absentes — notification non envoyée");
    return { ok: false, raison: "clés absentes", morte: false };
  }

  const supabase = createAdminClient();

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      {
        vapidDetails: config,
        /* Quatre heures. Au-delà, une invitation à un événement de ce
           soir n'a plus d'intérêt — et une notification qui arrive
           après coup fait douter de toutes les autres. */
        TTL: 4 * 60 * 60,
      },
    );

    await supabase
      .from("push_subscriptions")
      .update({ dernier_succes_at: new Date().toISOString(), echecs: 0 })
      .eq("id", subscription.id);

    return { ok: true };
  } catch (error) {
    const statut =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode: unknown }).statusCode)
        : 0;

    const morte = statut === 404 || statut === 410;

    if (morte) {
      await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
    } else {
      /* On compte, sans supprimer : un 500 du service de push ou une
         coupure réseau ne prouvent rien sur l'appareil. C'est
         l'accumulation qui parlera. */
      const { data } = await supabase
        .from("push_subscriptions")
        .select("echecs")
        .eq("id", subscription.id)
        .maybeSingle();

      await supabase
        .from("push_subscriptions")
        .update({ echecs: (data?.echecs ?? 0) + 1 })
        .eq("id", subscription.id);
    }

    // Jamais l'endpoint dans les journaux : c'est l'adresse qui permet
    // d'écrire sur l'écran verrouillé de quelqu'un.
    console.error(`[casa-push] envoi refusé (${statut || "sans statut"})`);
    return { ok: false, raison: String(statut || "erreur"), morte };
  }
}
