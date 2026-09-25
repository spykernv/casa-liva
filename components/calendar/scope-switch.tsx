"use client";

import type { FamilyMember } from "@/types";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   De qui montre-t-on les événements (D47).

   Remplace `MemberFilter` sur `/semaine` et `/aujourdhui` : trois
   idiomes de filtre pour une seule question, c'est deux de trop. Il en
   hérite le garde-fou qui compte — **il y a toujours exactement une
   chip active**, donc on ne peut jamais se retrouver devant un écran
   vide sans comprendre pourquoi.
   ═══════════════════════════════════════════════════════════════ */

export type ScopeSwitchProps = {
  members: FamilyMember[];
  meId: string;
  /** `maison`, `moi`, ou l'identifiant d'un habitant. */
  value: string;
  onChange: (next: string) => void;
};

export function ScopeSwitch({ members, meId, value, onChange }: ScopeSwitchProps) {
  const others = members.filter((m) => m.id !== meId);

  const chip = (active: boolean) =>
    cn(
      "tap flex shrink-0 items-center justify-center rounded-casa-xl border px-3",
      "text-[1rem] font-semibold transition-colors",
      active
        ? "border-accent bg-accent-soft text-accent-ink"
        : "border-line bg-surface text-ink-2",
    );

  return (
    <div
      role="radiogroup"
      aria-label="De qui montrer les événements"
      /* Le contenu déborde de 379 px dans 343 : le dégradé de droite
         est ce qui le DIT. Aujourd'hui `MemberFilter` déborde sans le
         moindre indice, donc personne ne fait défiler.
         En style inline, pas en classe : le projet n'utilise
         `mask-image` nulle part, et Tailwind v4 a bougé dessus. */
      style={{
        maskImage: "linear-gradient(to right, #000 92%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, #000 92%, transparent)",
      }}
      className="no-scrollbar flex items-center gap-2 overflow-x-auto px-4 py-2"
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === "maison"}
        onClick={() => onChange("maison")}
        className={chip(value === "maison")}
      >
        La maison
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === "moi"}
        onClick={() => onChange("moi")}
        className={chip(value === "moi")}
      >
        Moi
      </button>

      {others.length > 0 && (
        <span aria-hidden="true" className="h-8 w-px shrink-0 bg-line" />
      )}

      {others.map((member) => (
        <button
          key={member.id}
          type="button"
          role="radio"
          aria-checked={value === member.id}
          aria-label={`Seulement ${member.firstName}`}
          onClick={() => onChange(member.id)}
          className={cn(
            "tap flex shrink-0 items-center justify-center rounded-full transition-transform",
            value === member.id
              ? "ring-2 ring-accent ring-offset-2 ring-offset-bg"
              : "hover:scale-105",
          )}
        >
          <Avatar member={member} size="md" dimmed={value !== member.id} />
        </button>
      ))}
    </div>
  );
}
