"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   Le micro — on appuie, on parle, on appuie (§30-33, D39).

   ```
   🎤        →   ⏹ 0:04 « j'écoute… »   →   le texte dans le champ
   ```

   **Le transcript va dans le champ de saisie, il ne part pas tout
   seul.** C'est une règle écrite deux fois avant que ce composant
   existe (D22, et le ticket) : sans le texte sous les yeux, on ne peut
   pas savoir si l'erreur vient du micro ou de la compréhension — deux
   pannes, deux corrections différentes. Et une personne âgée qui voit
   « qui est libre semedi » corrige un mot ; elle ne recommence pas
   toute sa phrase.

   **Appui / appui, pas appui maintenu**, et ce n'est pas le double
   appui que le projet interdit (§48) : ce sont deux actions distinctes,
   chacune étiquetée, avec un état visible entre les deux. L'appui
   maintenu, lui, fait surgir le menu contextuel d'iOS, exige une
   immobilité pénible, et perd tout l'enregistrement si le doigt glisse.
   ═══════════════════════════════════════════════════════════════ */

type State = "repos" | "ecoute" | "transcription" | "erreur";

/**
 * Les formats à essayer, dans l'ordre.
 *
 * **Jamais `audio/webm` en dur.** Jusqu'à iOS 18.3 inclus, Safari
 * n'enregistre qu'en `audio/mp4` — et c'est *le* navigateur de la
 * maison. Un format écrit d'avance marche sur le Chrome du poste de
 * développement et échoue sur le téléphone de Mamie, ce qui est la pire
 * façon de le découvrir. ElevenLabs accepte les deux, donc les deux
 * branches passent.
 */
const FORMATS = [
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/webm;codecs=opus",
  "audio/webm",
];

/** Au-delà, on coupe : le micro qu'on oublie ouvert se facture à la seconde. */
const MAX_SECONDS = 60;

/** En deçà, ce n'est pas une phrase, c'est un doigt qui a glissé. */
const MIN_SECONDS = 0.4;

