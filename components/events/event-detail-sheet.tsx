"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, MapPin, Navigation, Pencil, Plus, Trash2, X } from "lucide-react";
import type { CasaEvent, Catalogue, FamilyMember, ParticipantStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { EventCard } from "@/components/events/event-card";
import {
  EventForm,
  instantsOf,
  valuesFromEvent,
  type EventFormValues,
} from "@/components/events/event-form";
import { deleteEvent, setParticipation, updateEvent } from "@/actions/events";
import { savePlace } from "@/actions/catalogue";
import { directionsFor, resolvePlace } from "@/lib/catalogue";
import { visibleLocation } from "@/lib/calendar/visible";
import { OPTIONS_RAPPEL } from "@/lib/rappels";

export type EventDetailSheetProps = {
  /**
   * L'événement à afficher. Il reste renseigné pendant l'animation de
   * fermeture (`open` passe à `false` avant que le parent ne l'oublie),
   * sinon le panneau redescendrait vide.
   */
  event: CasaEvent | null;
  open: boolean;
  members: FamilyMember[];
  meId: string;
  /**
   * Les raccourcis de la maison (D45).
   *
   * **Le catalogue entier, et plus seulement `places`** : depuis que ce
   * panneau sait modifier un événement, il rend `EventForm`, qui a
   * besoin des catégories autant que des lieux. Lui passer les deux
   * moitiés séparément aurait fini par les désaccorder.
   */
  catalogue: Catalogue;
  onClose: () => void;
  /** Prévient le parent qu'il peut proposer d'annuler la suppression. */
  onDeleted: (event: CasaEvent) => void;
};

export function EventDetailSheet({
  event: shown,
  open,
  members,
  meId,
  catalogue,
  onClose,
  onDeleted,
}: EventDetailSheetProps) {
  const [pending, startTransition] = useTransition();
  const [ajoutAdresse, setAjoutAdresse] = useState(false);
  const [adresse, setAdresse] = useState("");
  const [erreurLieu, setErreurLieu] = useState<string | null>(null);
  /**
   * `detail` ou `edition` — le panneau porte les deux.
   *
   * **Il n'existait aucun moyen de modifier un événement**, et c'est ce
   * qui a été signalé : « quelqu'un ne peut pas modifier un horaire ».
   * Ce n'était pas un droit refusé, c'était un chemin absent. Le
   * glisser-déposer de la grille ne couvre qu'`/aujourd'hui`, et depuis
   * que la semaine se lit en liste (D46) il ne restait plus rien pour
   * un événement d'un autre jour — sinon demander à Casa AI.
   */
  const [mode, setMode] = useState<"detail" | "edition">("detail");
  const [erreurEdition, setErreurEdition] = useState<string | null>(null);
  const router = useRouter();

  const places = catalogue.places;

  /* Optimiste : l'organisateur voit son choix pris tout de suite, et on
     revient en arrière si le serveur refuse. Un réglage qui hésite
     donne l'impression de ne pas avoir été entendu, et on rappuie (§70). */
  const [rappel, setRappel] = useState<number | null | undefined>(undefined);

  if (!shown) return null;

  const myStatus = shown.participants.find((p) => p.userId === meId)?.status;

  /* Un événement appartient à qui l'organise (D21). Les autres
     répondent, et c'est tout. Le bouton « Supprimer » doit donc
     disparaître pour eux — le laisser en le faisant échouer serait
     proposer quelque chose qu'on refuse ensuite. */
  const mine = shown.creatorId === meId;
  const owner = members.find((m) => m.id === shown.creatorId);

  /* **`visibleLocation` et non `shown.location`.** Un événement masqué
     n'a pas de lieu à donner — la règle vit à un seul endroit, et un
     itinéraire est justement la façon la plus concrète de divulguer où
     quelqu'un se trouve. */
  const lieuTexte = visibleLocation(shown);
  const lieuConnu = resolvePlace(lieuTexte, places);
  const itineraire = directionsFor(lieuTexte, places);

  /* Refermer remet le panneau sur le détail. Sans ça, rouvrir un AUTRE
     événement afficherait le formulaire d'édition du précédent — le
     panneau reste monté pendant l'animation de fermeture. */
  function fermer() {
    setMode("detail");
    setErreurEdition(null);
    onClose();
  }

  function enregistrer(v: EventFormValues) {
    const cible = shown;
    if (!cible) return;
    setErreurEdition(null);
    startTransition(async () => {
      const r = await updateEvent({
        id: cible.id,
        title: v.title,
        emoji: v.emoji,
        location: v.location || null,
        ...instantsOf(v),
        participantIds: v.invited,
        rappelMinutes: v.rappelMinutes,
      });
      if (!r.ok) return setErreurEdition(r.error);
      setMode("detail");
      router.refresh();
    });
  }

  function respond(status: ParticipantStatus) {
    const target = shown;
    if (!target) return;
    startTransition(async () => {
      await setParticipation(target.id, status);
      router.refresh();
    });
  }

  function remove() {
    const snapshot = shown;
    if (!snapshot) return;
    startTransition(async () => {
      const result = await deleteEvent(snapshot.id);
      if (result.ok) {
        onClose();
        onDeleted(snapshot);
        router.refresh();
      }
    });
  }

  return (
    // `title` sert d'`aria-label` au dialogue : y passer le vrai titre
    // le ferait annoncer à voix haute par un lecteur d'écran, alors
    // que l'écran affiche « Occupé ».
    <Sheet
      open={open}
      onClose={fermer}
      title={
        mode === "edition"
          ? "Modifier l’événement"
          : shown.isPrivate
            ? "Occupé"
            : shown.title
      }
    >
      {mode === "edition" ? (
        <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2">
          <EventForm
            members={members}
            meId={meId}
            catalogue={catalogue}
            initial={valuesFromEvent({
              title: shown.title,
              emoji: shown.emoji,
              location: shown.location,
              startAt: shown.startAt,
              endAt: shown.endAt,
              participantIds: shown.participants.map((p) => p.userId),
              rappelMinutes: shown.rappelMinutes,
            })}
            submitLabel="Enregistrer"
            pendingLabel="On enregistre…"
            pending={pending}
            error={erreurEdition}
            /* On corrige, on ne part pas d'une page blanche : le titre
               est déjà là, et lui voler le focus ferait sauter l'écran
               sur un téléphone. Même raison que l'aperçu de Casa AI. */
            autoFocusTitle={false}
            onSubmit={enregistrer}
            secondary={
              <Button
                variant="secondary"
                size="lg"
                block
                disabled={pending}
                onClick={() => {
                  setErreurEdition(null);
                  setMode("detail");
                }}
              >
                Retour
              </Button>
            }
          />
        </div>
      ) : (
      <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2">
        {/* Le même bloc que l'aperçu de Casa AI (JON-63), et c'est ce
            qui garantit que ce qu'on valide ressemble trait pour trait
            à ce qu'on retrouvera ici. */}
        <EventCard event={shown} members={members} />

        {/* ── L'itinéraire (D20) ────────────────────────────────
            Deux liens `https` explicites, pas un `geo:` : celui-ci
            n'ouvre rien de fiable sur Safari iOS, et `waze://` échoue
            en silence quand l'application n'est pas installée. Deux
            boutons sont plus lourds qu'un, et honnêtes — imposer l'un
            des deux fâcherait la moitié de la famille.

            `noopener noreferrer` : ces URL portent le texte d'un
            événement, qui peut venir d'un agenda Google, donc de
            n'importe qui capable d'envoyer une invitation (D42). */}
        {itineraire && (
          <div className="mt-5">
            <p className="flex items-start gap-2 pb-2 text-[0.9375rem] text-ink-2">
              <MapPin size={17} strokeWidth={2.2} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span className="min-w-0">{itineraire.destination}</span>
            </p>
            <div className="flex gap-2">
              <a
                href={itineraire.maps}
                target="_blank"
                rel="noopener noreferrer"
                className="tap flex flex-1 items-center justify-center gap-2 rounded-casa-md border border-line bg-surface text-[1rem] font-semibold text-ink shadow-casa-sm"
              >
                <Navigation size={17} strokeWidth={2.3} aria-hidden="true" />
                Maps
              </a>
              <a
                href={itineraire.waze}
                target="_blank"
                rel="noopener noreferrer"
                className="tap flex flex-1 items-center justify-center gap-2 rounded-casa-md border border-line bg-surface text-[1rem] font-semibold text-ink shadow-casa-sm"
              >
                <Navigation size={17} strokeWidth={2.3} aria-hidden="true" />
                Waze
              </a>
            </div>
          </div>
        )}

        {/* Un lieu connu SANS adresse n'a délibérément pas de bouton :
            « Chez Mamie » lancé dans Maps atterrit n'importe où, et un
            bouton qui donne un mauvais résultat est pire que pas de
            bouton. On propose d'ajouter l'adresse — ici, au moment
            précis où l'on s'aperçoit qu'elle manque. */}
        {!itineraire && lieuConnu && !ajoutAdresse && (
          <button
            type="button"
            onClick={() => setAjoutAdresse(true)}
            className="tap mt-5 flex w-full items-center gap-2 rounded-casa-md border border-dashed border-line-strong px-3.5 text-left text-[1rem] font-semibold text-ink-2"
          >
            <Plus size={17} strokeWidth={2.4} aria-hidden="true" className="shrink-0" />
            Ajouter l’adresse de « {lieuConnu.label} »
          </button>
        )}

        {ajoutAdresse && lieuConnu && (
          <div className="mt-5 rounded-casa-md border border-line bg-surface-2 p-3">
            <label
              htmlFor="detail-adresse"
              className="block pb-1.5 text-[0.875rem] font-semibold text-ink-2"
            >
              L’adresse de « {lieuConnu.label} »
            </label>
            <div className="flex gap-2">
              <input
                id="detail-adresse"
                value={adresse}
                onChange={(e) => setAdresse(e.target.value)}
                placeholder="12 rue des Lilas, Toulon"
                maxLength={120}
                className="h-12 min-w-0 flex-1 rounded-casa-md border border-line bg-surface px-3 text-[1rem] text-ink placeholder:text-ink-2"
              />
              <button
                type="button"
                disabled={!adresse.trim() || pending}
                onClick={() => {
                  setErreurLieu(null);
                  startTransition(async () => {
                    const r = await savePlace({ label: lieuConnu.label, address: adresse });
                    if (!r.ok) return setErreurLieu(r.error);
                    setAjoutAdresse(false);
                    setAdresse("");
                    router.refresh();
                  });
                }}
                className="tap flex shrink-0 items-center gap-1.5 rounded-casa-md bg-accent px-3.5 text-[1rem] font-semibold text-white disabled:opacity-45"
              >
                <Check size={18} strokeWidth={2.6} aria-hidden="true" />
                Garder
              </button>
            </div>
            {/* Le lieu appartient à la maison (D45) : l'adresse profite
                à tout le monde, sur cet événement comme sur les autres
                qui portent le même nom. */}
            <p className="mt-2 text-[0.875rem] leading-snug text-ink-2">
              Toute la maison en profitera, ici et sur les autres événements au même endroit.
            </p>
            {erreurLieu && (
              <p role="alert" className="mt-2 text-[0.875rem] font-medium text-danger">
                {erreurLieu}
              </p>
            )}
          </div>
        )}

        {/* Pas de « Je viens / Pas dispo » sur un rendez-vous importé :
            répondre « pas dispo » le ferait disparaître de la grille et
            libérerait le créneau pour toute la maison, alors que le
            rendez-vous tient toujours chez Google. */}
        {myStatus && shown.source === "casa-liva" && (
          <div className="mt-6 flex gap-2">
            <Button
              variant={myStatus === "accepted" ? "primary" : "secondary"}
              block
              disabled={pending}
              onClick={() => respond("accepted")}
            >
              <Check size={18} strokeWidth={2.4} aria-hidden="true" />
              Je viens
            </Button>
            <Button
              variant={myStatus === "declined" ? "danger" : "secondary"}
              block
              disabled={pending}
              onClick={() => respond("declined")}
            >
              <X size={18} strokeWidth={2.4} aria-hidden="true" />
              Pas dispo
            </Button>
          </div>
        )}

        {/* ── Le rappel, et seulement pour qui organise ──────────
            Un délai appartient à l'événement, donc à son organisateur
            (D21, D56). Le montrer aux invités en lecture serait honnête
            mais bavard ; le leur laisser modifier reviendrait à laisser
            quelqu'un régler le réveil de toute la maison. */}
        {shown.source === "casa-liva" && mine && (
          <div className="mt-6">
            <p className="text-[1.0625rem] font-semibold text-ink">Prévenir tout le monde</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {OPTIONS_RAPPEL.map((option) => {
                const courant = rappel === undefined ? shown.rappelMinutes ?? null : rappel;
                const on = courant === option.minutes;
                return (
                  <button
                    key={option.libelle}
                    type="button"
                    aria-pressed={on}
                    disabled={pending}
                    onClick={() => {
                      const avant = courant;
                      setRappel(option.minutes);
                      startTransition(async () => {
                        const r = await updateEvent({
                          id: shown.id,
                          rappelMinutes: option.minutes,
                        });
                        if (!r.ok) setRappel(avant);
                        else router.refresh();
                      });
                    }}
                    className={
                      on
                        ? "tap rounded-casa-xl border border-accent bg-accent-soft px-3.5 text-[0.9375rem] font-semibold text-accent-ink"
                        : "tap rounded-casa-xl border border-line bg-surface px-3.5 text-[0.9375rem] font-semibold text-ink-2"
                    }
                  >
                    {option.libelle}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Modifier ────────────────────────────────────────────
            Réservé à qui organise, comme « Supprimer » : un événement
            appartient à qui l'a créé (D21), et `updateEvent` refuserait
            de toute façon — proposer un bouton qui échoue serait pire
            que ne rien proposer.

            Absent sur un événement importé de Google : la source de
            vérité est là-bas, et `refusalFor` le refuse. */}
        {shown.source === "casa-liva" && mine && (
          <Button
            variant="secondary"
            block
            className="mt-3"
            disabled={pending}
            onClick={() => setMode("edition")}
          >
            <Pencil size={18} strokeWidth={2.2} aria-hidden="true" />
            Modifier
          </Button>
        )}

        {shown.source === "casa-liva" && mine && (
          <Button
            variant="ghost"
            block
            className="mt-3 text-danger"
            disabled={pending}
            onClick={remove}
          >
            <Trash2 size={18} strokeWidth={2} aria-hidden="true" />
            Supprimer
          </Button>
        )}

        {/* Dire à qui il est, plutôt que de laisser un écran muet.
            Sans cette phrase, quelqu'un qui ne trouve ni « Supprimer »
            ni le glisser-déposer croirait à une panne.

            La seconde moitié dépend de la présence des boutons juste
            au-dessus : promettre « tu peux dire si tu viens » à
            quelqu'un qui n'est pas sur la liste, c'est renvoyer vers
            une action qui n'est pas là. */}
        {shown.source === "casa-liva" && !mine && (
          <p className="mt-5 rounded-casa border border-line bg-surface-2/60 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-ink-2">
            {owner
              ? `C’est ${owner.firstName} qui organise.`
              : "C’est quelqu’un d’autre qui organise."}{" "}
            {myStatus
              ? `Tu peux dire si tu viens — pour le reste, il faudra passer par ${owner?.firstName ?? "cette personne"}.`
              : "Tu n’es pas sur la liste, mais l’agenda est partagé : c’est fait pour savoir qui fait quoi."}
          </p>
        )}

        {shown.source === "google" && (
          <p className="mt-5 rounded-casa border border-line bg-surface-2/60 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-ink-2">
            Cet événement vient d’un agenda Google. Il se modifie là-bas —
            Casa Liva se contente de l’afficher.
          </p>
        )}
      </div>
      )}
    </Sheet>
  );
}
