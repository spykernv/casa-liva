"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, MoreVertical } from "lucide-react";
import { detecterPlateforme, estInstallee, type Plateforme } from "@/lib/pwa";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   Le guide d'installation, pas à pas (JON-18).

   **Pourquoi une page entière et pas une bulle.** Le blocage sur iOS
   n'est pas « quel bouton » — c'est « où, dans la liste qui s'ouvre ».
   La feuille de partage de Safari contient une douzaine de lignes, et
   « Sur l'écran d'accueil » est plus bas que ce qu'on voit. Deux icônes
   dessinées ne montrent pas ça ; une maquette d'écran, si.

   Et une page a une **adresse**. « Va sur casaliva.app/installer » se
   dit au téléphone à quelqu'un qui n'y arrive pas — ce qui est le cas
   d'usage réel dans une famille.

   Les deux plateformes sont montrées, pas seulement la sienne : c'est
   souvent quelqu'un d'autre qui aide, depuis un autre appareil.
   ═══════════════════════════════════════════════════════════════ */

function IconePartageIOS({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* La boîte est ouverte en haut : c'est ce qui distingue cette
          icône d'un carré ordinaire, et c'est ce qu'on cherche des
          yeux. */}
      <path d="M8.5 11H6.5A1.5 1.5 0 0 0 5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 17.5 11h-2" />
      <path d="M12 14.5V4" />
      <path d="m8.6 7.4 3.4-3.4 3.4 3.4" />
    </svg>
  );
}

function IconeAjouterIOS({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

/* ── Les démonstrations filmées ────────────────────────────────────
   Une maquette montre *où regarder* ; un film montre *le geste*, avec
   le doigt et le défilement. Les deux ne font pas double emploi — la
   feuille de partage de Safari se fait défiler, et c'est précisément
   ce qu'un dessin fixe ne peut pas raconter.

   **Le film s'efface tout seul tant qu'il n'existe pas.** Les trois
   fichiers de `public/videos/` sont à tourner ; d'ici là, `onError`
   retire l'élément et le guide reste entier. C'est ce qui permet de
   livrer la structure aujourd'hui et les films quand ils seront prêts,
   sans retoucher une ligne.

   Deux pièges, et les deux ont été payés en écrivant ce composant :

   1. **`src` est posé sur `<video>`, jamais sur un `<source>` enfant.**
      L'événement `error` d'un `<source>` ne remonte pas jusqu'au
      parent : un fichier absent laisserait un rectangle noir au lieu
      de disparaître.
   2. **`onError` seul ne suffit pas.** Le HTML rendu côté serveur
      contient déjà le `src` ; le navigateur tente le chargement,
      échoue, et émet `error` **avant que React n'ait hydraté** — le
      gestionnaire arrive après la bataille et l'élément reste. Mesuré :
      trois lecteurs de 398 px de noir sur `/installer`. C'est le piège
      de `beforeinstallprompt`, une troisième fois dans ce projet. La
      parade est la même : **lire l'état plutôt qu'attendre
      l'événement**, et garder le gestionnaire pour l'échec tardif. */
function EtapeVideo({
  src,
  poster,
  libelle,
}: {
  src: string;
  poster: string;
  libelle: string;
}) {
  const [absente, setAbsente] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    /* On ne lit QUE `error`, jamais `networkState`. Premier jet : la
       condition portait aussi sur `NETWORK_NO_SOURCE`, et masquait les
       lecteurs **même quand le fichier existait** — cet état est vrai
       transitoirement, avant que le navigateur n'ait commencé à
       chercher la ressource. Le lecteur disparaissait donc toujours,
       c'est-à-dire pour une mauvaise raison : vérifié en déposant un
       vrai `.mp4`, qui n'apparaissait pas non plus.

       `error`, lui, ne se remplit qu'après un échec avéré. */
    if (video.error) setAbsente(true);
  }, []);

  if (absente) return null;

  return (
    <video
      ref={ref}
      className="mx-auto w-[224px] max-w-full rounded-casa-lg border border-line bg-ink shadow-casa-md"
      style={{ aspectRatio: "9 / 16" }}
      controls
      playsInline
      preload="metadata"
      src={src}
      poster={poster}
      aria-label={libelle}
      onError={() => setAbsente(true)}
    />
  );
}

/** La coque de téléphone qui sert de cadre aux deux maquettes. */
function Telephone({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="mx-auto w-[224px] max-w-full select-none rounded-[32px] bg-ink p-[8px] shadow-casa-md"
      style={{ aspectRatio: "224 / 430" }}
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[25px] bg-bg">
        <span className="absolute left-1/2 top-2 z-30 h-4 w-16 -translate-x-1/2 rounded-full bg-ink" />
        <div className="mx-3 mt-[26px] flex h-[28px] items-center gap-1.5 rounded-casa-sm border border-line bg-surface px-2.5">
          <span className="h-2 w-2 rounded-[2px] border border-ink-3" />
          <span className="text-[10px] font-semibold tracking-tight text-ink-2">
            casaliva.app
          </span>
        </div>
        <div className="relative flex-1">{children}</div>
      </div>
    </div>
  );
}

