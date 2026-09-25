"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { joinFamily, type JoinResult } from "@/actions/family";

/* ═══════════════════════════════════════════════════════════════
   Répondre à une invitation.

   Rejoindre une maison est l'acte le plus lourd du produit : on
   quitte la sienne, et ses rendez-vous changent de famille. Ça se
   demande avant, ça ne se déduit pas de l'ouverture d'une URL.
   ═══════════════════════════════════════════════════════════════ */

export type CurrentHome = {
  name: string;
  /** Combien d'autres personnes y habitent. */
  others: number;
};

export type AcceptInviteProps = {
  token: string;
  familyName: string;
  invitedBy: string;
  /** La maison qu'on habite aujourd'hui, s'il y en a une. */
  current: CurrentHome | null;
};

/** Ce qu'on dit de chaque refus. Aucun ne blâme la personne qui clique. */
const REFUS: Record<Exclude<JoinResult["kind"], "ok">, { titre: string; texte: string }> = {
  introuvable: {
    titre: "Ce lien ne mène nulle part",
    texte:
      "Il est peut-être incomplet — les liens se coupent facilement dans un SMS. Demande qu'on te le renvoie en entier.",
  },
  "deja-servie": {
    titre: "Cette invitation a déjà servi",
    texte:
      "Elle ne fonctionne qu'une fois. Si quelqu'un d'autre l'a utilisée avant toi, demande la tienne — ça prend dix secondes.",
  },
  expiree: {
    titre: "Cette invitation a pris de l'âge",
    texte:
      "Les invitations durent deux semaines. Demande à la personne qui t'a invité d'en renvoyer une.",
  },
  "maison-partagee": {
    titre: "Tu habites déjà quelque part",
    texte:
      "Et tu n'y es pas seul. On ne peut pas te déménager sans laisser les autres derrière — il faudrait d'abord qu'ils partent, ou qu'on t'invite plus tard.",
  },
  echec: {
    titre: "Ça n'a pas marché",
    texte: "Ce n'est pas toi, c'est nous. Réessaie dans un instant.",
  },
};

export function AcceptInvite({
  token,
  familyName,
  invitedBy,
  current,
}: AcceptInviteProps) {
  const [refus, setRefus] = useState<Exclude<JoinResult["kind"], "ok"> | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  /* On habite déjà une maison avec d'autres : inutile de proposer un
     bouton qui échouera à coup sûr. On l'explique tout de suite. */
  const bloque = current !== null && current.others > 0;

  function accepter() {
    setRefus(null);
    startTransition(async () => {
      const result = await joinFamily(token);
      if (result.kind === "ok") {
        router.replace("/aujourdhui?arrivee=1");
        return;
      }
      setRefus(result.kind);
    });
  }

  if (refus || bloque) {
    const { titre, texte } = REFUS[refus ?? "maison-partagee"];
    return (
      <Ecran titre={titre} texte={texte}>
        <Link
          href="/aujourdhui"
          className="mt-7 inline-flex h-12 items-center justify-center rounded-casa-md bg-accent px-5 font-semibold text-white shadow-casa-accent"
        >
          Retourner à mon agenda
        </Link>
      </Ecran>
    );
  }

  return (
    <Ecran
      emoji="🏡"
      titre={`${invitedBy} t’invite`}
      texte={`Tu vas rejoindre ${familyName}, et voir ce que la maison organise.`}
    >
      {/* Quitter sa maison ne se découvre pas après coup. */}
      {current && (
        <p className="mt-5 max-w-sm rounded-casa-md border border-line bg-surface-2 px-4 py-3 text-[0.875rem] leading-relaxed text-ink-2">
          Tu quitteras «&nbsp;{current.name}&nbsp;», où tu habites aujourd’hui.
          <strong className="text-ink"> Tes rendez-vous te suivent</strong> — rien
          ne se perd.
        </p>
      )}

      <div className="mt-7 flex w-full max-w-xs flex-col gap-2">
        <Button size="lg" block disabled={pending} onClick={accepter}>
          {pending ? "Un instant…" : `Rejoindre ${familyName}`}
        </Button>
        <Link
          href="/aujourdhui"
          className="inline-flex min-h-tap items-center justify-center px-4 text-[0.9375rem] font-semibold text-ink-2 hover:text-ink"
        >
          Pas maintenant
        </Link>
      </div>
    </Ecran>
  );
}

function Ecran({
  emoji,
  titre,
  texte,
  children,
}: {
  emoji?: string;
  titre: string;
  texte: string;
  children: React.ReactNode;
}) {
  return (
    <main className="casa-glow flex min-h-dvh flex-col items-center justify-center px-6 text-center safe-t safe-b">
      {emoji && (
        <p className="text-5xl" aria-hidden="true">
          {emoji}
        </p>
      )}
      <h1 className="mt-5 font-display text-[1.75rem] font-semibold leading-tight text-ink">
        {titre}
      </h1>
      <p className="mt-3 max-w-sm text-[1rem] leading-relaxed text-ink-2">{texte}</p>
      {children}
    </main>
  );
}
