"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RefreshCw, Star, TriangleAlert, Unlink } from "lucide-react";
import type { VisibilityMode } from "@/types";
import type { CalendarKind, ExternalCalendar } from "@/lib/calendar-providers";
import type { ConnectedCalendar } from "@/lib/data/calendar";
import { Button } from "@/components/ui/button";
import {
  chooseCalendars,
  disconnectGoogleCalendar,
  syncNow,
} from "@/actions/calendar";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   Réglages d'un agenda Google déjà autorisé.

   Deux questions, dans cet ordre : lesquels de tes agendas, et ce que
   la maison a le droit d'en voir. Rien d'autre — le reste se règle
   chez Google.
   ═══════════════════════════════════════════════════════════════ */

/** Les trois niveaux du plan (§19), formulés à la première personne. */
const VISIBILITY: {
  value: VisibilityMode;
  label: string;
  detail: string;
}[] = [
  {
    value: "availability",
    label: "Seulement mes disponibilités",
    detail: "La maison voit « occupé », jamais pourquoi. Les titres n’entrent même pas dans Casa Liva.",
  },
  {
    value: "titles",
    label: "Les noms de mes événements",
    detail: "« Dentiste », oui. L’adresse et les notes, non.",
  },
  {
    value: "full",
    label: "Tous les détails",
    detail: "Titre, lieu, description. Comme si tu l’avais créé ici.",
  },
];

/**
 * Ce qu'on dit d'un agenda que Google a créé tout seul.
 *
 * On ne les écarte pas d'office — c'est un choix qui appartient à la
 * personne, et un jour férié peut compter pour une famille. Mais rester
 * muet ferait cocher au hasard, et « Numéros de semaine » pose une
 * étiquette sur chaque semaine de l'agenda sans que personne comprenne
 * d'où elle sort.
 */
const KIND_HINTS: Partial<Record<CalendarKind, string>> = {
  weekNumbers: "Écrit le numéro de la semaine sur chaque semaine. Rarement utile ici.",
  holidays: "Les jours fériés du pays. Sympathique, mais rien à organiser.",
  birthdays: "Tous les anniversaires de ton carnet d’adresses — souvent beaucoup.",
};

export type GoogleSettingsProps = {
  /** Ce que Google propose, en direct. */
  calendars: ExternalCalendar[];
  /** Ce qui est déjà synchronisé. */
  connections: ConnectedCalendar[];
};

