import { NextResponse } from "next/server";
import { unsubscribeByToken } from "@/lib/email/unsubscribe";

/**
 * Le désabonnement « en un clic », côté machine (RFC 8058).
 *
 * Gmail et Outlook affichent leur propre bouton « Se désabonner » dès
 * que l'en-tête `List-Unsubscribe` est présent, et l'actionnent par un
 * `POST` sur cette URL — sans jamais ouvrir de page. Sans ce handler,
 * leur bouton échouerait en silence, et la personne se rabattrait sur
 * « signaler comme indésirable ». C'est le domaine entier qui trinque
 * alors, lien de connexion compris.
 *
 * `/desabonnement/[token]` sert le même jeton aux humains. Deux URLs
 * parce qu'une route et une page ne peuvent pas partager un chemin.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const done = await unsubscribeByToken(token);

  // 200 même sur un jeton inconnu : le client mail n'a rien à faire de
  // l'information, et un 404 le pousserait à réessayer.
  return NextResponse.json({ desabonne: done });
}
