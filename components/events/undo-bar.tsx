"use client";

import { useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

const VISIBLE_MS = 7000;

/* ═══════════════════════════════════════════════════════════════
   « Supprimé — Annuler », et c'est la seule barre du projet.

   Le plan l'exige après toute suppression, tout déplacement et toute
   modification (§49). C'est aussi ce qui permet de rendre la
   suppression immédiate : sans filet, il faudrait une boîte de
   confirmation, et une confirmation de plus à chaque geste finit par
   ne plus être lue.

   **Il y en avait deux, qui ne partageaient rien** — celle-ci, montée
   sur `day-board` et `week-board`, et une refaite à la main dans
   `moment-results.tsx`. Deux barres, c'est deux endroits où corriger
   un défaut, et un seul où on pense à le faire. JON-66 en garde une,
   et la rend assez générale pour porter aussi bien une suppression
   qu'une création qu'on regrette.
   ═══════════════════════════════════════════════════════════════ */

export type UndoBarProps = {
  /** Ce qui s'est passé, dit à la personne. Null = rien à annuler. */
  label: string | null;
  /** Ce que fait « Annuler ». Doit être idempotent côté appelant. */
  onUndo: () => Promise<void> | void;
  onDismiss: () => void;
  /** Un « Voir » facultatif — utile quand l'événement créé est loin. */
  href?: string;
  /** Le libellé du lien, si `href` est fourni. */
  hrefLabel?: string;
};

export function UndoBar({
  label,
  onUndo,
  onDismiss,
  href,
  hrefLabel = "Voir",
}: UndoBarProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!label) return;
    const timer = setTimeout(onDismiss, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [label, onDismiss]);

  return (
    <AnimatePresence>
      {label && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.2 }}
          role="status"
          className={cn(
            "fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40",
            "mx-auto flex max-w-sm items-center gap-3 rounded-casa-md bg-ink px-4 py-3",
            "shadow-casa-lg md:bottom-8",
          )}
        >
          <span className="flex-1 truncate text-[0.9375rem] font-medium text-ink-inverse">
            {label}
          </span>

          {href && (
            <Link
              href={href}
              className="shrink-0 rounded-casa-sm px-1 py-1 text-[0.9375rem] font-semibold text-ink-inverse/70"
            >
              {hrefLabel}
            </Link>
          )}

          <button
            type="button"
            onClick={() =>
              startTransition(async () => {
                await onUndo();
                onDismiss();
                router.refresh();
              })
            }
            disabled={pending}
            /* `.tap` : « Annuler » faisait ~31 px de haut, sous la
               barre des 48 — et c'est le bouton le plus important de la
               barre, celui qu'on vise vite et souvent d'une main.
               `-mr-1` reprend la marge pour que rien ne bouge. */
            className="tap -mr-1 flex shrink-0 items-center justify-center rounded-casa-sm px-2 text-[0.9375rem] font-bold text-accent disabled:opacity-60"
          >
            {pending ? "…" : "Annuler"}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
