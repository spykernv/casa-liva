import type { FamilyMember, ParticipantStatus } from "@/types";
import { Avatar } from "@/components/ui/avatar";
import {
  formatAllDayRange,
  formatDayLong,
  formatDuration,
  formatTime,
  isSameCasaDay,
} from "@/lib/date";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   Un événement, tel qu'il est ou tel qu'il serait.

   **Sorti de `EventDetailSheet` pour la phase 9**, et c'est le seul
   découpage qui rendait l'aperçu possible. La feuille de détail attend
   un événement **déjà en base** : ses boutons sont câblés sur
   `deleteEvent` et `setParticipation`, qui prennent un identifiant.
   Un aperçu, par définition, n'en a pas.

   Ce bloc-ci ne sait qu'afficher. Deux consommateurs, un seul rendu —
   ce qui garantit que ce qu'on valide dans l'aperçu ressemble **trait
   pour trait** à ce qu'on verra ensuite dans la grille. Deux rendus
   auraient divergé au premier détail, et c'est justement sur les
   détails qu'on valide.
   ═══════════════════════════════════════════════════════════════ */

const STATUS_LABEL: Record<ParticipantStatus, string> = {
  accepted: "Partant",
  pending: "N’a pas répondu",
  declined: "Pas dispo",
};

/**
 * Ce qu'il faut pour afficher un événement — **et rien de plus**.
 *
 * Volontairement structurel plutôt que `CasaEvent` : un brouillon
 * d'aperçu n'a ni `id`, ni `familyId`, ni `createdAt`, et les exiger
 * obligerait à les inventer. Un `CasaEvent` reste assignable tel quel.
 */
export type EventCardEvent = {
  title: string;
  emoji?: string | null;
  location?: string | null;
  startAt: string;
  endAt: string;
  allDay?: boolean;
  isPrivate?: boolean;
  creatorId?: string;
  participants: { userId: string; status: ParticipantStatus }[];
};

export type EventCardProps = {
  event: EventCardEvent;
  members: FamilyMember[];
  /** Sans statut : l'aperçu montre qui est convié, pas qui a déjà répondu. */
  showStatus?: boolean;
};

export function EventCard({ event, members, showStatus = true }: EventCardProps) {
  const durationMin =
    (new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60_000;

  /* Un événement à cheval sur minuit s'affichait « 22:00 → 03:00 » avec
     un seul jour devant — donc trois heures du matin le jeudi, alors
     que c'est vendredi. Le même défaut que le briefing avait rendu
     audible (JON-56). Ici il devient visible : l'aperçu d'une soirée
     qui déborde est exactement le moment où il faut pouvoir le lire. */
  const overnight =
    !event.allDay && !isSameCasaDay(event.startAt, event.endAt);

  const participants = event.participants
    .map((p) => ({ member: members.find((m) => m.id === p.userId), status: p.status }))
    .filter((p): p is { member: FamilyMember; status: ParticipantStatus } =>
      Boolean(p.member),
    );

  return (
    <>
      <h2 className="flex items-start gap-2 text-[1.5rem] font-bold leading-tight text-ink">
        {event.emoji && <span aria-hidden="true">{event.emoji}</span>}
        <span>{event.isPrivate ? "Occupé" : event.title}</span>
      </h2>

      <p className="mt-3 flex items-start gap-2 text-[0.9375rem] text-ink-2">
        <ClockIcon />
        {/* Une journée entière n'a pas d'horaires. Afficher
            « 00:00 → 00:00 (24h) » serait exact et illisible : ce qu'on
            veut savoir, c'est quel jour, et que ça dure toute la
            journée. */}
        {event.allDay ? (
          <span>
            {formatAllDayRange(event.startAt, event.endAt)}
            <span className="text-ink-3"> · toute la journée</span>
          </span>
        ) : overnight ? (
          <span>
            {formatDayLong(event.startAt)} {formatTime(event.startAt)}
            <br />→ {formatDayLong(event.endAt)} {formatTime(event.endAt)}
            <span className="text-ink-3"> ({formatDuration(durationMin)})</span>
          </span>
        ) : (
          <span>
            {formatDayLong(event.startAt)} · {formatTime(event.startAt)} →{" "}
            {formatTime(event.endAt)}
            <span className="text-ink-3"> ({formatDuration(durationMin)})</span>
          </span>
        )}
      </p>

      {/* `!isPrivate` explicitement, alors que `applyVisibility` met
          déjà `location` à `null` sur un événement masqué. Ce n'est pas
          de la redondance inutile : sans ce test, la garantie dépendrait
          d'une chaîne — l'import nettoie, donc l'affichage est sûr —
          au lieu de la règle d'affichage elle-même. Le jour où un
          événement masqué arrive par un autre chemin, personne ne
          repasserait ici. C'est le raisonnement de `visibleTitle`,
          appliqué au lieu. */}
      {event.location && !event.isPrivate && (
        <p className="mt-1.5 flex items-center gap-2 text-[0.9375rem] text-ink-2">
          <PinIcon />
          {event.location}
        </p>
      )}

      {participants.length > 0 && (
        <ul className="mt-5 space-y-1.5">
          {participants.map(({ member, status }) => (
            <li key={member.id} className="flex items-center gap-2.5">
              <Avatar member={member} size="sm" dimmed={status === "declined"} />
              <span className="flex-1 text-[0.9375rem] font-medium text-ink">
                {member.firstName}
              </span>
              {showStatus && (
                <span
                  className={cn(
                    "text-[0.8125rem]",
                    status === "accepted" && "font-semibold text-success",
                    status === "declined" && "text-ink-3 line-through",
                    status === "pending" && "text-ink-3",
                  )}
                >
                  {STATUS_LABEL[status]}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* Les deux icônes sont écrites à la main plutôt qu'importées de
   `lucide-react` : ce composant est rendu côté serveur dans l'aperçu
   comme côté client dans la feuille, et deux icônes de 17 px ne
   justifient pas d'embarquer la bibliothèque des deux côtés. */

function ClockIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 shrink-0 text-ink-3"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-ink-3"
    >
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
