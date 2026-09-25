"use server";

import { revalidatePath } from "next/cache";
import type { EventCategory, Place } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { getCasaContext } from "@/lib/data/casa";
import { fold } from "@/lib/catalogue";

/* ═══════════════════════════════════════════════════════════════
   Écrire un raccourci de la maison (D45).

   **Aucune de ces actions ne vérifie qui appartient à quoi**, et c'est
   la règle produit, pas un oubli : un lieu et une catégorie
   appartiennent à la MAISON. N'importe quel habitant les crée, les
   corrige et les range — corriger une adresse fautive profite à tout
   le monde. C'est l'inverse exact de D21, et `verify:rls` le prouve
   par ses contrôles **positifs** : « B, colocataire, PEUT corriger un
   lieu de la maison ».

   La seule frontière est la maison elle-même, et elle est tenue par la
   RLS — les policies contraignent `family_id` à l'`insert` comme à
   l'`update`, ce que la faille de `calendar_connections` (0005) a
   appris.
   ═══════════════════════════════════════════════════════════════ */

export type CategoryResult =
  | { ok: true; category: EventCategory }
  | { ok: false; error: string };

export type PlaceResult =
  | { ok: true; place: Place }
  | { ok: false; error: string };

/** Toutes les vues qui affichent la rangée de création. */
function revalidateCatalogue() {
  revalidatePath("/aujourdhui");
  revalidatePath("/semaine");
  revalidatePath("/casa");
  revalidatePath("/ia");
}

/**
 * Crée une catégorie, **ou rend celle qui portait déjà ce nom**.
 *
 * Le doublon ne se dédoublonne pas après coup, il **s'empêche** — et
 * l'écran traduit le refus en « on l'a sélectionnée pour toi » plutôt
 * qu'en erreur. La personne a demandé « Apéro », elle obtient
 * « Apéro » : le geste aboutit, c'est tout ce qui compte pour elle.
 *
 * Trois chemins, dans cet ordre :
 *
 * 1. **le nom existe et est actif** → on le rend, éventuellement avec
 *    l'émoji mis à jour ;
 * 2. **le nom existe mais est rangé** → on le sort du rangement. Sans
 *    ça, un nom rangé serait réservé à perpétuité côté écran alors que
 *    l'index partiel, lui, le libère ;
 * 3. **il n'existe pas** → on l'insère.
 *
 * Et le `23505` reste attrapé : deux personnes qui créent « Apéro » à
 * la même seconde passent toutes les deux la lecture avant que l'une
 * n'écrive. C'est Postgres qui arbitre, et le perdant relit.
 */
export async function saveCategory(input: {
  emoji: string;
  label: string;
}): Promise<CategoryResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  const label = input.label.replace(/\s+/g, " ").trim();
  const emoji = input.emoji.trim();

  if (!label) return { ok: false, error: "Il manque le nom." };
  if (label.length > 40) return { ok: false, error: "Ce nom est un peu long." };
  if (!emoji) return { ok: false, error: "Choisis un émoji." };
  if ([...emoji].length > 8) return { ok: false, error: "Un seul émoji suffit." };

  const supabase = await createClient();

  const { data: existantes } = await supabase
    .from("event_categories")
    .select("*")
    .eq("family_id", context.familyId);

  const jumelle = (existantes ?? []).find((c) => fold(c.label) === fold(label));

  if (jumelle) {
    const { data, error } = await supabase
      .from("event_categories")
      .update({ emoji, label, archived_at: null })
      .eq("id", jumelle.id)
      .select("*")
      .single();

    if (error || !data) {
      console.error("[casa] réveil de catégorie échoué", error?.message);
      return { ok: false, error: "Impossible d'enregistrer cette catégorie." };
    }
    revalidateCatalogue();
    return { ok: true, category: toCategory(data) };
  }

  const { data, error } = await supabase
    .from("event_categories")
    .insert({ family_id: context.familyId, emoji, label })
    .select("*")
    .single();

  if (error || !data) {
    // 23505 : quelqu'un d'autre l'a créée entre notre lecture et notre
    // écriture. Le geste a abouti — pas par nous, mais il a abouti.
    if (error?.code === "23505") {
      const { data: gagnante } = await supabase
        .from("event_categories")
        .select("*")
        .eq("family_id", context.familyId)
        .is("archived_at", null);
      const trouvee = (gagnante ?? []).find((c) => fold(c.label) === fold(label));
      if (trouvee) {
        revalidateCatalogue();
        return { ok: true, category: toCategory(trouvee) };
      }
    }
    console.error("[casa] création de catégorie échouée", error?.message);
    return { ok: false, error: "Impossible de créer cette catégorie." };
  }

  revalidateCatalogue();
  return { ok: true, category: toCategory(data) };
}

