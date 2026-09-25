"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   Le bouton « Écouter », et le lecteur qui le remplace (§29).

   ```
   🔊 Écouter  →  Création de l'audio…  →  ▶ 0:00 ━━━━━━━ 1:21
   ```

   **Le fichier n'est demandé qu'au premier appui.** Générer l'audio à
   l'affichage coûterait un appel ElevenLabs par écran ouvert, pour une
   écoute sur dix — et pour un briefing, un appel au modèle en plus. Le
   bouton reste un bouton.

   **Il n'envoie jamais ce qu'il faut dire, seulement de quoi il
   s'agit** : l'identifiant d'un message, ou `aujourdhui` / `semaine`.
   Le texte est fabriqué côté serveur, à partir de données déjà masquées.
   Un client qui choisirait ce qui est prononcé rouvrirait par la voix ce
   que le masquage ferme à l'écrit (D36).
   ═══════════════════════════════════════════════════════════════ */

/**
 * Ce qu'on veut entendre.
 *
 * Deux formes, une seule règle : **jamais de texte**. Ce type est le
 * garde-fou le plus visible de D36 — y ajouter un jour un champ
 * `texte` sauterait aux yeux en relecture, ce qui est exactement le but.
 */
export type ListenSource =
  | { kind: "message"; messageId: string }
  | {
      kind: "briefing";
      quoi: "aujourdhui" | "semaine";
      /** Le jour visé, `AAAA-MM-JJ`. Absent : aujourd'hui. */
      jour?: string;
      /**
       * De QUI on veut entendre parler (D48) — jamais ce qu'il faut
       * dire. Absent : la maison, comme avant.
       */
      pour?: "maison" | "moi";
    };

export type ListenProps = {
  source: ListenSource;
  /** Le mot sur le bouton — « Écouter », « Écouter ma journée »… */
  label?: string;
  /**
   * `discret` sous une bulle de conversation, `carte` en haut d'un
   * écran d'agenda où c'est une action à part entière.
   */
  variant?: "discret" | "carte";
};

type State = "idle" | "loading" | "ready" | "error";

/** Où frapper, et ce qu'on annonce pendant l'attente. */
function requestFor(source: ListenSource) {
  if (source.kind === "message") {
    return {
      url: "/api/ia/voix",
      body: { messageId: source.messageId },
      // Le texte existe déjà : il ne reste qu'à le dire.
      busy: "Création de l’audio…",
    };
  }
  return {
    url: "/api/ia/voix/briefing",
    body: { quoi: source.quoi, jour: source.jour, pour: source.pour },
    /* Un briefing se fait **écrire** avant d'être dit, donc l'attente
       est plus longue et ne parle pas de la même chose. Annoncer
       « création de l'audio » pendant que le modèle rédige serait faux
       — et c'est précisément l'étape qui prend le plus de temps. */
    busy: "Casa AI prépare ton briefing…",
  };
}

/**
 * **Changer de sujet remonte le lecteur**, et ce n'est pas du zèle.
 *
 * La vue semaine navigue par `router.push` : la grille change, mais ce
 * composant garde sa place dans l'arbre, donc son état. Sans cette
 * `key`, on écoutait la semaine, on appuyait sur « semaine suivante »,
 * et le lecteur restait là avec l'audio de la **précédente** — prêt à
 * réciter la mauvaise semaine sans que rien ne le signale. Le
 * démontage, lui, met l'audio en pause : c'est déjà écrit plus bas.
 *
 * La `key` est calculée **ici**, pas au point d'appel : une `key` posée
 * à la main s'oublie, et le prochain écran qui portera ce bouton
 * héritera de la correction sans avoir à la connaître.
 */
export function Listen({ source, label = "Écouter", variant = "discret" }: ListenProps) {
  const call = requestFor(source);
  return (
    <Player
      key={`${call.url}|${JSON.stringify(call.body)}`}
      call={call}
      label={label}
      variant={variant}
    />
  );
}

