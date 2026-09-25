"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Share2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { inviteMember } from "@/actions/family";

export function InviteButton() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setOpen(false);
    setEmail("");
    setLink(null);
    setCopied(false);
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await inviteMember(email);
      if (!result.ok) return setError(result.error);
      setLink(result.link);
    });
  }

  /* Deux gestes distincts, et c'est voulu.

     Il n'y avait qu'un bouton « Partager le lien » qui basculait sur
     le presse-papier quand le partage natif n'existait pas. Sur
     ordinateur il copiait donc, mais son libellé parlait de partage :
     personne ne devinait qu'on pouvait simplement coller le lien
     ailleurs. */
  async function share() {
    if (!link) return;
    // Sur téléphone, la feuille de partage native est le chemin le plus
    // court vers WhatsApp ou les SMS — c'est là que les invitations
    // circulent réellement dans une famille.
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Casa Liva",
          text: "Rejoins-nous sur Casa Liva",
          url: link,
        });
        return;
      } catch {
        // Partage refusé : on ne fait rien, « Copier » reste là.
      }
      return;
    }
    await copy();
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  }

  return (
    <>
      <Button variant="secondary" block onClick={() => setOpen(true)}>
        <UserPlus size={18} strokeWidth={2.2} aria-hidden="true" />
        Inviter quelqu’un
      </Button>

      <Sheet open={open} onClose={reset} title="Inviter quelqu’un">
        <div className="px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2">
          {link ? (
            <>
              <h2 className="text-[1.25rem] font-bold text-ink">
                Voilà le lien
              </h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
                Envoie-le à <strong>{email}</strong>. Il vaut deux semaines, et
                ne sert qu’une fois.
              </p>
              <p className="mt-4 break-all rounded-casa border border-line bg-surface-2 px-3.5 py-3 font-mono text-[0.8125rem] text-ink-2">
                {link}
              </p>
              <Button size="lg" block className="mt-4" onClick={share}>
                <Share2 size={18} strokeWidth={2.2} aria-hidden="true" />
                Envoyer le lien
              </Button>
              <Button variant="secondary" block className="mt-2" onClick={copy}>
                {copied ? (
                  <>
                    <Check size={18} strokeWidth={2.4} aria-hidden="true" />
                    Copié&nbsp;!
                  </>
                ) : (
                  <>
                    <Copy size={18} strokeWidth={2.2} aria-hidden="true" />
                    Copier le lien
                  </>
                )}
              </Button>
              <Button variant="ghost" block className="mt-2" onClick={reset}>
                Terminé
              </Button>
            </>
          ) : (
            <>
              <h2 className="text-[1.25rem] font-bold text-ink">
                Qui rejoint la maison&nbsp;?
              </h2>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">
                Son adresse email suffit. On te donnera un lien à lui envoyer.
              </p>
              <input
                autoFocus
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && email.includes("@")) submit();
                }}
                placeholder="papa@email.fr"
                aria-label="Adresse email"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="mt-4 h-14 w-full rounded-casa-md border border-line bg-surface px-4 text-base text-ink shadow-casa-sm placeholder:text-ink-3"
              />
              {error && (
                <p role="alert" className="mt-3 text-[0.875rem] font-medium text-danger">
                  {error}
                </p>
              )}
              <Button
                size="lg"
                block
                className="mt-4"
                disabled={pending || !email.includes("@")}
                onClick={submit}
              >
                {pending ? "Un instant…" : "Créer l’invitation"}
              </Button>
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
