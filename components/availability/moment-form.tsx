"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { FamilyMember } from "@/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DURATIONS } from "@/lib/availability/availability";
import { formatDuration } from "@/lib/date";
import { cn } from "@/lib/utils";

export type MomentFormProps = {
  members: FamilyMember[];
  meId: string;
  /** Ce qui a été cherché, relu depuis l'URL — le formulaire s'y remet. */
  defaultTitle: string;
  defaultUserIds: string[];
  defaultDuration: number;
};

/**
 * « Faire quoi ? · Avec qui ? · Durée ? » — la maquette du plan (§21-22).
 *
 * La recherche vit dans l'URL, pas dans un état local : le résultat est
 * calculé par le serveur, le retour arrière fonctionne, et un créneau
 * trouvé se partage par message. C'est aussi ce qui garantit qu'on
 * cherche toujours sur des données fraîches — une page laissée ouverte
 * une heure ne proposera pas un créneau réservé entre-temps.
 */
export function MomentForm({
  members,
  meId,
  defaultTitle,
  defaultUserIds,
  defaultDuration,
}: MomentFormProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [withIds, setWithIds] = useState<string[]>(defaultUserIds);
  const [duration, setDuration] = useState(defaultDuration);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const everyone = withIds.length === members.length;

  function toggle(id: string) {
    // On ne se retire pas de sa propre recherche : elle se termine par
    // la création d'un événement, et `createEvent` remet de toute façon
    // le créateur dans les participants. Autant ne pas mentir à l'écran.
    if (id === meId) return;
    setWithIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function search() {
    const params = new URLSearchParams();
    params.set("quoi", title.trim());
    params.set("duree", String(duration));
    for (const id of withIds) params.append("qui", id);
    startTransition(() => router.push(`/casa/trouver?${params}`));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim()) search();
      }}
      className="px-4 pt-4"
    >
      <label
        htmlFor="moment-title"
        className="block text-[1.0625rem] font-semibold text-ink"
      >
        Faire quoi&nbsp;?
      </label>
      <input
        id="moment-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Golf"
        enterKeyHint="search"
        autoComplete="off"
        maxLength={80}
        className="mt-2.5 h-14 w-full rounded-casa-md border border-line bg-surface px-4 text-base text-ink shadow-casa-sm placeholder:text-ink-3"
      />

      <div className="mt-6 flex items-baseline justify-between">
        <h2 className="text-[1.0625rem] font-semibold text-ink">Avec qui&nbsp;?</h2>
        <button
          type="button"
          onClick={() => setWithIds(everyone ? [meId] : members.map((m) => m.id))}
          className="text-[0.875rem] font-semibold text-accent"
        >
          {everyone ? "Juste moi" : "Toute la maison"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {members.map((member) => {
          const on = withIds.includes(member.id);
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => toggle(member.id)}
              aria-pressed={on}
              disabled={member.id === meId}
              className={cn(
                "flex min-h-12 items-center gap-2 rounded-casa-xl border px-2.5 py-1.5 transition-colors",
                on
                  ? "border-accent bg-accent-soft text-accent-ink"
                  : "border-line bg-surface text-ink-2",
                member.id === meId && "opacity-90",
              )}
            >
              <Avatar member={member} size="sm" dimmed={!on} />
              <span className="pr-1 text-[0.9375rem] font-semibold">
                {member.firstName}
              </span>
            </button>
          );
        })}
      </div>

      <h2 className="mt-6 text-[1.0625rem] font-semibold text-ink">Combien de temps&nbsp;?</h2>
      <div role="group" aria-label="Durée" className="mt-3 flex gap-2">
        {DURATIONS.map((minutes) => {
          const on = duration === minutes;
          return (
            <button
              key={minutes}
              type="button"
              onClick={() => setDuration(minutes)}
              aria-pressed={on}
              className={cn(
                "h-12 flex-1 rounded-casa border text-base font-semibold transition-colors",
                on
                  ? "border-accent bg-accent-soft text-accent-ink"
                  : "border-line bg-surface text-ink-2",
              )}
            >
              {formatDuration(minutes)}
            </button>
          );
        })}
      </div>

      <Button
        type="submit"
        size="lg"
        block
        className="mt-6"
        disabled={pending || !title.trim()}
      >
        <Search size={19} strokeWidth={2.4} aria-hidden="true" />
        {pending ? "On regarde…" : "Chercher"}
      </Button>

      {!title.trim() && (
        <p className="mt-2.5 text-center text-[0.875rem] text-ink-3">
          Dis d’abord ce que tu veux faire&nbsp;: c’est ce qui atterrira
          dans l’agenda.
        </p>
      )}
    </form>
  );
}