/** iPhone : la feuille de partage ouverte, la bonne ligne surlignée. */
function MaquetteIOS() {
  const lignes = [
    { texte: "Copier", surligne: false },
    { texte: "Ajouter aux favoris", surligne: false },
    { texte: "Sur l’écran d’accueil", surligne: true },
    { texte: "Annoter", surligne: false },
  ];

  return (
    <Telephone>
      {/* Le bouton de partage, là où Safari le pose vraiment : dans la
          barre du bas sur iPhone. */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-line bg-surface py-2">
        <span className="h-3 w-3 rounded-full bg-line-strong" />
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-bg ring-4 ring-accent/25">
          <IconePartageIOS className="h-4 w-4" />
        </span>
        <span className="h-3 w-3 rounded-full bg-line-strong" />
      </div>

      {/* La feuille qui monte, et la ligne qu'on cherche. */}
      <div className="absolute inset-x-2 bottom-12 z-10 rounded-casa-md bg-surface p-1.5 shadow-casa-md">
        {lignes.map((l) => (
          <div
            key={l.texte}
            className={cn(
              "flex items-center gap-2 rounded-casa-sm px-2 py-[7px] text-[10.5px] font-semibold text-ink",
              l.surligne && "bg-accent-soft outline outline-2 outline-accent",
            )}
          >
            <span
              className={cn(
                "flex h-4 w-4 flex-none items-center justify-center rounded-[4px]",
                l.surligne ? "bg-surface text-accent-ink" : "bg-bg text-ink-3",
              )}
            >
              {l.surligne ? (
                <IconeAjouterIOS className="h-3 w-3" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-[1px] bg-ink-3" />
              )}
            </span>
            {l.texte}
          </div>
        ))}
      </div>
    </Telephone>
  );
}

/** Android : le menu à trois points, et la bonne entrée surlignée. */
function MaquetteAndroid() {
  const lignes = [
    { texte: "Nouvel onglet", surligne: false },
    { texte: "Installer l’application", surligne: true },
    { texte: "Historique", surligne: false },
  ];

  return (
    <Telephone>
      <div className="absolute right-2 top-[-24px] z-20 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-bg ring-4 ring-accent/25">
        <MoreVertical size={15} strokeWidth={2.6} />
      </div>

      <div className="absolute right-2 top-2 z-10 w-[150px] rounded-casa-md bg-surface p-1.5 shadow-casa-md">
        {lignes.map((l) => (
          <div
            key={l.texte}
            className={cn(
              "flex items-center gap-2 rounded-casa-sm px-2 py-[7px] text-[10.5px] font-semibold text-ink",
              l.surligne && "bg-accent-soft outline outline-2 outline-accent",
            )}
          >
            <span
              className={cn(
                "flex h-4 w-4 flex-none items-center justify-center rounded-[4px]",
                l.surligne ? "bg-surface text-accent-ink" : "bg-bg text-ink-3",
              )}
            >
              {l.surligne ? (
                <Download size={11} strokeWidth={2.6} />
              ) : (
                <span className="h-1.5 w-1.5 rounded-[1px] bg-ink-3" />
              )}
            </span>
            {l.texte}
          </div>
        ))}
      </div>
    </Telephone>
  );
}

type Colonne = {
  titre: string;
  note: string;
  etapes: string[];
  maquette: React.ReactNode;
  video: React.ReactNode;
  mise_en_avant: boolean;
  action?: React.ReactNode;
};

function Colonne({ titre, note, etapes, maquette, video, mise_en_avant, action }: Colonne) {
  return (
    <section
      className={cn(
        "rounded-casa-lg border bg-surface p-5",
        mise_en_avant ? "border-accent/40 shadow-casa-md" : "border-line shadow-casa-sm",
      )}
    >
      <div className="flex items-baseline gap-2">
        <h2 className="font-display text-[1.25rem] font-semibold text-ink">{titre}</h2>
        {mise_en_avant && (
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.75rem] font-bold uppercase tracking-wide text-accent-ink">
            toi
          </span>
        )}
      </div>
      <p className="pt-1 text-[1rem] leading-relaxed text-ink-2">{note}</p>

      <div className="flex flex-col items-center gap-5 py-5">
        {maquette}
        {video}
      </div>

      <ol className="space-y-3">
        {etapes.map((e, i) => (
          <li key={e} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg text-[0.9375rem] font-bold text-ink-2"
            >
              {i + 1}
            </span>
            <span className="pt-0.5 text-[1.0625rem] leading-relaxed text-ink">{e}</span>
          </li>
        ))}
      </ol>

      {action ? <div className="pt-5">{action}</div> : null}
    </section>
  );
}

export type InstallGuideProps = {
  /**
   * Rendu à l'intérieur de la popup plutôt que sur `/installer`.
   *
   * Le titre et les marges de page sautent — la popup pose déjà les
   * siens — et l'ordre change : **la plateforme détectée passe en
   * premier**. Sur une page qu'on est allé chercher, montrer les deux
   * systèmes aide celui qui dépanne quelqu'un d'autre ; dans une popup
   * qui s'ouvre d'elle-même, faire défiler l'iPhone pour atteindre
   * Android est une corvée qu'on n'a pas demandée.
   */
  dansPopup?: boolean;
};

