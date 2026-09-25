/**
 * Fabrique un lien de connexion pour tester l'app, sans envoyer le
 * moindre email.
 *
 *   node scripts/dev-login-link.mjs [email] [url-de-base] [destination]
 *
 *   # en local
 *   npm run dev:login -- papa@example.com
 *
 *   # sur une Preview Vercel, en atterrissant sur l'écran d'agenda
 *   npm run dev:login -- moi@example.com https://casa-liva-git-xxx.vercel.app /moi/agenda
 *
 * Deux raisons d'exister, et la seconde compte autant que la première.
 *
 * **Le SMTP intégré de Supabase est plafonné** à quelques envois par
 * heure — de quoi bloquer une séance de test entière.
 *
 * **Et sur une Preview, le lien reçu par email ramène en production.**
 * Supabase valide `emailRedirectTo` contre sa liste « Redirect URLs » ;
 * une URL de Preview n'y figure pas, alors il la remplace par la Site
 * URL. Le lien fabriqué ici n'a pas ce problème : il passe par
 * `/auth/confirm`, qui vérifie le jeton côté application et redirige
 * lui-même. La liste blanche n'est jamais consultée.
 *
 * Attention : ça déverrouille la connexion, pas le retour d'OAuth
 * Google — celui-là passe forcément par Supabase et exige que l'URL de
 * Preview soit dans la liste blanche.
 *
 * Réservé au développement : il faut la clé de service.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env.local"), "utf8")
    .split("\n")
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim().replace(/^"|"$/g, "")]),
);

const admin = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const email = process.argv[2] ?? "casa-test@example.com";
const base = (process.argv[3] ?? "http://localhost:3000").replace(/\/+$/, "");

/* Où atterrir après la connexion.

   La barre oblique initiale est facultative — et c'est voulu : Git Bash
   réécrit tout argument commençant par « / » en chemin Windows, si bien
   que « /moi/agenda » arrive ici sous la forme
   « C:/Program Files/Git/moi/agenda ». Écrire « moi/agenda » évite le
   problème dans tous les shells. */
const rawDestination = process.argv[4] ?? "aujourdhui";

if (/[:\\]/.test(rawDestination)) {
  console.error(
    `Destination invalide : « ${rawDestination} ».\n` +
      "On dirait un chemin réécrit par Git Bash. Écris-la sans barre oblique\n" +
      "initiale, par exemple :  npm run dev:login -- moi@example.com <url> moi/agenda",
  );
  process.exit(1);
}

const destination = `/${rawDestination.replace(/^\/+/, "")}`;

const { error: createError } = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
});
if (createError && !/already/i.test(createError.message)) {
  console.error("createUser:", createError.message);
  process.exit(1);
}

const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
});
if (error) {
  console.error("generateLink:", error.message);
  process.exit(1);
}

console.log(
  `${base}/auth/confirm?token_hash=${data.properties.hashed_token}` +
    `&type=magiclink&suite=${encodeURIComponent(destination)}`,
);
