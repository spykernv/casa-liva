import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export type PageHeaderProps = {
  /** Titre principal de l'écran — « Lundi 3 août », « Casa », … */
  title: string;
  subtitle?: string;
  /** Actions à droite du titre (écouter, changer de semaine…). */
  actions?: ReactNode;
  /** Affiche le nom du produit au-dessus du titre. */
  brand?: boolean;
  /** Retour vers l'écran parent, pour les sous-pages. */
  back?: { href: string; label: string };
  /**
   * Rendu **à l'intérieur** de l'en-tête collant, sous le titre.
   *
   * C'est ce qui garantit qu'il n'y a qu'UN élément collant à l'écran.
   * `/semaine` en avait deux : celui-ci en `top-0`, et les en-têtes de
   * jour en `top-[5.5rem]` — 88 px, alors que l'en-tête réel en mesure
   * ~104. Les jours passaient donc **sous** le titre sur une quinzaine
   * de pixels, plus toute l'encoche en application installée. C'est le
   * « l'événement de 7 h déborde sur les en-têtes » de la recette du
   * 5 août. Un second `sticky top-[Xrem]` est un nombre qui devient
   * faux dès qu'on ajoute une ligne au titre : on supprime la notion
   * plutôt que de recalculer le nombre.
   */
  below?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  subtitle,
  actions,
  brand = true,
  back,
  below,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b border-line/70 bg-bg/88 px-4 pb-3 backdrop-blur-xl safe-t",
        className,
      )}
    >
      {back && (
        // Texte, pas seulement une flèche : une icône seule ne dit pas
        // où l'on retourne, et reste illisible pour qui ne connaît pas
        // la convention (§48).
        <Link
          href={back.href}
          className="-ml-2 mt-1 inline-flex min-h-tap items-center gap-0.5 pr-3 text-[0.9375rem] font-medium text-ink-2 hover:text-ink"
        >
          <ChevronLeft size={20} strokeWidth={2.2} aria-hidden="true" />
          {back.label}
        </Link>
      )}
      {/* 16 px et non 15 : `AGENTS.md` pose un plancher à 16 px, et la
          marque comme le sous-titre passaient dessous. Ils étaient les
          deux seuls de la coquille. */}
      {brand && (
        <p className="pt-3 font-display text-[1rem] font-semibold tracking-tight text-accent">
          Casa Liva
        </p>
      )}
      <div
        className={cn(
          "flex items-end justify-between gap-3",
          brand ? "mt-0.5" : back ? "pt-0.5" : "pt-3",
        )}
      >
        <div className="min-w-0">
          <h1 className="truncate text-[1.5rem] font-bold leading-tight tracking-tight text-ink">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 truncate text-[1rem] text-ink-2">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {below}
    </header>
  );
}
