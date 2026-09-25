"use client";

import { useState, useTransition } from "react";
import { Bell } from "lucide-react";
import { setDigestPreference } from "@/actions/family";
import { cn } from "@/lib/utils";

/**
 * « Résumés du soir » — l'interrupteur.
 *
 * Le même réglage que le lien de désabonnement des emails, atteint par
 * l'autre bout. Il en faut deux : celui qui veut arrêter le fait
 * depuis le message qu'il a sous les yeux, celui qui veut reprendre ne
 * peut le faire que depuis l'application — par définition, il ne reçoit
 * plus rien où cliquer.
 */
export function DigestToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setError(null);
    // Optimiste : un interrupteur qui hésite donne l'impression de ne
    // pas avoir été entendu, et on rappuie (§70).
    setOn(next);
    startTransition(async () => {
      const result = await setDigestPreference(next);
      if (!result.ok) {
        setOn(!next);
        setError(result.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={toggle}
        disabled={pending}
        className="flex min-h-16 w-full items-center gap-3 rounded-casa-md border border-line bg-surface px-4 py-3 text-left shadow-casa-sm hover:border-line-strong"
      >
        <Bell
          size={20}
          strokeWidth={2}
          aria-hidden="true"
          className={on ? "shrink-0 text-accent" : "shrink-0 text-ink-3"}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium text-ink">
            Résumés du soir
          </span>
          <span className="block text-[0.8125rem] leading-snug text-ink-3">
            {on
              ? "Demain, et les moments où tout le monde est libre."
              : "Coupés. Les invitations continuent d’arriver."}
          </span>
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full transition-colors",
            on ? "bg-accent" : "bg-surface-3",
          )}
        >
          <span
            className={cn(
              "absolute top-1 h-5 w-5 rounded-full bg-white shadow-casa-sm transition-[left]",
              on ? "left-6" : "left-1",
            )}
          />
        </span>
      </button>

      {error && (
        <p role="alert" className="mt-2 text-[0.875rem] font-medium text-danger">
          {error}
        </p>
      )}
    </>
  );
}
