import "server-only";
import type { CasaEvent, FamilyMember } from "@/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { visibleTitle } from "@/lib/calendar/visible";
import { formatDayLong, formatTime, isSameCasaDay } from "@/lib/date";
import { minutesRestantes } from "@/lib/rappels";
import { sendToDevice, type PushPayload } from "@/lib/push/send";

/* ═══════════════════════════════════════════════════════════════
   Qui reçoit quoi, et sous quelle forme (§66 bis, JON-47).

   ── La règle qui commande tout : le push d'abord, l'email en relais ──

   Décidé avec le commanditaire. Deux interrupteurs (`wants_push`,
   `wants_digests`), et **jamais les deux canaux pour le même
   événement** : recevoir une invitation en double finit par faire
   couper les deux. `notifierOuNull` rend donc « prévenu » ou « pas
   prévenu », et l'appelant n'envoie l'email que dans le second cas.

   ── Ce qui s'affiche est lu sur un écran VERROUILLÉ ──

   C'est la surface la plus exposée du produit : pas besoin de
   déverrouiller le téléphone, ni même de le prendre en main. La règle
   de D13 s'y applique donc telle quelle, et sans exception — un
   événement `is_private` n'écrit **jamais** son titre. On passe par
   `visibleTitle`, la même fonction que les emails, Casa AI et la voix.

   **Et le texte n'est jamais fourni par l'appelant.** Les fonctions
   ci-dessous prennent l'événement et la personne, et écrivent la
   phrase elles-mêmes — exactement comme `/api/ia/voix` reçoit
   l'identifiant d'un message et relit son contenu en base (D36).
   Accepter un titre tout fait rouvrirait par la notification ce qui est
   fermé partout ailleurs.
   ═══════════════════════════════════════════════════════════════ */

/** L'heure d'un événement, dite court — l'écran de verrouillage est étroit. */
function quand(event: CasaEvent): string {
  if (event.allDay) return `${formatDayLong(event.startAt)} · toute la journée`;

  const jour = formatDayLong(event.startAt);
  const fin = isSameCasaDay(event.startAt, event.endAt)
    ? formatTime(event.endAt)
    : `${formatDayLong(event.endAt)} ${formatTime(event.endAt)}`;

  return `${jour} · ${formatTime(event.startAt)} → ${fin}`;
}

/**
 * Envoie à **tous les appareils** de quelqu'un, et dit si ça a servi.
 *
 * Renvoie `true` dès qu'un appareil a reçu. Sinon `false`, et
 * l'appelant reprend la main — c'est ce qui fait que l'email arrive
 * quand le téléphone ne peut pas.
 *
 * **Lecture sous la clé de service, et c'est nécessaire** : prévenir
 * Sophie exige de lire l'abonnement de Sophie, ce que la session
 * de celui qui invite ne peut pas faire — la RLS de 0016 n'ouvre
 * qu'à soi. C'est le même chemin que les emails.
 */
async function notifierPersonne(
  userId: string,
  payload: PushPayload,
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data: personne } = await supabase
    .from("users")
    .select("wants_push")
    .eq("id", userId)
    .maybeSingle();

  // Le réglage appartient à celui qui le subit (D27, D37) : s'il a
  // coupé, on ne pousse pas — et l'email reprend le relais.
  if (personne && personne.wants_push === false) return false;

  const { data: appareils, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    console.error("[casa-push] lecture des abonnements échouée", error.message);
    return false;
  }
  if (!appareils || appareils.length === 0) return false;

  /* Chaque appareil est indépendant : un abonnement mort sur la
     tablette ne doit pas priver le téléphone de sa notification. */
  const resultats = await Promise.all(
    appareils.map((a) => sendToDevice(a, payload)),
  );

  return resultats.some((r) => r.ok);
}

/**
 * « Casa Liva a un plan pour toi » — sur le téléphone cette fois.
 *
 * Rend `true` si la personne a été prévenue : l'appelant s'abstient
 * alors d'envoyer l'email.
 */
export async function pushInvitation(
  event: CasaEvent,
  guest: FamilyMember,
  organiser: FamilyMember,
): Promise<boolean> {
  return notifierPersonne(guest.id, {
    titre: `${organiser.firstName} t’invite`,
    // `visibleTitle` et non `event.title` : un écran verrouillé se lit
    // par-dessus l'épaule (D13).
    corps: `${visibleTitle(event, organiser)}\n${quand(event)}`,
    url: "/aujourdhui",
    /* Une seconde invitation au même événement remplace la première
       plutôt que d'empiler deux lignes identiques. */
    tag: `invitation-${event.id}`,
  });
}

/**
 * Quelqu'un a répondu à ce que **j'ai** proposé.
 *
 * Ne part qu'à l'organisateur, et seulement pour un « je viens » ou un
 * « pas dispo » — pas pour un retour à l'indécision, qui n'apprend
 * rien à personne.
 */
export async function pushReponse(
  event: CasaEvent,
  organiser: FamilyMember,
  invite: FamilyMember,
  statut: "accepted" | "declined",
): Promise<boolean> {
  const verdict = statut === "accepted" ? "vient" : "n’est pas dispo";

  return notifierPersonne(organiser.id, {
    titre: `${invite.firstName} ${verdict}`,
    corps: `${visibleTitle(event, organiser)}\n${quand(event)}`,
    url: "/aujourdhui",
    tag: `reponse-${event.id}`,
  });
}

/**
 * Le rappel avant un événement.
 *
 * Part à chaque participant qui n'a pas décliné, **et à l'organisateur**
 * (D56) : lui aussi peut oublier ce qu'il a proposé. Le titre passe par
 * `visibleTitle` **avec le propriétaire de l'événement**, et non avec
 * le destinataire : c'est bien « Sophie occupée » qu'il faut écrire
 * sur l'écran de quelqu'un d'autre.
 *
 * ── Le délai annoncé est celui qu'on constate, pas celui qu'on visait ──
 *
 * On reçoit l'heure courante et on recalcule, au lieu de recopier le
 * `rappel_minutes` de l'événement. Le planificateur est un workflow
 * GitHub Actions, et ceux-là sont « au mieux » : ils glissent de
 * plusieurs minutes sous charge (D54). Écrire « dans 30 min » sur un
 * rappel parti avec vingt minutes de retard serait faux — et une
 * notification qui ment une fois fait douter de toutes les suivantes.
 *
 * L'heure de début est écrite juste en dessous, et elle, elle ne
 * dérive jamais : c'est elle qui tranche si les deux se contredisent.
 */
export async function pushRappel(
  event: CasaEvent,
  destinataire: FamilyMember,
  proprietaire: FamilyMember,
  maintenantMs: number,
): Promise<boolean> {
  const restant = minutesRestantes(new Date(event.startAt).getTime(), maintenantMs);

  return notifierPersonne(destinataire.id, {
    titre: restant > 0 ? `Dans ${restant} min` : "Ça commence",
    corps: `${visibleTitle(event, proprietaire)}\n${formatTime(event.startAt)}`,
    url: "/aujourdhui",
    /* Le `tag` évite d'empiler deux lignes à l'écran. Il n'évite PAS un
       second envoi — c'est `rappel_envoye_pour` (0017) qui s'en charge,
       et les deux ne se remplacent pas. */
    tag: `rappel-${event.id}`,
  });
}
