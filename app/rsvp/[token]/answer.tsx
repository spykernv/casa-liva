"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import type { ParticipantStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { answerByToken } from "@/actions/rsvp";

/**
 * Les deux boutons, et ce qu'ils répondent.
 *
 * Le statut affiché part de celui qui est en base, pas de `?r=` : ce
 * qui compte, c'est ce qui est enregistré. Le paramètre de l'URL ne
 * fait que **souligner** le bouton qu'on avait en tête en cliquant
 * dans l'email — il ne préremplit rien, et surtout il n'engage rien
 * tant qu'on n'a pas appuyé.
 */
export function RsvpAnswer({
  token,
  current,
  hinted,
}: {
  token: string;
  current: ParticipantStatus;
  hinted?: ParticipantStatus;
}) {
  const [status, setStatus] = useState<ParticipantStatus>(current);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function answer(next: ParticipantStatus) {
    setError(null);
    startTransition(async () => {
      const result = await answerByToken(token, next);
      if (!result.ok) return setError(result.error);
      setStatus(next);
      setSaved(true);
    });
  }

  return (
    <div className="mt-6">
      <div className="flex gap-2">
        <Button
          size="lg"
          block
          variant={status === "accepted" ? "primary" : "secondary"}
          disabled={pending}
          onClick={() => answer("accepted")}
          className={
            hinted === "accepted" && !saved ? "ring-2 ring-accent/40" : undefined
          }
        >
          <Check size={19} strokeWidth={2.4} aria-hidden="true" />
          Je viens
        </Button>
        <Button
          size="lg"
          block
          variant={status === "declined" ? "danger" : "secondary"}
          disabled={pending}
          onClick={() => answer("declined")}
          className={
            hinted === "declined" && !saved ? "ring-2 ring-accent/40" : undefined
          }
        >
          <X size={19} strokeWidth={2.4} aria-hidden="true" />
          Pas dispo
        </Button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-center text-[0.875rem] font-medium text-danger">
          {error}
        </p>
      )}

      {saved && !error && (
        <p
          role="status"
          className="mt-4 rounded-casa border border-success/30 bg-success-soft px-4 py-3 text-center text-[0.9375rem] leading-relaxed text-ink"
        >
          {status === "accepted"
            ? "C’est noté, tu es sur la liste."
            : "C’est noté. Tout le monde saura que tu n’es pas là."}
          <span className="mt-0.5 block text-[0.8125rem] text-ink-2">
            Tu peux encore changer d’avis&nbsp;: appuie sur l’autre bouton.
          </span>
        </p>
      )}

      {!saved && status !== "pending" && (
        <p className="mt-3 text-center text-[0.875rem] text-ink-3">
          {status === "accepted"
            ? "Tu avais déjà dit que tu venais."
            : "Tu avais déjà dit que tu n’étais pas dispo."}
        </p>
      )}
    </div>
  );
}
