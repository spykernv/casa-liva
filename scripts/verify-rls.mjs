/**
 * Vérifie que la Row Level Security isole vraiment les maisons.
 *
 * C'est la propriété dont tout le reste dépend : si elle cède, chaque
 * famille voit l'agenda des autres. Un test qui passe en local ne
 * prouve rien sur les policies — il faut interroger la vraie base,
 * avec de vraies sessions utilisateur.
 *
 *   node scripts/verify-rls.mjs
 *
 * Le script crée deux comptes jetables sur des domaines réservés
 * (RFC 2606), les fait vivre dans deux maisons différentes, et vérifie
 * qu'aucun ne voit quoi que ce soit de l'autre. Il nettoie derrière lui.
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

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SECRET = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON || !SECRET) {
  console.error("Variables Supabase manquantes dans .env.local");
  process.exit(1);
}

const admin = createClient(URL, SECRET, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Un client authentifié comme `email`, sans passer par un vrai email. */
async function signIn(email) {
  await admin.auth.admin.createUser({ email, email_confirm: true });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error) throw new Error(`generateLink(${email}): ${error.message}`);

  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: otpError } = await client.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });
  if (otpError) throw new Error(`verifyOtp(${email}): ${otpError.message}`);

  const { data: userData } = await client.auth.getUser();
  return { client, userId: userData.user.id };
}

const results = [];
const check = (name, passed, detail = "") =>
  results.push({ name, passed, detail });

const EMAIL_A = "rls-a@example.com";
const EMAIL_B = "rls-b@example.net";

let a;
let b;

/* Les maisons créées par ce script doivent être supprimées par ce
   script. Supprimer les comptes de test ne suffit pas : la cascade part
   de `users` vers `family_members`, jamais vers `families`. Chaque
   exécution laissait donc deux maisons vides derrière elle — il en
   traînait huit en base avant qu'on s'en aperçoive. */
const createdFamilies = [];

