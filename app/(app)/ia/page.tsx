import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { CasaChat } from "@/components/ai/casa-chat";
import { PageHeader } from "@/components/shell/page-header";
import { getCasaContext } from "@/lib/data/casa";
import { getCatalogue } from "@/lib/data/catalogue";

export const metadata: Metadata = { title: "Casa AI" };

/**
 * Les suggestions rapides — §26.
 *
 * Elles servent surtout à faire comprendre ce qu'on peut demander :
 * personne ne devine spontanément qu'on peut parler à son agenda. Le
 * prénom est celui d'un vrai habitant, pas un exemple : « Que fait
 * Jonathan demain ? » ne veut rien dire dans une maison sans Jonathan.
 */
function suggestionsFor(others: string[]): string[] {
  const someone = others[0];
  return [
    "Résume ma semaine",
    "Quand sommes-nous tous libres ?",
    ...(someone ? [`Que fait ${someone} demain ?`] : []),
    "Trouve un moment pour un apéro",
    // Depuis JON-63, Casa AI prépare aussi. Une suggestion qui le
    // montre vaut mieux qu'une phrase d'accueil qui l'annonce :
    // personne ne devine qu'on peut demander une création tant qu'on
    // ne l'a pas vue faite une fois.
    ...(someone ? [`Ajoute un golf samedi matin avec ${someone}`] : []),
    "Qui est libre samedi ?",
  ];
}

export default async function AiPage({
  searchParams,
}: {
  // Next 16 : `searchParams` est une Promise.
  searchParams: Promise<{ dire?: string }>;
}) {
  /* Casa AI répond « aujourd'hui », « demain », « samedi ». Sans
     `connection()`, Next figerait la page au moment du build et
     l'assistante parlerait du jour du déploiement pour toujours. */
  await connection();

  const context = await getCasaContext();
  if (!context) redirect("/bienvenue");

  const others = context.members
    .filter((m) => m.id !== context.me.id)
    .map((m) => m.firstName);

  /* On arrive par « Dire à voix haute » du menu du « + » (D49).
     **On ne démarre pas le micro pour autant** : Safari iOS n'accorde
     `getUserMedia` que dans la foulée immédiate d'un geste, et une
     navigation n'en est pas un. Le micro échouerait en silence sur le
     seul navigateur de la maison. On montre donc où appuyer, et c'est
     la personne qui appuie. */
  const { dire } = await searchParams;

  /* Les raccourcis de la maison : « Corriger » un aperçu ouvre le même
     formulaire que la création, donc la même rangée de catégories. */
  const catalogue = await getCatalogue(context.familyId);

  return (
    <>
      <PageHeader title="Casa AI" subtitle="L’assistante de la maison" />

      <CasaChat
        inviteAuMicro={dire === "1"}
        suggestions={suggestionsFor(others)}
        firstName={context.me.firstName}
        members={context.members}
        meId={context.me.id}
        catalogue={catalogue}
      />
    </>
  );
}

/* « Lui parler à voix haute, c'est pour bientôt. » vivait ici, sous un
   micro décoratif. La phrase disait vrai tant que le bouton ne faisait
   rien — un bouton qui ment coûte plus cher qu'un bouton absent (D13).
   Le micro existe depuis JON-57 : la promesse est retirée en même temps
   que sa réalisation arrive, sinon l'écran affiche les deux côte à
   côte. */