function Player({
  call,
  label,
  variant,
}: {
  call: ReturnType<typeof requestFor>;
  label: string;
  variant: "discret" | "carte";
}) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [total, setTotal] = useState(0);

  const audio = useRef<HTMLAudioElement | null>(null);
  const enVie = useRef(true);
  const abandon = useRef<AbortController | null>(null);

  /* **Mettre l'audio en pause au démontage ne suffisait pas**, et le
     briefing l'a rendu visible : il met une dizaine de secondes à
     arriver (le modèle écrit, puis ElevenLabs parle). Pendant tout ce
     temps `audio.current` vaut encore `null` — l'élément n'est créé
     qu'après le `fetch` — donc le nettoyage ne mettait rien en pause.
     Quitter l'écran, ou simplement changer de semaine, laissait la
     requête finir dans le vide, puis `new Audio(...).play()` démarrait
     une voix **sans lecteur à l'écran pour l'arrêter**. Il fallait
     recharger la page.

     Deux verrous, parce qu'ils ne couvrent pas la même chose : le
     signal coupe la requête en vol, `enVie` empêche tout ce qui suit un
     `await` de s'exécuter dans un composant démonté. */
  useEffect(() => {
    enVie.current = true;
    const controleur = new AbortController();
    abandon.current = controleur;

    return () => {
      enVie.current = false;
      controleur.abort();
      audio.current?.pause();
    };
  }, []);

  async function fetchAndPlay() {
    setState("loading");
    setError(null);

    try {
      const response = await fetch(call.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(call.body),
        signal: abandon.current?.signal,
      });

      /* Session expirée : le proxy répond par une redirection vers
         `/connexion`, donc du HTML. Le lire comme du JSON donnerait une
         erreur incompréhensible à la place de la vraie. */
      if (response.redirected || !response.headers.get("content-type")?.includes("json")) {
        setState("error");
        return setError("Ta session a expiré. Recharge la page.");
      }

      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        setState("error");
        return setError(data.error ?? "La lecture a échoué.");
      }

      /* Le garde qui compte. `new Audio(...)` n'est pas dans le DOM :
         démonter le composant ne l'arrête pas, et rien à l'écran ne
         permettrait de le faire taire. On s'arrête donc avant de le
         créer. Un `setState` après démontage est un no-op silencieux en
         React 19 — il n'aurait rien empêché. */
      if (!enVie.current) return;

      const element = new Audio(data.url);
      audio.current = element;

      element.addEventListener("loadedmetadata", () => setTotal(element.duration));
      element.addEventListener("timeupdate", () => setAt(element.currentTime));
      element.addEventListener("ended", () => {
        setPlaying(false);
        setAt(0);
      });
      element.addEventListener("error", () => {
        setState("error");
        setError("Le fichier audio n’a pas pu être lu.");
      });

      setState("ready");

      /* La lecture automatique est traitée à part, et ce n'est pas du
         zèle : le navigateur peut la refuser parce que l'attente du
         `fetch` a consommé le geste de l'utilisateur — Safari sur
         iPhone est strict là-dessus, et c'est *le* navigateur de la
         maison. Un refus n'est pas une panne : le lecteur est là, il
         suffit d'appuyer sur lecture. Laisser ce cas tomber dans le
         `catch` d'à côté afficherait « Connexion perdue » et ferait
         disparaître le lecteur — un message faux et un écran cassé
         pour un comportement parfaitement normal. */
      try {
        await element.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } catch {
      // Requête coupée parce qu'on a quitté l'écran : ce n'est pas une
      // panne, et il n'y a plus personne pour lire le message.
      if (!enVie.current) return;
      setState("error");
      setError("Connexion perdue. Réessaie dans un instant.");
    }
  }

  function toggle() {
    const element = audio.current;
    if (!element) return;
    if (element.paused) {
      void element.play();
      setPlaying(true);
    } else {
      element.pause();
      setPlaying(false);
    }
  }

  function restart() {
    const element = audio.current;
    if (!element) return;
    element.currentTime = 0;
    void element.play();
    setPlaying(true);
  }

  const carte = variant === "carte";

  if (state === "idle" || state === "error") {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", carte ? "" : "mt-1.5 px-1")}>
        <button
          type="button"
          onClick={fetchAndPlay}
          className={cn(
            "flex items-center gap-2 font-semibold text-accent",
            carte
              ? /* Une action à part entière, pas un lien sous une bulle :
                   pleine largeur, une cible tactile confortable, et le
                   même vocabulaire visuel que « Trouver un moment ». */
                "min-h-tap w-full rounded-casa-md border border-accent/30 bg-surface px-3.5 text-[1rem] shadow-casa-sm transition-colors hover:border-accent/60"
              : "min-h-11 gap-1.5 rounded-casa px-2 text-[0.875rem]",
          )}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center",
              carte ? "h-9 w-9 rounded-full bg-accent-soft" : "",
            )}
          >
            <Volume2 size={carte ? 19 : 16} strokeWidth={2.4} aria-hidden="true" />
          </span>
          {state === "error" ? "Réessayer" : label}
        </button>
        {error && (
          <span role="alert" className="text-[0.8125rem] text-danger">
            {error}
          </span>
        )}
      </div>
    );
  }

  if (state === "loading") {
    return (
      <p
        role="status"
        className={cn(
          "flex items-center gap-2 text-ink-3",
          carte
            ? "min-h-tap rounded-casa-md border border-dashed border-line-strong px-3.5 text-[0.9375rem]"
            : "mt-1.5 min-h-11 px-2 text-[0.875rem]",
        )}
      >
        <Volume2
          size={carte ? 19 : 16}
          strokeWidth={2.4}
          aria-hidden="true"
          className="shrink-0 animate-pulse"
        />
        {call.busy}
      </p>
    );
  }

  const progress = total > 0 ? Math.min(100, (at / total) * 100) : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-casa-md border border-line bg-surface px-2.5 py-1.5",
        carte ? "" : "mt-1.5",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Mettre en pause" : "Reprendre la lecture"}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
      >
        {playing ? (
          <Pause size={18} strokeWidth={2.6} aria-hidden="true" />
        ) : (
          <Play size={18} strokeWidth={2.6} aria-hidden="true" />
        )}
      </button>

      <span className="w-9 shrink-0 text-[0.8125rem] tabular-nums text-ink-2">
        {clock(at)}
      </span>

      {/* Une barre de progression, pas un curseur : on ne se déplace
          pas dans trois phrases, on les réécoute. `progressbar` plutôt
          qu'un `input[type=range]` muet — ce n'est pas une commande. */}
      <div
        role="progressbar"
        aria-label="Progression"
        aria-valuemin={0}
        aria-valuemax={Math.round(total) || 0}
        aria-valuenow={Math.round(at)}
        className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>

      <span className="w-9 shrink-0 text-[0.8125rem] tabular-nums text-ink-3">
        {clock(total)}
      </span>

      <button
        type="button"
        onClick={restart}
        aria-label="Reprendre au début"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3"
      >
        <RotateCcw size={17} strokeWidth={2.4} aria-hidden="true" />
      </button>
    </div>
  );
}

/** `1:21`. `NaN` tant que les métadonnées ne sont pas chargées — on affiche `0:00`. */
function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