try {
  a = await signIn(EMAIL_A);
  b = await signIn(EMAIL_B);

  // Chacun crée sa maison.
  const { data: familyA, error: eA } = await a.client.rpc("create_family", {
    family_name: "Maison A",
  });
  if (eA) throw new Error(`create_family A: ${eA.message}`);
  createdFamilies.push(familyA);

  const { data: familyB, error: eB } = await b.client.rpc("create_family", {
    family_name: "Maison B",
  });
  if (eB) throw new Error(`create_family B: ${eB.message}`);
  createdFamilies.push(familyB);

  check("Deux maisons distinctes", familyA !== familyB, `${familyA} / ${familyB}`);

  // A crée un événement secret.
  const start = new Date(Date.now() + 3_600_000).toISOString();
  const end = new Date(Date.now() + 7_200_000).toISOString();
  const { data: event, error: eventError } = await a.client
    .from("events")
    .insert({
      family_id: familyA,
      creator_id: a.userId,
      title: "Rendez-vous confidentiel",
      start_at: start,
      end_at: end,
    })
    .select("id")
    .single();
  check("A peut créer un événement chez lui", !eventError && !!event, eventError?.message ?? "");

  // B ne doit rien voir.
  const { data: seenByB } = await b.client.from("events").select("id, title");
  check("B ne voit aucun événement de A", (seenByB ?? []).length === 0,
    `${(seenByB ?? []).length} ligne(s)`);

  const { data: usersSeenByB } = await b.client.from("users").select("id, email");
  const leaked = (usersSeenByB ?? []).some((u) => u.id === a.userId);
  check("B ne voit pas le profil de A", !leaked,
    (usersSeenByB ?? []).map((u) => u.email).join(", "));

  const { data: familiesSeenByB } = await b.client.from("families").select("id, name");
  check("B ne voit que sa maison",
    (familiesSeenByB ?? []).length === 1 && familiesSeenByB[0].id === familyB,
    (familiesSeenByB ?? []).map((f) => f.name).join(", "));

  // B ne doit pas pouvoir écrire chez A, même en connaissant l'identifiant.
  const { error: intrusion } = await b.client.from("events").insert({
    family_id: familyA,
    creator_id: b.userId,
    title: "Intrusion",
    start_at: start,
    end_at: end,
  });
  check("B ne peut pas écrire dans la maison de A", !!intrusion,
    intrusion?.message ?? "AUCUNE ERREUR — FAILLE");

  // Ni supprimer l'événement de A.
  const { error: delError, count } = await b.client
    .from("events")
    .delete({ count: "exact" })
    .eq("id", event.id);
  check("B ne peut pas supprimer l'événement de A", !delError && count === 0,
    delError ? delError.message : `${count} ligne(s) supprimée(s)`);

  // Les jetons OAuth sont hors de portée du schéma exposé.
  const { error: oauthError } = await b.client
    .from("oauth_credentials")
    .select("user_id");
  check("private.oauth_credentials est inaccessible", !!oauthError,
    oauthError?.message ?? "AUCUNE ERREUR — FAILLE");

  // Les fonctions qui lisent les jetons ne doivent pas être appelables
  // depuis une session utilisateur. Chez Supabase, un simple
  // `revoke ... from public` ne suffit pas : `pg_default_acl` accorde
  // EXECUTE nominativement à `anon` et `authenticated` sur toute
  // fonction créée dans `public`. C'est exactement ce que ce contrôle
  // surveille — une migration future qui oublierait de les nommer
  // rouvrirait la porte sans que rien d'autre ne le signale.
  const { error: rpcError } = await b.client.rpc("get_oauth_credentials", {
    p_user_id: a.userId,
    p_provider: "google",
  });
  check("get_oauth_credentials est refusée à un utilisateur", !!rpcError,
    rpcError?.message ?? "AUCUNE ERREUR — FAILLE");

  /* ── Un événement importé n'appartient pas à l'utilisateur ────── */

  // On fabrique une connexion et un événement importé côté service.
  const { data: connection } = await admin
    .from("calendar_connections")
    .insert({
      user_id: a.userId,
      family_id: familyA,
      provider: "google",
      external_calendar_id: "rls-test@group.calendar.google.com",
      name: "Test RLS",
    })
    .select("id")
    .single();

  const { data: imported } = await admin
    .from("events")
    .insert({
      family_id: familyA,
      creator_id: a.userId,
      connection_id: connection.id,
      source: "google",
      external_event_id: "rls-test-event",
      title: "Rendez-vous importé",
      start_at: start,
      end_at: end,
    })
    .select("id")
    .single();

  // A le voit — c'est son agenda.
  const { data: importedSeenByA } = await a.client
    .from("events")
    .select("id")
    .eq("id", imported.id);
  check("A voit son événement importé", (importedSeenByA ?? []).length === 1,
    `${(importedSeenByA ?? []).length} ligne(s)`);

  // Mais il ne peut pas le déplacer : la prochaine synchronisation
  // écraserait la modification sans rien dire.
  const { data: moved } = await a.client
    .from("events")
    .update({ title: "Déplacé à la main" })
    .eq("id", imported.id)
    .select("id");
  check("A ne peut pas modifier un événement importé", (moved ?? []).length === 0,
    `${(moved ?? []).length} ligne(s) modifiée(s)`);

  const { data: removed } = await a.client
    .from("events")
    .delete()
    .eq("id", imported.id)
    .select("id");
  check("A ne peut pas supprimer un événement importé", (removed ?? []).length === 0,
    `${(removed ?? []).length} ligne(s) supprimée(s)`);

  // Ni en fabriquer un faux, ce qui contournerait le garde-fou.
  const { error: forged } = await a.client.from("events").insert({
    family_id: familyA,
    creator_id: a.userId,
    connection_id: connection.id,
    source: "google",
    external_event_id: "faux",
    title: "Faux import",
    start_at: start,
    end_at: end,
  });
  check("A ne peut pas fabriquer un événement importé", !!forged,
    forged?.message ?? "AUCUNE ERREUR — FAILLE");

  // Une connexion doit pointer vers UNE MAISON DONT ON EST MEMBRE.
  // Sans cette contrainte, B insérait depuis la console du navigateur
  // une connexion portant le `family_id` de A, connectait son propre
  // agenda Google, et le moteur de synchronisation — qui tourne sous
  // clé de service et ne revalide rien — déversait ses rendez-vous
  // chez A. Le contrôle « B ne peut pas écrire dans la maison de A »
  // ne le voyait pas : il ne teste que la table `events`.
  const { error: hijack } = await b.client.from("calendar_connections").insert({
    user_id: b.userId,
    family_id: familyA,
    provider: "google",
    external_calendar_id: "intrusion@group.calendar.google.com",
    name: "Intrusion",
  });
  check("B ne peut pas brancher un agenda sur la maison de A", !!hijack,
    hijack?.message ?? "AUCUNE ERREUR — FAILLE");

  // Retirer la connexion emporte ses événements : c'est ce qui rend la
  // déconnexion propre, sans script de nettoyage.
  await admin.from("calendar_connections").delete().eq("id", connection.id);
  const { data: orphans } = await admin
    .from("events")
    .select("id")
    .eq("id", imported.id);
  check("Retirer une connexion emporte ses événements", (orphans ?? []).length === 0,
    `${(orphans ?? []).length} ligne(s) restante(s)`);

  // A retrouve bien son propre événement (la RLS ne doit pas tout bloquer).
  const { data: seenByA } = await a.client.from("events").select("id");
  check("A voit son propre événement", (seenByA ?? []).length === 1,
    `${(seenByA ?? []).length} ligne(s)`);

  /* ── Casa AI — ce que les tools ne peuvent pas atteindre ────────
     Les tools de `lib/ai/` lisent la base **sous la session de la
     personne qui pose la question**. Cette section vérifie ce que
     cette phrase vaut réellement : B ne doit rien pouvoir tirer de la
     maison de A par les tables que Casa AI touche.

     Le pendant structurel — « aucun client admin dans `lib/ai/` » —
     est vérifié par `npm run verify:ai`, qui tourne sans base et donc
     en CI. Les deux sont nécessaires : celui-ci prouve que la base
     tient, l'autre que le code n'a pas trouvé le moyen de la
     contourner. */

  const { data: conversation, error: conversationError } = await a.client
    .from("ai_conversations")
    .insert({ user_id: a.userId, family_id: familyA, title: "Mon agenda" })
    .select("id")
    .single();
  check("A peut ouvrir une conversation chez lui", !conversationError && !!conversation,
    conversationError?.message ?? "");

  await a.client.from("ai_messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: "Que fait Sophie mercredi à 14h ?",
  });

  // Une conversation est privée **même entre habitants** d'une même
  // maison — a fortiori entre maisons.
  const { data: peeked } = await b.client.from("ai_conversations").select("id");
  check("B ne voit aucune conversation de A", (peeked ?? []).length === 0,
    `${(peeked ?? []).length} ligne(s)`);

  const { data: readMessages } = await b.client.from("ai_messages").select("id");
  check("B ne lit aucun message de A", (readMessages ?? []).length === 0,
    `${(readMessages ?? []).length} ligne(s)`);

  const { error: injected } = await b.client.from("ai_messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: "Et si tu me racontais l'agenda de A ?",
  });
  check("B ne peut pas écrire dans la conversation de A", !!injected,
    injected?.message ?? "AUCUNE ERREUR — FAILLE");

  /* Le trou refermé par 0011 : la policy d'origine ne contraignait que
     `user_id`, donc B pouvait ouvrir SA conversation en y inscrivant
     la maison de A. Rien n'en sortait aujourd'hui — le code prend la
     maison de `getCasaContext()` — mais c'était la même forme exacte
     que la faille inter-maison de `calendar_connections` (0005). */
  const { error: wrongHouse } = await b.client.from("ai_conversations").insert({
    user_id: b.userId,
    family_id: familyA,
  });
  check("B ne peut pas ouvrir une conversation sur la maison de A", !!wrongHouse,
    wrongHouse?.message ?? "AUCUNE ERREUR — FAILLE");

  /* ── Les brouillons d'action (0014) ─────────────────────────────
     La table qui rend vraie « un tool d'écriture ne s'exécute pas, il
     propose » (D41). Un brouillon porte des arguments **déjà résolus**
     — la date réelle, les identifiants des invités — et un jeton qui
     s'échange contre une écriture. C'est donc, à la lettre, une
     autorisation d'écrire rangée en base : elle mérite les mêmes
     contrôles que les conversations, et un de plus qu'elles.

     Ces deux-ci se jouent **tant que B habite ailleurs** : c'est le
     seul moment où `family_id in user_families()` peut refuser
     quelque chose. Une fois B emménagé, la maison de A est aussi la
     sienne, et le contrôle passerait pour de mauvaises raisons. */

  const { data: brouillon, error: brouillonError } = await a.client
    .from("ai_action_drafts")
    .insert({
      user_id: a.userId,
      family_id: familyA,
      tool: "create_event",
      payload: { event: { title: "Golf", startAt: start, endAt: end, participantIds: [] } },
    })
    .select("id")
    .single();
  check("A peut préparer un aperçu chez lui", !brouillonError && !!brouillon,
    brouillonError?.message ?? "");

  /* Le trou refermé par 0011, transposé : une policy qui ne
     contraindrait que `user_id` laisserait B ranger SON brouillon en
     y inscrivant la maison de A. Rien n'en sortirait aujourd'hui —
     `confirmDraft` compare la maison du brouillon à celle de
     `getCasaContext()` — et c'est exactement ce qu'on se disait de
     `calendar_connections` en 0001. */
  const { error: brouillonAilleurs } = await b.client.from("ai_action_drafts").insert({
    user_id: b.userId,
    family_id: familyA,
    tool: "create_event",
    payload: { event: {} },
  });
  check("B ne peut pas préparer un aperçu sur la maison de A", !!brouillonAilleurs,
    brouillonAilleurs?.message ?? "AUCUNE ERREUR — FAILLE");

  /* Le jeton est à usage unique, et **c'est Postgres qui l'arbitre**.
     Un drapeau relu puis écrit côté application aurait laissé passer
     deux taps simultanés — le geste exact qu'on fait quand la
     connexion rame et qu'on réappuie. Ici, la condition est dans le
     `where` : la seconde consommation ne trouve plus rien. */
  const consomme = async (client) =>
    client
      .from("ai_action_drafts")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", brouillon.id)
      .is("consumed_at", null)
      .select("id");

  const { data: premier } = await consomme(a.client);
  const { data: second } = await consomme(a.client);
  check("Un jeton d'aperçu ne se consomme qu'une fois",
    (premier ?? []).length === 1 && (second ?? []).length === 0,
    `${(premier ?? []).length} puis ${(second ?? []).length}`);

  /* ── Les raccourcis de la maison — lieux et catégories (0015) ───
     Deux tables jumelles qui appartiennent à la MAISON, pas à qui les
     a créées (D20, D29, D45). La règle produit s'y inverse par rapport
     aux événements : n'importe quel habitant corrige un lieu, parce
     que corriger une adresse fautive profite à tout le monde.

     Ces contrôles-ci sont donc de deux natures, et il faut les deux :
     les négatifs (une maison ne voit pas l'autre) ET les positifs (un
     colocataire peut vraiment corriger) — ces derniers arrivent après
     le déménagement, plus bas. Un harnais qui n'aurait que les
     négatifs passerait tout aussi bien avec des policies trop
     fermées, et personne ne le saurait avant que quelqu'un n'essaie. */

  const { data: socleA } = await a.client
    .from("event_categories")
    .select("id, label, seeded")
    .eq("family_id", familyA);
  check("La maison de A part avec son jeu de catégories",
    (socleA ?? []).length === 6 && (socleA ?? []).every((c) => c.seeded),
    `${(socleA ?? []).length} catégorie(s)`);

  const { data: categoriesDeADepuisB } = await b.client
    .from("event_categories")
    .select("id")
    .eq("family_id", familyA);
  check("B ne voit aucune catégorie de la maison de A",
    (categoriesDeADepuisB ?? []).length === 0,
    `${(categoriesDeADepuisB ?? []).length} ligne(s)`);

  const { data: lieuA, error: lieuAError } = await a.client
    .from("places")
    .insert({ family_id: familyA, label: "Chez Mamie", address: "12 rue des Lilas" })
    .select("id")
    .single();
  check("A pose un lieu dans sa maison", !lieuAError && !!lieuA,
    lieuAError?.message ?? "");

  const { data: lieuxDeADepuisB } = await b.client
    .from("places")
    .select("id")
    .eq("family_id", familyA);
  check("B ne voit aucun lieu de la maison de A",
    (lieuxDeADepuisB ?? []).length === 0,
    `${(lieuxDeADepuisB ?? []).length} ligne(s)`);

  // La faille exacte de `calendar_connections` (0005) : une table avec
  // un `family_id` que la policy d'insertion ne contraignait pas.
  const { error: lieuChezAutrui } = await b.client
    .from("places")
    .insert({ family_id: familyA, label: "Squat" });
  check("B ne peut pas poser un lieu chez A", !!lieuChezAutrui,
    lieuChezAutrui?.message ?? "AUCUNE ERREUR — FAILLE");

  const { error: categorieChezAutrui } = await b.client
    .from("event_categories")
    .insert({ family_id: familyA, emoji: "🏴", label: "Squat" });
  check("B ne peut pas poser une catégorie chez A", !!categorieChezAutrui,
    categorieChezAutrui?.message ?? "AUCUNE ERREUR — FAILLE");

  // Un UPDATE refusé par la RLS ne LÈVE PAS : il ne touche aucune
  // ligne. Sans le `.select()`, on lirait « ça a marché ».
  const { data: renomméParB } = await b.client
    .from("places")
    .update({ label: "Chez Personne" })
    .eq("id", lieuA.id)
    .select("id");
  check("B ne peut pas renommer le lieu de A",
    (renomméParB ?? []).length === 0,
    `${(renomméParB ?? []).length} ligne(s)`);

  // Le `with check` de l'UPDATE, et non son `using` : sans lui, on
  // pousserait un lieu vers la maison d'à côté.
  const { data: deplaceParA } = await a.client
    .from("places")
    .update({ family_id: familyB })
    .eq("id", lieuA.id)
    .select("id");
  check("A ne peut pas pousser son lieu vers la maison de B",
    (deplaceParA ?? []).length === 0,
    `${(deplaceParA ?? []).length} ligne(s)`);

  /* Aucune policy `for delete` n'existe : ranger est un update
     d'`archived_at`. La garantie tient donc à la BASE, pas à la
     discipline de qui écrit les Server Actions — c'est la leçon de
     « une intention en commentaire n'est pas une garantie » (D17). */
  const { data: supprimeParA } = await a.client
    .from("places")
    .delete()
    .eq("id", lieuA.id)
    .select("id");
  check("Même A ne peut pas SUPPRIMER un lieu — on range, on ne supprime pas",
    (supprimeParA ?? []).length === 0,
    `${(supprimeParA ?? []).length} ligne(s)`);

  // Deux noms que la maison lirait pareil sont le même : casse,
  // accents et espaces multiples confondus par l'index.
  const { error: doublonReplie } = await a.client
    .from("places")
    .insert({ family_id: familyA, label: "  chez   mamié " });
  check("« chez mamié » est refusé quand « Chez Mamie » existe",
    !!doublonReplie, doublonReplie?.message ?? "AUCUNE ERREUR — DOUBLON");

  // L'index est PARTIEL sur `archived_at is null` : sans ça, ranger un
  // lieu réserverait son nom à perpétuité.
  await a.client
    .from("places")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", lieuA.id);
  const { error: recreeApresRangement } = await a.client
    .from("places")
    .insert({ family_id: familyA, label: "Chez Mamie" });
  check("Ranger « Chez Mamie » libère son nom",
    !recreeApresRangement, recreeApresRangement?.message ?? "");

  const { data: lieuBAvantDemenagement } = await b.client
    .from("places")
    .insert({ family_id: familyB, label: "Le golf", address: "1 rue du Golf" })
    .select("id")
    .single();
  check("B pose un lieu chez lui, avant de déménager",
    !!lieuBAvantDemenagement, "");

  /* ── Une seule maison par personne ──────────────────────────────
     Ces contrôles restent EN DERNIER : le dernier déménage B chez A,
     après quoi « B ne voit aucun événement de A » tomberait
     légitimement. */

  // La policy d'insertion directe a été retirée (0007) : les deux
  // seules portes d'entrée sont `create_family` et
  // `accept_family_invite`.
  const { error: squat } = await b.client.from("family_members").insert({
    family_id: familyA,
    user_id: b.userId,
    role: "member",
  });
  check("B ne peut pas s'inscrire tout seul chez A", !!squat,
    squat?.message ?? "AUCUNE ERREUR — FAILLE");

  // Le contrôle qui prouve que la garantie vient de la BASE et pas du
  // code applicatif : même la clé de service ne peut pas créer une
  // deuxième appartenance.
  const { error: doublon } = await admin.from("family_members").insert({
    family_id: familyA,
    user_id: b.userId,
    role: "member",
  });
  check("Même la clé de service ne peut pas créer un doublon", !!doublon,
    doublon?.message ?? "AUCUNE ERREUR — FAILLE");

  // Rejoindre, c'est déménager : l'événement suit, l'ancienne maison
  // disparaît.
  const { data: inviteB } = await a.client
    .from("family_invites")
    .insert({ family_id: familyA, email: EMAIL_B, invited_by: a.userId })
    .select("token")
    .single();

  const { error: joinError } = await b.client.rpc("accept_family_invite", {
    invite_token: inviteB.token,
  });
  check("B rejoint la maison de A", !joinError, joinError?.message ?? "");

  const { data: bMemberships } = await admin
    .from("family_members")
    .select("family_id")
    .eq("user_id", b.userId);
  check("B n'appartient plus qu'à une seule maison",
    (bMemberships ?? []).length === 1 && bMemberships[0]?.family_id === familyA,
    `${(bMemberships ?? []).length} maison(s)`);

  const { data: oldHouse } = await admin
    .from("families")
    .select("id")
    .eq("id", familyB);
  check("L'ancienne maison de B a disparu", (oldHouse ?? []).length === 0,
    `${(oldHouse ?? []).length} ligne(s)`);

  /* ── Déménager emporte ses lieux (0015) ─────────────────────────
     Le contrôle qu'aucune relecture n'avait, et il n'était pas
     décoratif : `move_into_family` supprime l'ancienne maison, dont la
     cascade emporte tout. Sans les deux `insert` ajoutés en 0015,
     « Le golf » disparaîtrait en silence pendant que les événements de
     B, eux, garderaient le texte du lieu.

     Ce contrôle n'aurait rien vu avant 0015 non plus : les événements
     que ce script crée ne portaient aucun descripteur. */

  const { data: lieuApresDemenagement } = await b.client
    .from("places")
    .select("id, address")
    .eq("family_id", familyA)
    .eq("label", "Le golf");
  check("Le lieu de B a suivi le déménagement",
    (lieuApresDemenagement ?? []).length === 1
      && lieuApresDemenagement[0]?.address === "1 rue du Golf",
    `${(lieuApresDemenagement ?? []).length} ligne(s)`);

  const { data: socleApres } = await admin
    .from("event_categories")
    .select("id")
    .eq("family_id", familyA)
    .eq("seeded", true);
  check("Le socle de A n'a pas été dupliqué par l'arrivée de B",
    (socleApres ?? []).length === 6,
    `${(socleApres ?? []).length} catégorie(s) de socle`);

  /* Et la règle produit, prise par son côté POSITIF — celui qu'un
     harnais fait de refus n'atteint jamais. Un descripteur appartient
     à la maison : B, tout juste arrivé, doit pouvoir corriger le lieu
     que A a écrit. C'est l'inverse exact de D21, et c'est voulu. */
  const { data: corrigeParColocataire } = await b.client
    .from("places")
    .update({ address: "12 rue des Lilas, Paris" })
    .eq("family_id", familyA)
    .eq("label", "Le golf")
    .select("id");
  check("B, colocataire, PEUT corriger un lieu de la maison",
    (corrigeParColocataire ?? []).length === 1,
    `${(corrigeParColocataire ?? []).length} ligne(s)`);

  const { data: rangeParColocataire } = await b.client
    .from("event_categories")
    .update({ archived_at: new Date().toISOString() })
    .eq("family_id", familyA)
    .eq("seeded", true)
    .select("id");
  check("B, colocataire, PEUT ranger une catégorie de la maison",
    (rangeParColocataire ?? []).length === 6,
    `${(rangeParColocataire ?? []).length} ligne(s)`);

  /* ── On ne modifie pas l'événement de quelqu'un d'autre (D21) ────
     B vit maintenant chez A. C'est LE cas que la migration 0008 a
     renversé : jusque-là, un colocataire pouvait déplacer et supprimer
     l'événement d'un autre — c'était même écrit et argumenté dans
     0001. Les contrôles « B ne peut pas … » plus haut ne prouvaient
     rien là-dessus : à ce moment du script, B était encore dans une
     autre maison, et c'est l'isolation entre maisons qui le bloquait. */

  const { data: seenByHousemate } = await b.client
    .from("events")
    .select("id")
    .eq("id", event.id);
  check("B, colocataire, voit bien l'événement de A",
    (seenByHousemate ?? []).length === 1,
    `${(seenByHousemate ?? []).length} ligne(s)`);

  const { data: movedByHousemate } = await b.client
    .from("events")
    .update({ title: "Déplacé par le colocataire" })
    .eq("id", event.id)
    .select("id");
  check("B ne peut pas modifier l'événement de A chez qui il vit",
    (movedByHousemate ?? []).length === 0,
    `${(movedByHousemate ?? []).length} ligne(s) modifiée(s)`);

  const { data: killedByHousemate } = await b.client
    .from("events")
    .delete()
    .eq("id", event.id)
    .select("id");
  check("B ne peut pas supprimer l'événement de A chez qui il vit",
    (killedByHousemate ?? []).length === 0,
    `${(killedByHousemate ?? []).length} ligne(s) supprimée(s)`);

  // Inviter quelqu'un sur l'événement d'un tiers, c'est le modifier.
  const { error: dragged } = await b.client.from("event_participants").insert({
    event_id: event.id,
    user_id: a.userId,
    status: "pending",
  });
  check("B ne peut pas convier A à l'événement de A", !!dragged,
    dragged?.message ?? "AUCUNE ERREUR — FAILLE");

  // Mais répondre reste ouvert à tout le monde : c'est tout l'intérêt
  // d'inviter quelqu'un. B s'ajoute, puis dit qu'il vient.
  const { error: selfJoin } = await b.client.from("event_participants").insert({
    event_id: event.id,
    user_id: b.userId,
    status: "pending",
  });
  check("B peut s'ajouter lui-même", !selfJoin, selfJoin?.message ?? "");

  const { data: answered } = await b.client
    .from("event_participants")
    .update({ status: "accepted" })
    .eq("event_id", event.id)
    .eq("user_id", b.userId)
    .select("status");
  check("B peut répondre « je viens »",
    answered?.[0]?.status === "accepted",
    answered?.[0]?.status ?? "aucune ligne");

  // Et A garde la main sur ce qu'il a créé — la règle ne doit pas
  // avoir tout verrouillé au passage.
  const { data: movedByOwner } = await a.client
    .from("events")
    .update({ title: "Rendez-vous confidentiel" })
    .eq("id", event.id)
    .select("id");
  check("A modifie toujours son propre événement",
    (movedByOwner ?? []).length === 1,
    `${(movedByOwner ?? []).length} ligne(s) modifiée(s)`);

  /* ── Et le brouillon vu par le colocataire ──────────────────────
     B vit maintenant chez A. C'est le cas qui compte : un aperçu
     n'est pas un secret d'agenda — il est déjà autorisé à écrire dans
     cette maison — mais **il appartient à qui l'a demandé**. Le
     consommer à sa place créerait l'événement au nom de A, sous son
     `creator_id`, sans que A n'ait rien validé. C'est exactement ce
     que D22 existe pour empêcher, et la RLS doit le tenir sans que
     `confirmDraft` ait à y penser. */

  const { data: brouillonDeB } = await b.client.from("ai_action_drafts").select("id");
  check("B, colocataire, ne voit pas les aperçus de A",
    (brouillonDeB ?? []).length === 0,
    `${(brouillonDeB ?? []).length} ligne(s)`);

  const { data: vole } = await b.client
    .from("ai_action_drafts")
    .update({ consumed_at: null })
    .eq("id", brouillon.id)
    .select("id");
  check("B ne peut pas consommer l'aperçu de A",
    (vole ?? []).length === 0,
    `${(vole ?? []).length} ligne(s) modifiée(s)`);

  /* ── Le bucket audio (0012) — la seule fuite qui serait définitive ─

     Une réponse écrite vit dans une conversation protégée par la RLS.
     Un fichier audio, lui, **survit à la session qui l'a produit** : si
     le bucket cessait d'être privé, son URL deviendrait un lien qui
     marche pour n'importe qui, pour toujours, et qui contient l'agenda
     de quelqu'un lu à voix haute. C'est, avec l'email, le seul endroit
     du système où on ne peut pas revenir en arrière.

     **Ces contrôles sont volontairement les derniers, et joués entre
     colocataires.** B vit maintenant chez A : c'est le cas le plus
     dur, et le seul qui compte vraiment. Les policies de 0012 ne
     regardent que `auth.uid()` — pas la maison — donc si l'isolation
     tient entre deux personnes du même foyer, elle tient a fortiori
     entre deux maisons. L'inverse serait faux : vérifier depuis une
     autre maison n'aurait rien prouvé sur le cache d'à côté.

     Ce qui était su sans être vérifié : le bucket est privé, le chemin
     est `<user_id>/<empreinte>.mp3`, les quatre policies ne regardent
     que le premier segment, et le même fichier demandé sans signature
     répond 400. Constaté à la main lors de JON-54 — jamais par un
     contrôle qui échouerait si ça changeait. */

  const BUCKET = "casa-audio";
  // Le chemin est celui que `render()` fabrique (`lib/voice/speech.ts`)
  // — pas une convention réinventée ici, sinon le contrôle vérifierait
  // une isolation que le code n'utilise pas.
  const audioPath = `${a.userId}/verify-rls-empreinte.mp3`;
  const audioBytes = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00]);

  /* Le contrôle positif d'abord : sans lui, tous les refus qui suivent
     pourraient venir d'un bucket cassé plutôt que d'une policy qui
     travaille. */
  const { error: deposit } = await a.client.storage
    .from(BUCKET)
    .upload(audioPath, audioBytes, { contentType: "audio/mpeg", upsert: true });
  check("A dépose son audio dans son dossier", !deposit, deposit?.message ?? "");

  const { data: signedForA } = await a.client.storage
    .from(BUCKET)
    .createSignedUrl(audioPath, 60);
  const playedByA = signedForA?.signedUrl
    ? await fetch(signedForA.signedUrl)
    : null;
  check("A réécoute le sien par une URL signée",
    playedByA?.status === 200 &&
      playedByA.headers.get("content-type")?.includes("audio/mpeg") === true,
    playedByA ? `${playedByA.status} ${playedByA.headers.get("content-type")}` : "aucune signature");

  /* Le bucket n'est pas public, et les deux formes d'URL le disent.
     Celle en `/public/` est exactement le lien qu'on obtiendrait si
     quelqu'un basculait le drapeau `public` un jour de ménage : c'est
     le seul changement d'une ligne qui rendrait tout le reste inutile
     sans casser quoi que ce soit à l'écran. */
  const bare = await fetch(`${URL}/storage/v1/object/${BUCKET}/${audioPath}`);
  const asPublic = await fetch(`${URL}/storage/v1/object/public/${BUCKET}/${audioPath}`);
  check("Le fichier n'est pas servi sans signature",
    bare.status !== 200 && asPublic.status !== 200,
    `direct ${bare.status} · public ${asPublic.status}`);

  /* Une signature expire vraiment. Tout le modèle repose là-dessus :
     l'URL sort du serveur, donc elle peut être copiée, journalisée par
     un proxy, ou rester dans un historique. « Signée » ne protège que
     si « courte » est appliqué par le serveur, et personne ne l'avait
     mesuré. */
  const { data: shortLived } = await a.client.storage
    .from(BUCKET)
    .createSignedUrl(audioPath, 1);
  await new Promise((resolve) => setTimeout(resolve, 2_500));
  const expired = shortLived?.signedUrl ? await fetch(shortLived.signedUrl) : null;
  check("Une URL signée expirée ne sert plus rien",
    expired !== null && expired.status !== 200,
    expired ? `${expired.status}` : "aucune signature");

  /* ── Et maintenant B, qui vit sous le même toit ────────────────── */

  const { data: listedByB } = await b.client.storage.from(BUCKET).list(a.userId);
  check("B ne voit pas le dossier audio de A", (listedByB ?? []).length === 0,
    `${(listedByB ?? []).length} fichier(s)`);

  const { error: stolen } = await b.client.storage.from(BUCKET).download(audioPath);
  check("B ne télécharge pas l'audio de A", !!stolen,
    stolen?.message ?? "AUCUNE ERREUR — FAILLE");

  /* La forme la plus séduisante de l'attaque : ne pas lire le fichier,
     mais se faire délivrer un laissez-passer pour lui. Signer est un
     `select` déguisé — si la policy de lecture cède, celle-ci cède avec
     elle, et le lien obtenu vaut une heure. */
  const { error: forgedLink } = await b.client.storage
    .from(BUCKET)
    .createSignedUrl(audioPath, 60);
  check("B ne peut pas signer une URL pour l'audio de A", !!forgedLink,
    forgedLink?.message ?? "AUCUNE ERREUR — FAILLE");

  const { error: planted } = await b.client.storage
    .from(BUCKET)
    .upload(`${a.userId}/intrusion.mp3`, audioBytes, { contentType: "audio/mpeg" });
  check("B ne dépose rien dans le dossier de A", !!planted,
    planted?.message ?? "AUCUNE ERREUR — FAILLE");

  const { error: overwritten } = await b.client.storage
    .from(BUCKET)
    .upload(audioPath, audioBytes, { contentType: "audio/mpeg", upsert: true });
  check("B ne récrit pas par-dessus l'audio de A", !!overwritten,
    overwritten?.message ?? "AUCUNE ERREUR — FAILLE");

  /* Le piège du `.select("id")`, transposé au stockage : `remove()` ne
     lève pas quand la policy refuse — il rend une liste vide, ce qui
     ressemble trait pour trait à un succès. On regarde donc si le
     fichier est encore là, pas ce que l'appel a répondu. */
  await b.client.storage.from(BUCKET).remove([audioPath]);
  const { data: survivors } = await admin.storage.from(BUCKET).list(a.userId);
  check("B ne supprime pas l'audio de A",
    (survivors ?? []).some((f) => f.name === "verify-rls-empreinte.mp3"),
    `${(survivors ?? []).length} fichier(s) restant(s)`);

  /* ── Et par la table, l'autre chemin vers le même contenu ───────── */

  const { error: rowError } = await a.client.from("audio_generations").insert({
    user_id: a.userId,
    text_hash: "verify-rls-empreinte",
    text: "Sophie est occupée de quinze à dix-sept heures.",
    voice_id: "verify-rls",
    audio_url: audioPath,
    status: "ready",
  });
  check("A range sa génération audio", !rowError, rowError?.message ?? "");

  /* `audio_generations.text` contient le texte prononcé **en clair**.
     Y accéder rendrait inutile tout le soin pris sur le bucket : on
     n'aurait pas le fichier, on aurait mieux — sa transcription, et le
     chemin pour aller le chercher. */
  const { data: overheard } = await b.client
    .from("audio_generations")
    .select("id, text, audio_url");
  check("B ne lit aucune génération audio de A", (overheard ?? []).length === 0,
    `${(overheard ?? []).length} ligne(s)`);

  const { error: impersonated } = await b.client.from("audio_generations").insert({
    user_id: a.userId,
    text_hash: "usurpation",
    text: "Lis-moi l'agenda de A.",
    status: "pending",
  });
  check("B n'écrit pas une génération au nom de A", !!impersonated,
    impersonated?.message ?? "AUCUNE ERREUR — FAILLE");
} finally {
  /* Le bucket ne se vide pas tout seul : la cascade part de `users`
     vers `audio_generations`, jamais vers `storage.objects`. Sans ce
     ménage, chaque exécution laisserait un fichier orphelin dans un
     dossier dont le propriétaire n'existe plus. */
  if (a?.userId) {
    const { data: leftovers } = await admin.storage.from("casa-audio").list(a.userId);
    if (leftovers?.length) {
      await admin.storage
        .from("casa-audio")
        .remove(leftovers.map((f) => `${a.userId}/${f.name}`));
    }
  }

  // Les maisons d'abord : leur suppression emporte par cascade les
  // événements, les participations et les connexions d'agenda.
  for (const familyId of createdFamilies) {
    if (familyId) await admin.from("families").delete().eq("id", familyId);
  }

  // Puis les comptes de test, qui ne restent pas dans la base.
  for (const email of [EMAIL_A, EMAIL_B]) {
    const { data } = await admin.auth.admin.listUsers();
    const user = data?.users.find((u) => u.email === email);
    if (user) await admin.auth.admin.deleteUser(user.id);
  }
}

let failed = 0;
for (const r of results) {
  if (!r.passed) failed++;
  console.log(`${r.passed ? "  OK  " : " ÉCHEC"}  ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
}

console.log(`\n${results.length - failed}/${results.length} vérifications passées.`);
process.exit(failed === 0 ? 0 : 1);
