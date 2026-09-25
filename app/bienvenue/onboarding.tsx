"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { MEMBER_COLORS, type MemberColor } from "@/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MEMBER_COLOR_LABELS, memberStyle } from "@/lib/design/member-color";
import { createFamily, updateProfile } from "@/actions/family";
import { cn } from "@/lib/utils";

type Step = "hello" | "name" | "color" | "ready";

export function Onboarding({
  initialName,
  initialColor,
}: {
  initialName: string;
  initialColor: MemberColor;
}) {
  const [step, setStep] = useState<Step>("hello");
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<MemberColor>(initialColor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  /* La proposition « connecte ton agenda » vient APRÈS la création du
     profil et de la maison, jamais avant : le consentement Google est
     une redirection pleine page qui effacerait le prénom et la couleur
     encore en mémoire, et tant que la maison n'existe pas, `/(app)`
     renvoie ici — on tournerait en rond.

     Et elle vit sur `/moi/agenda`, pas dans une étape de plus ici.
     `createFamily()` appelle `revalidatePath("/", "layout")`, ce qui
     fait re-rendre `/bienvenue` dans la réponse même de l'action ; or
     cette page redirige désormais vers `/aujourdhui` puisque la maison
     existe. Un `setStep()` s'appliquerait donc à un arbre déjà démonté,
     et l'écran ne serait jamais vu. Une navigation explicite est la
     seule chose qui survive à cette redirection. */
  function finish() {
    setError(null);
    startTransition(async () => {
      const profile = await updateProfile({ firstName: name, color });
      if (!profile.ok) return setError(profile.error);

      const family = await createFamily();
      if (!family.ok) return setError(family.error);

      router.replace("/moi/agenda?bienvenue=1");
    });
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-12 safe-t safe-b">
      {/* Pas d'`AnimatePresence mode="wait"` ici : il ne monte l'étape
          suivante qu'une fois l'animation de sortie terminée. Or dans un
          onglet en arrière-plan le navigateur suspend les frames, et
          l'onboarding resterait bloqué sur l'écran d'accueil. Une simple
          animation d'entrée, rejouée au changement de `key`, ne dépend
          de rien. */}
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
          {step === "hello" && (
            <section className="text-center">
              <p className="text-5xl" aria-hidden="true">🏡</p>
              <h1 className="mt-5 font-display text-[2rem] font-semibold leading-tight tracking-tight text-ink">
                Bienvenue à Casa&nbsp;Liva
              </h1>
              <p className="mt-3 text-[1.0625rem] leading-relaxed text-ink-2">
                Ici, on sait enfin qui fait quoi.
              </p>
              <Button
                size="lg"
                block
                className="mt-9"
                onClick={() => setStep("name")}
              >
                Commencer
              </Button>
            </section>
          )}

          {step === "name" && (
            <section>
              <h1 className="font-display text-[1.75rem] font-semibold text-ink">
                Qui es-tu&nbsp;?
              </h1>
              <p className="mt-2 text-[0.9375rem] text-ink-2">
                Ton prénom suffit. C’est ce que les autres verront.
              </p>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim()) setStep("color");
                }}
                placeholder="Jonathan"
                aria-label="Ton prénom"
                autoComplete="given-name"
                className="mt-6 h-14 w-full rounded-casa-md border border-line bg-surface px-4 text-base text-ink shadow-casa-sm placeholder:text-ink-3"
              />
              <Button
                size="lg"
                block
                className="mt-4"
                disabled={!name.trim()}
                onClick={() => setStep("color")}
              >
                Continuer
              </Button>
            </section>
          )}

          {step === "color" && (
            <section>
              <h1 className="font-display text-[1.75rem] font-semibold text-ink">
                Choisis ta couleur
              </h1>
              <p className="mt-2 text-[0.9375rem] text-ink-2">
                C’est comme ça qu’on te reconnaîtra d’un coup d’œil dans
                l’agenda.
              </p>

              <div className="mt-7 flex justify-center">
                <Avatar
                  member={{ firstName: name || "Toi", color, avatar: name || "toi" }}
                  size="xl"
                />
              </div>

              <div className="mt-7 flex flex-wrap justify-center gap-3">
                {MEMBER_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    style={memberStyle(c)}
                    aria-label={MEMBER_COLOR_LABELS[c]}
                    aria-pressed={c === color}
                    className={cn(
                      "tap flex items-center justify-center rounded-full transition-transform",
                      c === color
                        ? "ring-2 ring-accent ring-offset-2 ring-offset-bg"
                        : "hover:scale-105",
                    )}
                  >
                    <span className="h-11 w-11 rounded-full bg-[var(--m)]" />
                  </button>
                ))}
              </div>

              <Button size="lg" block className="mt-8" onClick={() => setStep("ready")}>
                C’est celle-là
              </Button>
            </section>
          )}

          {step === "ready" && (
            <section className="text-center">
              <p className="text-5xl" aria-hidden="true">✨</p>
              <h1 className="mt-5 font-display text-[1.875rem] font-semibold leading-tight text-ink">
                On crée ta maison&nbsp;?
              </h1>
              <p className="mt-3 text-[1rem] leading-relaxed text-ink-2">
                Tu pourras y inviter qui tu veux ensuite.
              </p>
              {/* Quelqu'un qui a reçu un lien d'invitation n'a rien à
                  créer : il doit ouvrir son lien. Le dire ici est le
                  seul garde-fou possible — le champ email d'une
                  invitation ne correspond pas toujours à l'adresse
                  réellement utilisée, on ne peut donc pas deviner. */}
              <p className="mt-4 rounded-casa-md border border-line bg-surface-2 px-4 py-3 text-[0.875rem] leading-relaxed text-ink-2">
                Quelqu’un t’a envoyé un lien pour rejoindre sa maison&nbsp;?
                <strong className="text-ink"> Ouvre plutôt ce lien</strong> —
                sinon tu te retrouveras dans une maison à part.
              </p>

              {error && (
                <p role="alert" className="mt-4 text-[0.875rem] font-medium text-danger">
                  {error}
                </p>
              )}

              <Button size="lg" block className="mt-8" disabled={pending} onClick={finish}>
                {pending ? "Un instant…" : "Créer ma maison"}
              </Button>
            </section>
          )}

      </motion.div>
    </div>
  );
}
