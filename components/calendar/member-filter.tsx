"use client";

import type { FamilyMember } from "@/types";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type MemberFilterProps = {
  members: FamilyMember[];
  selected: string[];
  onChange: (next: string[]) => void;
};

/**
 * Rangée d'avatars servant de filtre.
 *
 * Règle d'UX : le filtre doit être réversible en un tap et son état
 * lisible en permanence (§49). Quand quelqu'un est masqué, on affiche
 * explicitement combien de personnes sont cachées — sinon on se
 * demande où sont passés les événements.
 */
export function MemberFilter({ members, selected, onChange }: MemberFilterProps) {
  const allSelected = selected.length === members.length;

  function toggle(id: string) {
    // Décocher la dernière personne afficherait un agenda vide sans
    // raison compréhensible : on repasse alors sur « tout le monde ».
    if (selected.length === 1 && selected[0] === id) {
      onChange(members.map((m) => m.id));
      return;
    }
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
    );
  }

  return (
    <div className="px-4 pb-3">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {members.map((member) => {
          const on = selected.includes(member.id);
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => toggle(member.id)}
              aria-pressed={on}
              className={cn(
                "tap flex shrink-0 flex-col items-center justify-center gap-1 rounded-casa px-1.5 py-1",
                "transition-colors",
                on ? "text-ink" : "text-ink-3",
              )}
            >
              <Avatar member={member} size="md" dimmed={!on} />
              <span
                className={cn(
                  "text-[0.6875rem] leading-none",
                  on ? "font-semibold" : "font-medium",
                )}
              >
                {member.firstName}
              </span>
            </button>
          );
        })}
      </div>

      {!allSelected && (
        <button
          type="button"
          onClick={() => onChange(members.map((m) => m.id))}
          className="mt-1 text-[0.8125rem] font-semibold text-accent underline-offset-2 hover:underline"
        >
          {members.length - selected.length === 1
            ? "1 personne masquée — tout afficher"
            : `${members.length - selected.length} personnes masquées — tout afficher`}
        </button>
      )}
    </div>
  );
}
