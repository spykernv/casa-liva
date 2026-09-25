import "server-only";
import { cache } from "react";
import type { Catalogue, EventCategory, Place } from "@/types";
import type { Tables } from "@/types/database";
import { createClient } from "@/lib/supabase/server";

/* ═══════════════════════════════════════════════════════════════
   Lecture des raccourcis de la maison (D45).

   Comme le reste de `lib/data/`, on re-filtre explicitement sur
   `family_id` alors que la RLS le garantit déjà : Postgres construit
   un bien meilleur plan quand le filtre est dans la requête.

   **Les lignes rangées sont lues elles aussi.** La rangée de création
   ne montre que les actives, mais un lieu rangé doit continuer de
   résoudre — sinon l'événement de mars dernier perdrait son adresse et
   son itinéraire, ce qui est exactement ce qu'`archived_at` sert à
   éviter. Le tri se fait donc côté affichage, pas côté requête.
   ═══════════════════════════════════════════════════════════════ */

function toCategory(row: Tables<"event_categories">): EventCategory {
  return {
    id: row.id,
    familyId: row.family_id,
    emoji: row.emoji,
    label: row.label,
    archivedAt: row.archived_at ?? undefined,
    seeded: row.seeded,
  };
}

function toPlace(row: Tables<"places">): Place {
  return {
    id: row.id,
    familyId: row.family_id,
    label: row.label,
    address: row.address ?? undefined,
    archivedAt: row.archived_at ?? undefined,
  };
}

/**
 * Tout ce que la maison a écrit une fois.
 *
 * `cache()` déduplique par requête HTTP : la page et la feuille de
 * détail peuvent le demander sans le charger deux fois.
 *
 * Tri par `created_at` : **pas par usage, et c'est un choix** (D45).
 * Quatre personnes et six catégories — aucun ordre n'est mauvais, et
 * un compteur d'usage serait de l'ingénierie pour un problème qui ne
 * commencera peut-être jamais. À reprendre le jour où une maison
 * dépassera la quinzaine.
 */
export const getCatalogue = cache(async (familyId: string): Promise<Catalogue> => {
  const supabase = await createClient();

  const [categories, places] = await Promise.all([
    supabase
      .from("event_categories")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true }),
    supabase
      .from("places")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true }),
  ]);

  if (categories.error) {
    console.error("[casa] lecture des catégories échouée", categories.error.message);
  }
  if (places.error) {
    console.error("[casa] lecture des lieux échouée", places.error.message);
  }

  return {
    categories: (categories.data ?? []).map(toCategory),
    places: (places.data ?? []).map(toPlace),
  };
});
