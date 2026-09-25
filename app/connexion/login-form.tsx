"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendMagicLink, type LoginState } from "./actions";

const INITIAL: LoginState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" block disabled={pending}>
      {pending ? "Envoi…" : "Recevoir mon lien"}
    </Button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(sendMagicLink, INITIAL);

  if (state.status === "sent") {
    return (
      <div className="rounded-casa-lg border border-line bg-surface p-6 text-center shadow-casa-sm">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
          <MailCheck size={26} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-[1.125rem] font-bold text-ink">
          Regarde tes emails
        </h2>
        <p className="mx-auto mt-2 max-w-xs text-[0.9375rem] leading-relaxed text-ink-2">
          On vient d’envoyer un lien à <strong>{state.email}</strong>. Un clic
          dessus et tu es dans la maison.
        </p>
        {/* ── Deux raisons de ne rien recevoir, et il faut les dire ──
            Depuis JON-81, une adresse sans compte ni invitation ne
            reçoit rien — et rend pourtant cet écran, pour que la page
            ne devienne pas un annuaire d'adresses. Quelqu'un qui s'est
            trompé de lettre attendrait donc un lien qui ne partira
            jamais. Le lui dire ici est le seul endroit où ça ne
            renseigne personne : la phrase est la même pour tous. */}
        <p className="mx-auto mt-4 max-w-xs text-[0.8125rem] leading-relaxed text-ink-3">
          Rien reçu&nbsp;? Regarde dans les spams — c’est presque toujours là.
          Et vérifie l’adresse&nbsp;: Casa&nbsp;Liva n’écrit qu’aux habitants
          et aux personnes invitées.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="suite" value={next} />

      <label htmlFor="email" className="sr-only">
        Ton adresse email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="ton@email.fr"
        aria-invalid={state.status === "error"}
        className="h-14 w-full rounded-casa-md border border-line bg-surface px-4 text-base text-ink shadow-casa-sm placeholder:text-ink-3"
      />

      {state.status === "error" && (
        <p role="alert" className="text-[0.875rem] font-medium text-danger">
          {state.message}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