export function GoogleSettings({ calendars, connections }: GoogleSettingsProps) {
  const connected = new Set(connections.map((c) => c.externalCalendarId));

  const [selected, setSelected] = useState<Set<string>>(() => {
    // Première visite : l'agenda principal est coché d'office. C'est
    // celui que 90 % des gens veulent, et cocher zéro case donnerait
    // un écran qui ne sert à rien tant qu'on n'a pas compris.
    if (connections.length > 0) return new Set(connected);
    const primary = calendars.find((c) => c.primary);
    return new Set(primary ? [primary.id] : []);
  });

  const [visibility, setVisibility] = useState<VisibilityMode>(
    connections[0]?.visibilityMode ?? "titles",
  );

  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const initialVisibility = connections[0]?.visibilityMode ?? "titles";
  const sameSelection =
    selected.size === connected.size &&
    [...selected].every((id) => connected.has(id));
  const unchanged = sameSelection && visibility === initialVisibility;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await chooseCalendars({
        calendars: calendars
          .filter((c) => selected.has(c.id))
          .map((c) => ({ id: c.id, name: c.name })),
        visibilityMode: visibility,
      });

      if (!result.ok) return setError(result.error);
      setMessage("C’est enregistré. Tes rendez-vous arrivent.");
      router.refresh();
    });
  }

  function refresh() {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await syncNow();
      if (!result.ok) return setError(result.error);
      setMessage("À jour.");
      router.refresh();
    });
  }

  function disconnect() {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await disconnectGoogleCalendar();
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="px-4 pb-10">
      {/* ── Quels agendas ────────────────────────────────────── */}
      <fieldset className="pt-6">
        <legend className="pb-2.5 text-[0.8125rem] font-bold uppercase tracking-wide text-ink-3">
          Quels agendas
        </legend>

        {calendars.length === 0 ? (
          <p className="rounded-casa-md border border-line bg-surface p-4 text-[0.9375rem] text-ink-2">
            Google ne nous montre aucun agenda. C’est inhabituel — essaie de
            reconnecter.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-casa-md border border-line bg-surface shadow-casa-sm">
            {calendars.map((calendar, i) => {
              const checked = selected.has(calendar.id);
              return (
                <li key={calendar.id} className={i > 0 ? "border-t border-line" : undefined}>
                  <label className="flex min-h-tap cursor-pointer items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(calendar.id)}
                      // `peer` : l'input reste le seul élément focusable,
                      // et son focus pilote l'anneau du carré dessiné.
                      // Sans ça, naviguer au clavier ne montrait
                      // strictement rien à l'écran.
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                        "peer-focus-visible:ring-3 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface",
                        checked
                          ? "border-accent bg-accent text-white"
                          : "border-line-strong bg-surface",
                      )}
                    >
                      {checked && <Check size={15} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-[0.9375rem] font-medium text-ink">
                        <span className="truncate">{calendar.name}</span>
                        {calendar.primary && (
                          <Star
                            size={13}
                            strokeWidth={2.4}
                            aria-label="Agenda principal"
                            className="shrink-0 text-ink-3"
                          />
                        )}
                      </span>
                      {KIND_HINTS[calendar.kind] && (
                        <span className="mt-0.5 block text-[0.8125rem] leading-snug text-ink-3">
                          {KIND_HINTS[calendar.kind]}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      {/* ── Ce que la maison voit ────────────────────────────── */}
      <fieldset className="pt-8">
        <legend className="pb-1 text-[0.8125rem] font-bold uppercase tracking-wide text-ink-3">
          Que peut voir Casa Liva ?
        </legend>
        <p className="pb-2.5 text-[0.875rem] leading-relaxed text-ink-2">
          Ce réglage s’applique au moment où l’on récupère tes événements. Ce
          que tu caches n’est pas seulement masqué&nbsp;: il n’entre jamais dans
          Casa Liva.
        </p>

        <ul className="overflow-hidden rounded-casa-md border border-line bg-surface shadow-casa-sm">
          {VISIBILITY.map((option, i) => {
            const checked = visibility === option.value;
            return (
              <li key={option.value} className={i > 0 ? "border-t border-line" : undefined}>
                <label className="flex min-h-tap cursor-pointer items-start gap-3 px-4 py-3.5">
                  <input
                    type="radio"
                    name="visibilite"
                    value={option.value}
                    checked={checked}
                    onChange={() => setVisibility(option.value)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      "peer-focus-visible:ring-3 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface",
                      checked ? "border-accent" : "border-line-strong",
                    )}
                  >
                    {checked && <span className="h-3 w-3 rounded-full bg-accent" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.9375rem] font-medium text-ink">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-[0.8125rem] leading-relaxed text-ink-3">
                      {option.detail}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      {error && (
        <p role="alert" className="mt-5 text-[0.875rem] font-medium text-danger">
          {error}
        </p>
      )}
      {message && !error && (
        <p role="status" className="mt-5 text-[0.875rem] font-medium text-success">
          {message}
        </p>
      )}

      <Button
        size="lg"
        block
        className="mt-6"
        disabled={pending || (unchanged && connections.length > 0)}
        onClick={save}
      >
        {pending
          ? "Un instant…"
          : connections.length === 0
            ? "Récupérer mes rendez-vous"
            : "Enregistrer"}
      </Button>

      {connections.length > 0 && (
        <>
          <Button
            variant="secondary"
            block
            className="mt-3"
            disabled={pending}
            onClick={refresh}
          >
            <RefreshCw size={17} strokeWidth={2.2} aria-hidden="true" />
            Synchroniser maintenant
          </Button>

          {/* Déconnexion : jamais en un seul geste, et jamais en icône
              seule. On dit ce que ça emporte avant de le faire. */}
          <div className="mt-8 rounded-casa-md border border-line bg-surface-2 p-4">
            {confirmingDisconnect ? (
              <>
                <p className="text-[0.9375rem] font-medium text-ink">
                  On déconnecte&nbsp;?
                </p>
                <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-2">
                  Tes rendez-vous Google quitteront Casa Liva. Rien ne bouge
                  chez Google, et tu peux revenir quand tu veux.
                </p>
                <div className="mt-4 flex gap-2">
                  <Button
                    variant="danger"
                    disabled={pending}
                    onClick={disconnect}
                    className="flex-1"
                  >
                    Oui, déconnecter
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setConfirmingDisconnect(false)}
                    className="flex-1"
                  >
                    Annuler
                  </Button>
                </div>
              </>
            ) : (
              <Button
                variant="ghost"
                block
                className="text-ink-3"
                onClick={() => setConfirmingDisconnect(true)}
              >
                <Unlink size={17} strokeWidth={2.2} aria-hidden="true" />
                Déconnecter mon agenda Google
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Bandeau de reconnexion — un jeton peut toujours être révoqué. */
export function ReauthNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-4 mt-6 flex items-start gap-3 rounded-casa-md border border-warn/40 bg-warn-soft p-4">
      <TriangleAlert
        size={20}
        strokeWidth={2.2}
        aria-hidden="true"
        className="mt-0.5 shrink-0 text-warn"
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
