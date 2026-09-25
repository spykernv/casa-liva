"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCasaContext } from "@/lib/data/casa";
import type { FamilyResult } from "@/actions/family";

/* ═══════════════════════════════════════════════════════════════
   Gérer ses propres abonnements aux notifications (JON-47).

   **Sous la session de la personne, jamais sous la clé de service.**
   La RLS de 0016 n'ouvre qu'à soi : c'est elle qui garantit qu'on ne
   peut ni lire, ni retirer, ni deviner l'adresse de notification d'un
   autre habitant — et pas la bonne volonté de ce fichier. L'envoi,
   lui, a besoin de la clé de service et vit ailleurs (`lib/push/`).
   ═══════════════════════════════════════════════════════════════ */

export type AbonnementEntrant = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Enregistre — ou réenregistre — l'appareil courant.
 *
 * **`upsert` sur l'endpoint, et pas `insert`.** Le navigateur rend le
 * même endpoint tant que l'abonnement vit : réactiver les
 * notifications sur un téléphone déjà connu ne doit pas échouer sur un
 * doublon, ni créer une seconde ligne qui notifierait deux fois.
 *
 * `echecs` est remis à zéro : si la personne vient de réautoriser,
 * l'historique d'échecs de l'abonnement précédent ne la concerne plus.
 */
export async function saveSubscription(
  abonnement: AbonnementEntrant,
  appareil: string | null,
): Promise<FamilyResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  if (!abonnement.endpoint || !abonnement.p256dh || !abonnement.auth) {
    return { ok: false, error: "Abonnement incomplet." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: context.me.id,
      endpoint: abonnement.endpoint,
      p256dh: abonnement.p256dh,
      auth: abonnement.auth,
      /* Un mot, pas l'agent utilisateur complet : de quoi s'y
         retrouver entre deux appareils sans constituer une empreinte. */
      appareil: appareil && appareil.length <= 32 ? appareil : null,
      echecs: 0,
      dernier_succes_at: null,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("[casa-push] enregistrement de l'abonnement échoué", error.message);
    return { ok: false, error: "Impossible d'activer les notifications." };
  }

  revalidatePath("/moi");
  return { ok: true };
}

/** Retire cet appareil. Les autres appareils de la personne restent. */
export async function removeSubscription(endpoint: string): Promise<FamilyResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  const supabase = await createClient();
  /* Le filtre sur `user_id` est redondant avec la RLS, et délibéré :
     Postgres construit un bien meilleur plan, et la règle reste lisible
     ici même pour qui ne lit pas les policies. */
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", context.me.id);

  if (error) {
    console.error("[casa-push] retrait de l'abonnement échoué", error.message);
    return { ok: false, error: "Impossible de couper les notifications." };
  }

  revalidatePath("/moi");
  return { ok: true };
}

/**
 * L'interrupteur, distinct de l'abonnement.
 *
 * Couper le réglage sans se désabonner garde l'appareil connu : on
 * rallume d'un tap, sans repasser par la permission du système — qui,
 * sur iOS, ne se redemande pas.
 */
export async function setPushPreference(wanted: boolean): Promise<FamilyResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ wants_push: wanted })
    .eq("id", context.me.id);

  if (error) {
    console.error("[casa-push] réglage des notifications échoué", error.message);
    return { ok: false, error: "Impossible d'enregistrer ce réglage." };
  }

  revalidatePath("/moi");
  return { ok: true };
}
