import type { CSSProperties } from "react";
import type { MemberColor } from "@/types";

/**
 * Tailwind ne peut pas générer de classes à partir d'une valeur runtime
 * (`bg-member-${color}` ne compile pas). On passe donc par trois variables
 * CSS locales, posées en style inline, que les composants consomment via
 * `bg-[var(--m)]`, `bg-[var(--m-soft)]`, `text-[var(--m-ink)]`.
 *
 * Avantage : une seule source de vérité (globals.css), et le basculement
 * clair/sombre est géré par le CSS, pas par du JS.
 */
export function memberStyle(color: MemberColor): CSSProperties {
  return {
    "--m": `var(--member-${color})`,
    "--m-soft": `var(--member-${color}-soft)`,
    "--m-ink": `var(--member-${color}-ink)`,
  } as CSSProperties;
}

/** Libellés FR, utilisés à l'onboarding (« Choisis ta couleur »). */
export const MEMBER_COLOR_LABELS: Record<MemberColor, string> = {
  blue: "Bleu",
  green: "Vert",
  pink: "Rose",
  purple: "Violet",
  orange: "Orange",
  teal: "Turquoise",
  red: "Rouge",
  ochre: "Ocre",
};