export function MicButton({
  onTexte,
  disabled,
  invite = false,
}: {
  /** Ce qui a été entendu — à poser dans le champ, pas à envoyer. */
  onTexte: (texte: string) => void;
  disabled?: boolean;
  /**
   * On vient d'arriver en ayant choisi « Dire à voix haute » (D49) :
   * le bouton se signale, pour qu'on n'ait pas à le chercher dans une
   * barre qu'on découvre. Il ne s'ouvre pas tout seul — Safari iOS
   * refuse `getUserMedia` hors de la foulée d'un geste, et une
   * navigation n'en est pas un.
   */
  invite?: boolean;
}) {
  const [state, setState] = useState<State>("repos");
  const [error, setError] = useState<string | null>(null);
  const [secondes, setSecondes] = useState(0);

  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const morceaux = useRef<Blob[]>([]);
  const debut = useRef(0);
  const enVie = useRef(true);

  /**
   * Couper les pistes, et pas seulement arrêter l'enregistreur.
   *
   * `MediaStream` n'a pas de `stop()` : sans cette boucle, la pastille
   * orange de l'iPhone **reste allumée** après la question. Une app
   * d'agenda qui a l'air d'écouter en permanence se fait désinstaller,
   * et on ne saura jamais pourquoi.
   */
  const fermerLeMicro = useCallback(() => {
    stream.current?.getTracks().forEach((piste) => piste.stop());
    stream.current = null;
  }, []);

  /* Le filet : quitter l'écran, changer d'onglet, recevoir un appel.
     Sans ce nettoyage, le micro reste ouvert sur un composant démonté —
     et il n'y a alors plus rien à l'écran pour le refermer. */
  useEffect(() => {
    enVie.current = true;
    return () => {
      enVie.current = false;
      const rec = recorder.current;
      if (rec && rec.state !== "inactive") rec.stop();
      fermerLeMicro();
    };
  }, [fermerLeMicro]);

  /* Le chrono, et l'arrêt de sécurité. Un `setInterval` plutôt qu'une
     animation : c'est une donnée, pas un effet visuel, et il faut
     pouvoir couper à la minute même si l'onglet est en arrière-plan. */
  useEffect(() => {
    if (state !== "ecoute") return;

    const tic = setInterval(() => {
      const passe = (Date.now() - debut.current) / 1000;
      setSecondes(Math.floor(passe));
      if (passe >= MAX_SECONDS) recorder.current?.stop();
    }, 250);

    return () => clearInterval(tic);
  }, [state]);

  async function envoyer(audio: Blob, duree: number) {
    /* Un appui trop bref ne part pas chez ElevenLabs : c'est un
       aller-retour pour rien, et la réponse serait une erreur technique
       là où il faut une phrase qui donne envie de recommencer. */
    if (duree < MIN_SECONDS || audio.size === 0) {
      setState("erreur");
      return setError("Appuie, parle, puis appuie à nouveau.");
    }

    setState("transcription");
    setError(null);

    try {
      const corps = new FormData();
      corps.append("audio", audio, "question");

      const response = await fetch("/api/ia/transcription", {
        method: "POST",
        body: corps,
      });

      /* Session expirée : le proxy répond par une redirection vers
         `/connexion`, donc du HTML. Le lire comme du JSON donnerait une
         erreur incompréhensible à la place de la vraie. Même parade que
         le chat et que le lecteur. */
      if (response.redirected || !response.headers.get("content-type")?.includes("json")) {
        setState("erreur");
        return setError("Ta session a expiré. Recharge la page.");
      }

      const data = (await response.json()) as { text?: string; error?: string };

      if (!enVie.current) return;

      if (!response.ok || !data.text) {
        setState("erreur");
        return setError(data.error ?? "Je n’ai pas réussi à t’entendre.");
      }

      setState("repos");
      onTexte(data.text);
    } catch {
      if (!enVie.current) return;
      setState("erreur");
      setError("Connexion perdue. Réessaie dans un instant.");
    }
  }

  async function commencer() {
    setError(null);

    /* `navigator.mediaDevices` est **absent** hors contexte sécurisé —
       ce n'est pas un refus de permission, c'est une propriété qui
       n'existe pas. Sans cette garde, on obtient un `TypeError` et on
       cherche pendant une heure un problème d'autorisation qui n'existe
       pas. Le cas se produit dès qu'on essaie depuis un téléphone sur
       `http://192.168.…` : il faut une Preview Vercel, en https. */
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("erreur");
      return setError("Le micro a besoin d’une connexion sécurisée (https).");
    }

    let capte: MediaStream;
    try {
      /* **La permission se demande ici, au premier appui — jamais au
         chargement de la page.** Une demande qui surgit devant quelqu'un
         venu lire son agenda récolte un refus réflexe, et ce refus-là
         est durable : il faut ensuite le défaire dans les réglages du
         téléphone. */
      capte = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (raison) {
      setState("erreur");
      const nom = raison instanceof DOMException ? raison.name : "";

      /* On ne consulte pas `navigator.permissions` pour deviner l'état :
         Safari y répond « prompt » même après un refus définitif, par
         choix anti-empreinte. Un écran bâti là-dessus dirait
         éternellement « appuie pour autoriser » à quelqu'un dont le
         refus est gravé. Le seul signal vrai est ce rejet-ci — et comme
         il ne dit pas si le refus est ponctuel ou définitif, le message
         doit couvrir les deux. */
      if (nom === "NotAllowedError" || nom === "SecurityError") {
        return setError(
          "Casa Liva n’a pas le droit d’utiliser le micro. Autorise-le pour ce site dans les réglages de ton navigateur.",
        );
      }
      if (nom === "NotFoundError" || nom === "OverconstrainedError") {
        return setError("Je ne trouve pas de micro sur cet appareil.");
      }
      return setError("Le micro n’a pas voulu démarrer. Réessaie ?");
    }

    if (!enVie.current) {
      capte.getTracks().forEach((piste) => piste.stop());
      return;
    }

    stream.current = capte;
    morceaux.current = [];

    const mimeType = FORMATS.find((f) => MediaRecorder.isTypeSupported(f));
    // Sans option, le navigateur choisit ce qu'il sait faire — dernier
    // recours volontairement permissif plutôt qu'un échec net.
    const rec = mimeType ? new MediaRecorder(capte, { mimeType }) : new MediaRecorder(capte);
    recorder.current = rec;

    rec.addEventListener("dataavailable", (e) => {
      if (e.data.size > 0) morceaux.current.push(e.data);
    });

    rec.addEventListener("stop", () => {
      /* **Les pistes se coupent ici, pas avant.** Les fermer avant
         l'arrêt de l'enregistreur prive le dernier `dataavailable` de sa
         matière : la fin de la phrase disparaît, et sur une question
         courte c'est tout l'enregistrement. */
      fermerLeMicro();

      const duree = (Date.now() - debut.current) / 1000;
      const audio = new Blob(morceaux.current, {
        type: rec.mimeType || morceaux.current[0]?.type || "audio/webm",
      });
      morceaux.current = [];

      if (!enVie.current) return;
      void envoyer(audio, duree);
    });

    /* `start()` **sans découpage temporel**. Sur Safari iOS,
       `dataavailable` ne se déclenche qu'une seule fois, à l'arrêt,
       quel que soit le `timeslice` demandé : un envoi au fil de l'eau
       testé sur Chrome donnerait l'illusion de marcher et ne recevrait
       jamais son premier morceau sur le téléphone de la maison. */
    debut.current = Date.now();
    setSecondes(0);
    setState("ecoute");
    rec.start();
  }

  function arreter() {
    const rec = recorder.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  const ecoute = state === "ecoute";
  const occupe = state === "transcription";

  return (
    <>
      <button
        type="button"
        onClick={ecoute ? arreter : commencer}
        disabled={disabled || occupe}
        aria-pressed={ecoute}
        aria-label={ecoute ? "J’ai fini de parler" : "Poser ma question à voix haute"}
        className={cn(
          // 48×48, la cible du projet (§48) — et pas les 44 px du bouton
          // d'envoi, qui datent de la phase 1. C'est le geste le plus
          // difficile à viser : on l'appuie deux fois, souvent d'une main.
          "flex min-h-tap min-w-tap shrink-0 items-center justify-center rounded-full transition-colors",
          ecoute
            ? "bg-danger text-white"
            : invite
              // Arrivé par « Dire à voix haute » : le bouton se montre.
              ? "bg-magic-soft text-magic ring-2 ring-magic disabled:opacity-45"
              : "bg-surface-2 text-ink-2 hover:text-ink disabled:opacity-45",
        )}
      >
        {ecoute ? (
          <Square size={17} strokeWidth={2.8} aria-hidden="true" fill="currentColor" />
        ) : (
          <Mic size={20} strokeWidth={2.3} aria-hidden="true" />
        )}
      </button>

      {/* Hors de la rangée de saisie : un état qui pousse les boutons
          en changeant de largeur fait rater le bouton qu'on visait. */}
      {(ecoute || occupe || error) && (
        <p
          role={error ? "alert" : "status"}
          className={cn(
            /* Ancré par le **bas** (`bottom-full`), pas par le haut. Avec
               un décalage fixe vers le haut, une phrase qui passe sur
               deux lignes grandit vers le bas et recouvre le champ de
               saisie — mesuré à 42 px de chevauchement sur un écran de
               375 px, soit le message d'erreur posé sur le bouton qu'il
               demande de réessayer. */
            "absolute inset-x-0 bottom-full mx-auto mb-2 w-fit max-w-full rounded-casa px-3 py-1.5 text-center text-[0.875rem] font-medium shadow-casa-sm",
            error ? "bg-danger-soft text-danger" : "bg-bg-elevated text-ink-2",
          )}
        >
          {error ??
            (ecoute
              ? `J’écoute… ${clock(secondes)}`
              : "Je mets ça par écrit…")}
        </p>
      )}
    </>
  );
}

/** `0:04` — le chrono de l'enregistrement. */
function clock(secondes: number): string {
  const m = Math.floor(secondes / 60);
  const s = secondes % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