export function InstallGuide({ dansPopup = false }: InstallGuideProps = {}) {
  const [plateforme, setPlateforme] = useState<Plateforme>("autre");
  const [installee, setInstallee] = useState(false);
  const [invitePrete, setInvitePrete] = useState(false);

  useEffect(() => {
    const mesurer = () => {
      setInstallee(estInstallee());
      setPlateforme(detecterPlateforme());
      setInvitePrete(Boolean(window.__casaInstall));
    };

    mesurer();
    window.addEventListener("casa:installable", mesurer);
    window.addEventListener("casa:installee", mesurer);
    return () => {
      window.removeEventListener("casa:installable", mesurer);
      window.removeEventListener("casa:installee", mesurer);
    };
  }, []);

  const installer = useCallback(async () => {
    const invite = window.__casaInstall;
    if (!invite) return;
    await invite.prompt();
    window.__casaInstall = null;
    setInvitePrete(false);
  }, []);

  const colonneIOS = (
    <Colonne
      key="ios"
      titre="Sur iPhone et iPad"
      note="Ça se passe dans Safari. Les autres navigateurs d’iPhone ne savent pas installer d’app — c’est une limite d’iOS, pas de Casa Liva."
      mise_en_avant={plateforme === "ios"}
      maquette={<MaquetteIOS />}
      video={
        <EtapeVideo
          src="/videos/casa-pwa-ios.mp4"
          poster="/videos/casa-pwa-ios.jpg"
          libelle="L’installation sur iPhone, filmée étape par étape"
        />
      }
      etapes={[
        "Appuie sur l’icône de partage, en bas de l’écran.",
        "Fais défiler la liste : « Sur l’écran d’accueil » est plus bas que ce qu’on voit d’abord.",
        "Appuie dessus, puis sur « Ajouter ».",
      ]}
    />
  );

  const colonneAndroid = (
    <Colonne
      key="android"
      titre="Sur Android"
      note="Ça se passe dans Chrome. Si le bouton ci-dessous n’apparaît pas, le menu fait la même chose."
      mise_en_avant={plateforme === "android"}
      maquette={<MaquetteAndroid />}
      video={
        <EtapeVideo
          src="/videos/casa-pwa-android.mp4"
          poster="/videos/casa-pwa-android.jpg"
          libelle="L’installation sur Android, filmée étape par étape"
        />
      }
      etapes={[
        "Ouvre le menu ⋮, en haut à droite.",
        "Choisis « Installer l’application ».",
        "Confirme — l’icône arrive sur l’écran d’accueil.",
      ]}
      action={
        invitePrete ? (
          <button
            type="button"
            onClick={installer}
            className="tap inline-flex w-full items-center justify-center gap-2 rounded-casa-sm bg-ink px-4 text-[1.0625rem] font-semibold text-bg"
          >
            <Download size={19} strokeWidth={2.3} aria-hidden="true" />
            Installer maintenant
          </button>
        ) : null
      }
    />
  );

  /* Dans la popup, la sienne d'abord ; sur la page, l'ordre fixe —
     voir `dansPopup`. */
  const colonnes =
    dansPopup && plateforme === "android"
      ? [colonneAndroid, colonneIOS]
      : [colonneIOS, colonneAndroid];

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-2xl",
        dansPopup ? "px-4 pb-2" : "px-4 py-10 safe-t safe-b",
      )}
    >
      {!dansPopup && (
        <>
          <h1 className="font-display text-[1.875rem] font-semibold leading-tight text-ink">
            Casa&nbsp;Liva sur ton téléphone
          </h1>
          <p className="pt-2.5 text-[1.0625rem] leading-relaxed text-ink-2">
            Une icône à côté de tes autres apps, qui s’ouvre d’un tap — et qui
            continue de montrer l’agenda quand le réseau fait des siennes.
          </p>
        </>
      )}

      {/* Le film d'ouverture : ce qu'on y gagne, avant le mode d'emploi. */}
      <div className={cn("flex justify-center", dansPopup ? "pb-1" : "pt-7")}>
        <EtapeVideo
          src="/videos/casa-pwa-intro.mp4"
          poster="/videos/casa-pwa-intro.jpg"
          libelle="Casa Liva sur l’écran d’accueil, en vingt secondes"
        />
      </div>

      {installee && (
        <p
          role="status"
          className="mt-5 flex items-center gap-2.5 rounded-casa-md border border-success/30 bg-success-soft px-4 py-3 text-[1rem] leading-relaxed text-ink"
        >
          <Check size={19} strokeWidth={2.6} aria-hidden="true" className="shrink-0" />
          C’est déjà fait&nbsp;: tu es dans l’app installée. Rien à faire.
        </p>
      )}

      <div className={cn("space-y-5", dansPopup ? "mt-5" : "mt-7")}>{colonnes}</div>
    </div>
  );
}
