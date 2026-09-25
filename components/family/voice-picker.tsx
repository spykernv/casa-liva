"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Loader2, Pause, Play } from "lucide-react";
import { VOICES } from "@/lib/voice/voices";
import { setVoicePreference } from "@/actions/family";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   « La voix de Casa AI » — on l'écoute avant de la prendre.

   **Deux gestes séparés, et c'est tout le sujet.** Le triangle fait
   entendre cinq secondes ; le nom choisit. On peut donc écouter les
   quatre d'affilée, puis trancher — alors qu'un sélecteur qui
   enregistre au moment où l'on écoute obligerait à choisir avant
   d'avoir entendu.

   Le choix, lui, s'enregistre tout seul : c'est un réglage, pas un
   formulaire. Un bouton « Enregistrer » de plus pour un réglage qui
   se voit immédiatement serait une étape pour rien (§3).
   ═══════════════════════════════════════════════════════════════ */

export function VoicePicker({ initial }: { initial: string }) {
  const [chosen, setChosen] = useState(initial);
  const [loading, setLoading] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const audio = useRef<HTMLAudioElement | null>(null);

  // Une voix qui continue de parler après qu'on a quitté l'écran, ou
  // deux voix qui se répondent en même temps : les deux se corrigent ici.
  useEffect(() => () => audio.current?.pause(), []);

  function stop() {
    audio.current?.pause();
    audio.current = null;
    setPlaying(null);
  }

  async function preview(voiceId: string) {
    if (playing === voiceId) return stop();
    stop();

    setError(null);
    setLoading(voiceId);

    try {
      const response = await fetch("/api/ia/voix/apercu", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ voiceId }),
      });

      if (response.redirected || !response.headers.get("content-type")?.includes("json")) {
        return setError("Ta session a expiré. Recharge la page.");
      }

      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        return setError(data.error ?? "L’aperçu n’a pas pu être créé.");
      }

      const element = new Audio(data.url);
      audio.current = element;
      element.addEventListener("ended", () => setPlaying(null));

      /* Un refus de lecture automatique n'est pas une panne : Safari
         sur iPhone peut considérer que l'attente du `fetch` a consommé
         le geste. On le dit plutôt que de laisser un triangle qui ne
         fait rien — c'est la leçon de JON-54, appliquée d'emblée. */
      try {
        await element.play();
        setPlaying(voiceId);
      } catch {
        setError("Appuie encore une fois : le navigateur attend un geste.");
      }
    } catch {
      setError("Connexion perdue. Réessaie dans un instant.");
    } finally {
      setLoading(null);
    }
  }

  function choose(voiceId: string) {
    if (voiceId === chosen) return;
    const previous = chosen;

    setError(null);
    // Optimiste : un réglage qui hésite donne l'impression de ne pas
    // avoir été entendu, et on rappuie (§70).
    setChosen(voiceId);

    startTransition(async () => {
      const result = await setVoicePreference(voiceId);
      if (!result.ok) {
        setChosen(previous);
        setError(result.error);
      }
    });
  }

  return (
    <section className="px-4 pt-8">
      <h3 className="pb-2.5 text-[0.8125rem] font-bold uppercase tracking-wide text-ink-3">
        La voix de Casa AI
      </h3>

      <div
        role="radiogroup"
        aria-label="La voix de Casa AI"
        className="overflow-hidden rounded-casa-md border border-line bg-surface shadow-casa-sm"
      >
        {VOICES.map((voice, index) => {
          const on = chosen === voice.id;
          return (
            <div
              key={voice.id}
              className={cn(
                "flex items-center gap-1 pr-3",
                index > 0 && "border-t border-line",
                on && "bg-accent-soft/40",
              )}
            >
              <button
                type="button"
                onClick={() => preview(voice.id)}
                disabled={loading !== null}
                aria-label={
                  playing === voice.id
                    ? `Arrêter l’aperçu de ${voice.name}`
                    : `Écouter ${voice.name}`
                }
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-accent disabled:opacity-45"
              >
                {loading === voice.id ? (
                  <Loader2 size={19} strokeWidth={2.4} aria-hidden="true" className="animate-spin" />
                ) : playing === voice.id ? (
                  <Pause size={19} strokeWidth={2.6} aria-hidden="true" />
                ) : (
                  <Play size={19} strokeWidth={2.6} aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => choose(voice.id)}
                className="flex min-h-16 flex-1 items-center gap-3 py-2.5 pr-1 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem] font-medium text-ink">
                    {voice.name}
                  </span>
                  <span className="block text-[0.8125rem] leading-snug text-ink-3">
                    {voice.description}
                  </span>
                </span>
                {on && (
                  <Check
                    size={19}
                    strokeWidth={2.8}
                    aria-hidden="true"
                    className="shrink-0 text-accent"
                  />
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-2 px-1 text-[0.8125rem] leading-snug text-ink-3">
        Le triangle fait écouter, le nom choisit. Ce réglage n’appartient qu’à
        toi&nbsp;: chacun ici peut avoir la sienne.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-[0.875rem] font-medium text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
