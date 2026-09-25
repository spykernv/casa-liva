"use client";

import { useRouter } from "next/navigation";
import { ChevronRight, Mic, PencilLine } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";

/* ═══════════════════════════════════════════════════════════════
   Deux chemins vers un événement, et le choix est explicite (D49).

   Le « + » ouvrait directement le formulaire. Casa AI sait pourtant
   créer à la voix depuis la phase 9 — mais il fallait le savoir, aller
   dans l'onglet IA, et deviner qu'on pouvait le lui demander. Une
   capacité qu'on ne découvre pas est une capacité qu'on n'a pas.

   **Pourquoi le micro ne démarre pas ici, alors qu'un tap est bien un
   geste utilisateur.** Il le pourrait — mais ce qui est dicté doit
   ensuite être compris, résolu, transformé en aperçu, puis validé, et
   toute cette mécanique vit dans `CasaChat` (D41 : un aperçu se valide
   là où il s'affiche). La recopier ici ferait deux chemins d'écriture
   à tenir d'accord ; c'est exactement ce que JON-66 a coûté à
   l'`UndoBar`.

   Et **on ne démarre pas non plus le micro à l'arrivée sur `/ia`** :
   Safari iOS n'accorde `getUserMedia` que dans la foulée immédiate
   d'un geste, et une navigation n'en est pas un. Le micro échouerait
   silencieusement sur le seul navigateur qui compte ici. La page
   d'arrivée montre donc où appuyer, et c'est la personne qui appuie.
   ═══════════════════════════════════════════════════════════════ */

export type CreateChoiceSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Ouvre le formulaire — l'appelant sait à quelle heure. */
  onManuel: () => void;
};

export function CreateChoiceSheet({ open, onClose, onManuel }: CreateChoiceSheetProps) {
  const router = useRouter();

  return (
    <Sheet open={open} onClose={onClose} title="Ajouter un événement">
      <div className="flex flex-col gap-3 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-1">
        <button
          type="button"
          onClick={() => {
            onClose();
            router.push("/ia?dire=1");
          }}
          className="flex min-h-[4.5rem] items-center gap-4 rounded-casa-md border border-magic/40 bg-magic-soft px-4 text-left"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-magic text-white">
            <Mic size={22} strokeWidth={2.3} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[1.0625rem] font-semibold text-ink">
              Dire à voix haute
            </span>
            <span className="block text-[1rem] leading-snug text-ink-2">
              « Apéro samedi 19h avec Sophie ». Casa AI prépare, tu valides.
            </span>
          </span>
          <ChevronRight size={20} strokeWidth={2.2} aria-hidden="true" className="shrink-0 text-ink-2" />
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            onManuel();
          }}
          className="flex min-h-[4.5rem] items-center gap-4 rounded-casa-md border border-line bg-surface px-4 text-left shadow-casa-sm"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
            <PencilLine size={22} strokeWidth={2.3} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[1.0625rem] font-semibold text-ink">
              Remplir à la main
            </span>
            <span className="block text-[1rem] leading-snug text-ink-2">
              Le formulaire, comme avant.
            </span>
          </span>
          <ChevronRight size={20} strokeWidth={2.2} aria-hidden="true" className="shrink-0 text-ink-2" />
        </button>
      </div>
    </Sheet>
  );
}