/** Même mécanique, pour un lieu — nom obligatoire, adresse facultative (D20). */
export async function savePlace(input: {
  label: string;
  address?: string;
}): Promise<PlaceResult> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  const label = input.label.replace(/\s+/g, " ").trim();
  const address = input.address?.replace(/\s+/g, " ").trim() || null;

  if (!label) return { ok: false, error: "Il manque le nom." };
  if (label.length > 60) return { ok: false, error: "Ce nom est un peu long." };
  if (address && address.length > 120) {
    return { ok: false, error: "Cette adresse est trop longue." };
  }

  const supabase = await createClient();

  const { data: existants } = await supabase
    .from("places")
    .select("*")
    .eq("family_id", context.familyId);

  const jumeau = (existants ?? []).find((p) => fold(p.label) === fold(label));

  if (jumeau) {
    /* **On ne vide jamais une adresse déjà connue.** Quelqu'un qui
       retape « Chez Mamie » sans adresse dans la feuille de création
       veut réutiliser le lieu, pas effacer ce qu'un autre y avait mis
       — et il n'aurait aucun moyen de s'en rendre compte. */
    const { data, error } = await supabase
      .from("places")
      .update({ label, address: address ?? jumeau.address, archived_at: null })
      .eq("id", jumeau.id)
      .select("*")
      .single();

    if (error || !data) {
      console.error("[casa] mise à jour de lieu échouée", error?.message);
      return { ok: false, error: "Impossible d'enregistrer ce lieu." };
    }
    revalidateCatalogue();
    return { ok: true, place: toPlace(data) };
  }

  const { data, error } = await supabase
    .from("places")
    .insert({ family_id: context.familyId, label, address })
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      const { data: gagnants } = await supabase
        .from("places")
        .select("*")
        .eq("family_id", context.familyId)
        .is("archived_at", null);
      const trouve = (gagnants ?? []).find((p) => fold(p.label) === fold(label));
      if (trouve) {
        revalidateCatalogue();
        return { ok: true, place: toPlace(trouve) };
      }
    }
    console.error("[casa] création de lieu échouée", error?.message);
    return { ok: false, error: "Impossible de créer ce lieu." };
  }

  revalidateCatalogue();
  return { ok: true, place: toPlace(data) };
}

/**
 * Ranger, jamais supprimer.
 *
 * Il n'existe **aucune policy `for delete`** sur ces deux tables : même
 * si quelqu'un écrivait `.delete()` ici, la base ne toucherait aucune
 * ligne. La garantie tient au schéma, pas à la discipline de qui écrit
 * les Server Actions — c'est la leçon de « une intention en commentaire
 * n'est pas une garantie » (D17).
 */
export async function archiveCategory(id: string): Promise<{ ok: boolean; error?: string }> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("event_categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("family_id", context.familyId)
    .select("id");

  // Un UPDATE refusé par la RLS ne lève pas : il ne touche aucune
  // ligne. Sans le `.select()`, on dirait « c'est rangé » pour rien.
  if (error || !data || data.length === 0) {
    return { ok: false, error: "Impossible de ranger cette catégorie." };
  }

  revalidateCatalogue();
  return { ok: true };
}

export async function archivePlace(id: string): Promise<{ ok: boolean; error?: string }> {
  const context = await getCasaContext();
  if (!context) return { ok: false, error: "Il faut être connecté." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("places")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("family_id", context.familyId)
    .select("id");

  if (error || !data || data.length === 0) {
    return { ok: false, error: "Impossible de ranger ce lieu." };
  }

  revalidateCatalogue();
  return { ok: true };
}

/* Les convertisseurs vivent ici plutôt que dans `lib/data/catalogue.ts`
   pour que ce fichier n'importe pas un module `server-only` depuis une
   Server Action — ils sont trop courts pour mériter un troisième
   fichier. */
function toCategory(row: {
  id: string; family_id: string; emoji: string; label: string;
  archived_at: string | null; seeded: boolean;
}): EventCategory {
  return {
    id: row.id,
    familyId: row.family_id,
    emoji: row.emoji,
    label: row.label,
    archivedAt: row.archived_at ?? undefined,
    seeded: row.seeded,
  };
}

function toPlace(row: {
  id: string; family_id: string; label: string;
  address: string | null; archived_at: string | null;
}): Place {
  return {
    id: row.id,
    familyId: row.family_id,
    label: row.label,
    address: row.address ?? undefined,
    archivedAt: row.archived_at ?? undefined,
  };
}
