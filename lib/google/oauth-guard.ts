/**
 * Cookie posé avant de partir chez Google, relu au retour.
 *
 * Supabase apparie les identités sur **l'adresse email**, pas sur la
 * session en cours. Quelqu'un connecté à Casa Liva par lien magique
 * avec `mamie@exemple.fr` qui autoriserait un compte Google
 * `mamie.exemple@gmail.com` se retrouverait sur un **second compte**,
 * vide, sans sa maison. Ce cookie permet de le détecter au retour et
 * de le dire, plutôt que de laisser quelqu'un croire que Casa Liva a
 * perdu sa famille.
 *
 * Vit dans son propre fichier parce qu'un module `"use server"` ne
 * peut exporter que des fonctions asynchrones : une constante y
 * ferait échouer le build.
 */
export const IDENTITY_GUARD_COOKIE = "casa_google_uid";

/** Durée de vie du garde-fou : le temps d'un consentement, pas plus. */
export const IDENTITY_GUARD_MAX_AGE_S = 600;
