-- ═══════════════════════════════════════════════════════════════
-- 0015 — Un lieu, une catégorie : ça appartient à la maison
--
-- JON-38 et JON-46 livrés ensemble, parce que le ticket a raison :
-- « ce sont deux fois le même objet ». Un endroit où l'on se retrouve
-- (D20) et une façon de nommer ce qu'on fait (D29) s'écrivent une fois,
-- se voient par toute la maison, et se corrigent par n'importe qui.
--
-- **Aucune clé étrangère ne part d'`events`, et c'est LA décision.**
-- Un tap remplit le formulaire — `title`, `emoji`, `location` — et
-- l'événement garde sa propre copie du texte. Ces deux tables sont un
-- carnet, pas un référentiel. Trois problèmes disparaissent au lieu
-- d'être résolus :
--
--   1. **l'import Google n'a rien à résoudre.** `applyVisibility` reste
--      la seule écriture du lieu importé et décide par un `location:
--      null` littéral. Une clé étrangère déplacerait cette décision
--      d'une colonne qu'on ne peut pas contourner vers un `join` qu'on
--      peut oublier — et ferait entrer dans une table partagée par la
--      maison une adresse écrite par quiconque sait envoyer une
--      invitation à une adresse Gmail (D42) ;
--   2. **Casa AI n'y touche pas.** Les tools continuent de manipuler du
--      texte libre. Aucun identifiant ne part au navigateur pour en
--      revenir — ce serait exactement la « cible glissée dans les
--      corrections » que `verify:ai` refuse depuis la phase 9 ;
--   3. **le déménagement ne casse pas.** Une clé étrangère composite
--      aurait fait échouer le `update public.events set family_id = …`
--      de `private.move_into_family` (0007) avec une 23503 — et donc
--      `accept_family_invite` en entier. Emménager chez quelqu'un
--      serait devenu impossible, et aucun contrôle existant ne l'aurait
--      vu : les événements du script d'isolation ne portent pas de
--      descripteur. La section 6 ci-dessous ajoute le transport, et
--      `verify:rls` gagne le contrôle qui l'exerce.
--
-- **`archived_at`, pas `delete`.** Ranger, c'est quitter la rangée de
-- création sans quitter le passé. Pour une catégorie, l'événement porte
-- déjà tout ce qu'il affiche, donc c'est du confort ; pour un lieu,
-- c'est nécessaire — l'événement recopie le nom, jamais l'adresse, et
-- c'est l'adresse qui fait l'itinéraire. Une seule mécanique pour les
-- deux plutôt que deux règles à retenir. Il n'y a donc **aucune policy
-- `for delete`** : la suppression est structurellement impossible
-- depuis l'application, et `verify:rls` le prouve plutôt que de le
-- supposer.
--
-- **`label` et pas `name`, dans les deux tables.** `Defaulted`, dans
-- `types/database.ts`, est une union **globale** qui contient déjà
-- `"name"` : une colonne ainsi nommée deviendrait optionnelle à
-- l'insertion en TypeScript alors qu'elle est `not null` sans défaut.
-- Le trou serait silencieux à la compilation.
--
-- Répercuté dans `types/database.ts` dans le même commit, et
-- `npm run verify:rls` gagne ses contrôles d'isolation dans le même
-- commit aussi — c'est ce qui a attrapé la faille inter-maison de
-- `calendar_connections` en 0005.
-- ═══════════════════════════════════════════════════════════════


-- ── 1. Les catégories d'événement (D29 · JON-46) ──────────────────

create table public.event_categories (
  id        uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,

  /* L'émoji que le tap pose sur l'événement. Jusqu'à huit points de
     code : 👨‍👩‍👧‍👦 en compte sept, et refuser une famille dans une
     application de famille serait comique. Obligatoire, contrairement à
     `events.emoji` : une catégorie sans émoji est un mot de plus dans
     une rangée qu'on lit d'un coup d'œil. */
  emoji text not null
    check (char_length(emoji) between 1 and 8),

  /* Le titre que le tap écrit. 40 caractères : il doit tenir dans une
     puce d'une rangée qui défile sur un téléphone, et il est recopié
     dans `events.title`, borné à 80. */
  label text not null
    check (char_length(btrim(label)) between 1 and 40),

  /* Rangée, pas supprimée. Elle quitte la rangée de création et reste
     lisible sur les événements qui la portent. */
  archived_at timestamptz,

  /* Vraie pour les six posées à la création de la maison. Ne sert qu'à
     répondre « pourquoi ai-je ça ? » et à décider ce qui suit un
     déménagement (section 6). N'accorde aucun privilège et n'entre dans
     aucune policy : une catégorie du socle EST une catégorie. */
  seeded boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- ── 2. Les lieux (D20 · JON-38) ───────────────────────────────────

create table public.places (
  id        uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,

  /* Le nom est obligatoire, l'adresse non, et c'est l'inverse de ce
     qu'on écrirait spontanément (D20). C'est le nom qui lève
     l'ambiguïté dans un agenda partagé : « Chez Mamie » veut dire
     quelque chose pour la famille, « 12 rue des Lilas » ne dit rien à
     personne. Et beaucoup de lieux familiers n'ont besoin d'aucune
     adresse : on sait déjà où c'est.

     60 : le nom est recopié tel quel dans `events.location`, borné à
     120 par le formulaire comme par `MAX_LOCATION` (`lib/ai/tools.ts`). */
  label text not null
    check (char_length(btrim(label)) between 1 and 60),

  /* Elle seule fait apparaître le bouton d'itinéraire. Un lieu sans
     adresse ne lance pas Maps sur une recherche de « Chez Mamie » qui
     atterrirait n'importe où : il propose d'ajouter l'adresse. Un
     bouton qui donne un mauvais résultat est pire que pas de bouton.

     120, comme `events.location` et comme `MAX_LOCATION` : trois
     plafonds identiques valent mieux que trois plafonds voisins. */
  address text
    check (address is null or char_length(btrim(address)) between 1 and 120),

  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

/* **Aucune colonne `creator_id`, dans ni l'une ni l'autre, et son
   absence EST la règle produit.** `events_update_own` (0008) exige
   `creator_id = auth.uid()` parce qu'un événement appartient à qui
   l'organise (D21). Un descripteur, non : il appartient à la maison, et
   corriger une adresse fautive profite à tout le monde. La colonne
   n'existe même pas — ce qu'on ne stocke pas ne peut pas finir un jour
   dans une policy « par symétrie ». */


-- ── 3. Deux noms que la maison lirait pareil sont le même ────────
--
-- « Chez Mamie », « chez mamie », « Chez  Mamié » : le même endroit.
-- L'index refuse le second, l'écran traduit le refus en « on l'a
-- sélectionné pour toi », et le geste aboutit quand même (JON-38, Q3).
--
-- L'expression est écrite **en clair dans l'index**, pas dans une
-- fonction de `private` : `lower`, `btrim`, `regexp_replace` et
-- `translate` sont tous les quatre `immutable`, donc indexables sans
-- extension. `unaccent` ne l'est pas — il dépend d'un dictionnaire — et
-- le déclarer immuable à tort produirait des index silencieusement
-- faux. Une fonction dans `private` aurait en plus posé une question de
-- droit `EXECUTE` pour `service_role`, qui n'a pas `usage` sur ce schéma.
--
-- Le miroir JavaScript est `fold()` dans `lib/catalogue.ts`, et il doit
-- faire exactement la même chose — c'est ce que le contrôle du banc
-- jetable vérifie, valeur par valeur.
--
-- **Partiel sur `archived_at is null`** : ranger « Chez Mamie » puis le
-- recréer doit marcher. Sans le prédicat, ranger deviendrait une
-- réservation de nom à perpétuité.

create unique index event_categories_family_label_key
  on public.event_categories (
    family_id,
    lower(translate(btrim(regexp_replace(label, '\s+', ' ', 'g')),
      'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿ',
      'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOOooooooUUUUuuuuYyy'))
  )
  where archived_at is null;

create unique index places_family_label_key
  on public.places (
    family_id,
    lower(translate(btrim(regexp_replace(label, '\s+', ' ', 'g')),
      'ÀÁÂÃÄÅàáâãäåÇçÈÉÊËèéêëÌÍÎÏìíîïÑñÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÝýÿ',
      'AAAAAAaaaaaaCcEEEEeeeeIIIIiiiiNnOOOOOOooooooUUUUuuuuYyy'))
  )
  where archived_at is null;

/* Postgres n'indexe pas le côté « enfant » d'une clé étrangère (0003).
   Les index d'unicité ci-dessus ont bien `family_id` en tête, mais ils
   sont **partiels** : ils ne couvrent pas les lignes rangées, donc pas
   la cascade depuis `families`. Ces deux-là, si. */
create index event_categories_family_idx on public.event_categories (family_id);
create index places_family_idx           on public.places (family_id);

create trigger event_categories_touch before update on public.event_categories
  for each row execute function private.touch_updated_at();

create trigger places_touch before update on public.places
  for each row execute function private.touch_updated_at();

comment on table public.event_categories is
  'Raccourci de saisie appartenant à la maison (D29, D45). Aucun événement ne le référence : un tap recopie l''émoji et le titre sur l''événement.';
comment on table public.places is
  'Raccourci de saisie appartenant à la maison (D20, D45). Le nom est recopié dans events.location ; l''adresse ne sert qu''à l''itinéraire, résolu par le nom à l''affichage.';
comment on column public.events.location is
  'Texte libre, et il le reste (D45). Seul champ que l''import Google remplit : applyVisibility() y pose null hors du mode full, et ce null littéral est ce qui rend vraie la promesse de D13. Aucune clé étrangère ne part d''ici.';


-- ── 4. Un descripteur appartient à la maison ─────────────────────
--
-- Le motif est celui d'`events_select_own_families` (0001), **sans** le
-- `creator_id` d'`events_update_own` (0008). Ce n'est pas un oubli,
-- c'est la règle produit, et la section 2 l'a déjà rendue impossible à
-- retourner en n'ayant pas la colonne.
--
-- Quatre policies plutôt qu'un `for all` : c'est ce que 0005 a appris.
-- Un `for all` ne porte qu'un seul `with check`, et c'est en le
-- découpant qu'on s'aperçoit qu'il manquait à l'`insert` autant qu'à
-- l'`update`. Le `with check` de l'UPDATE est indispensable : sans lui,
-- on déplacerait un lieu vers la maison d'à côté.
--
-- Chaque policy cible `to authenticated` — sans quoi elle est aussi
-- évaluée pour `anon` à chaque requête, pour rien (0001).
--
-- Et **aucune policy `for delete`** : ranger est un update
-- d'`archived_at`. La cascade depuis `families` reste, elle, gratuite —
-- une action référentielle ne passe pas par la RLS.

alter table public.event_categories enable row level security;
alter table public.places           enable row level security;

create policy event_categories_select_own_families on public.event_categories
  for select to authenticated
  using ( family_id in (select private.user_families()) );

create policy event_categories_insert_own_families on public.event_categories
  for insert to authenticated
  with check ( family_id in (select private.user_families()) );

create policy event_categories_update_own_families on public.event_categories
  for update to authenticated
  using      ( family_id in (select private.user_families()) )
  with check ( family_id in (select private.user_families()) );

create policy places_select_own_families on public.places
  for select to authenticated
  using ( family_id in (select private.user_families()) );

create policy places_insert_own_families on public.places
  for insert to authenticated
  with check ( family_id in (select private.user_families()) );

create policy places_update_own_families on public.places
  for update to authenticated
  using      ( family_id in (select private.user_families()) )
  with check ( family_id in (select private.user_families()) );


-- ── 5. Le jeu de base — de vraies lignes, corrigeables ───────────
--
-- **Des lignes, pas une liste en dur affichée derrière celles de la
-- maison.** D29 dit « n'importe qui la crée, n'importe qui la
-- corrige » : une catégorie incorrigible serait une exception à la
-- règle, et une famille qui veut appeler « Rendez-vous » « Kiné de
-- Mamie » se heurterait à un mur muet. Une liste en dur créerait en
-- plus deux origines pour un même objet visuel, et la question
-- insoluble de ce qui arrive quand quelqu'un crée une catégorie du même
-- nom. « Polluant » se répare en deux taps ; « incorrigeable » ne se
-- répare pas.
--
-- **Un déclencheur plutôt qu'une troisième réécriture de
-- `create_family()`.** Cette fonction a déjà été récrite deux fois
-- (0002, 0007) et porte le verrou consultatif contre le double
-- onboarding **et** `next_free_color(new_id, me)` — le `keep_user` qui
-- fait qu'on garde la couleur choisie deux écrans plus tôt. La recopier
-- pour six lignes de données met tout ça en jeu.
--
-- **Il n'y a pas de jeu de base pour les lieux**, et l'asymétrie est
-- voulue : « Apéro » veut dire la même chose dans toutes les maisons,
-- « Chez Mamie » ne veut rien dire dans aucune autre que la sienne.

create or replace function private.seed_event_categories(target uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.event_categories (family_id, emoji, label, seeded)
  values
    (target, '🍝', 'Déjeuner',     true),
    (target, '🍷', 'Apéro',        true),
    (target, '⚽', 'Sport',        true),
    (target, '🎬', 'Sortie',       true),
    (target, '🎂', 'Anniversaire', true),
    (target, '🩺', 'Rendez-vous',  true)
  on conflict do nothing;
$$;

revoke all on function private.seed_event_categories(uuid) from public, anon, authenticated;

create or replace function private.seed_categories_on_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  /* `security definer` n'est pas du confort : au moment où ce
     déclencheur tourne, `create_family()` n'a **pas encore** inséré la
     ligne de `family_members`. `private.user_families()` ne rendrait
     donc rien, et `event_categories_insert_own_families` refuserait le
     jeu de base de la maison qu'on est justement en train de créer.
     C'est le genre de panne qui casse l'onboarding entier, et sans
     message parlant — d'où le contrôle `verify:rls` qui l'exerce pour
     de vrai plutôt que de le supposer. */
  perform private.seed_event_categories(new.id);
  return new;
end;
$$;

create trigger families_seed_categories
  after insert on public.families
  for each row execute function private.seed_categories_on_family();

-- Les maisons déjà là n'ont pas vu passer le déclencheur.
-- `on conflict do nothing` rend la migration rejouable sans dégât, et
-- une maison qui aurait déjà « Apéro » le garde tel qu'elle l'a écrit.
do $$
declare f uuid;
begin
  for f in select id from public.families loop
    perform private.seed_event_categories(f);
  end loop;
end $$;


-- ── 6. Déménager emporte ses lieux ───────────────────────────────
--
-- `private.move_into_family` (0007) re-parente les événements puis
-- **supprime l'ancienne maison** — et la cascade de `families` emporte
-- tout ce qui y était accroché. Sans les deux `insert` ci-dessous, une
-- personne qui emménage chez quelqu'un perd « Chez Mamie » en silence,
-- alors que ses événements, eux, gardent le texte. C'est exactement le
-- genre de défaut qui ne produit aucune erreur.
--
-- Ce qui suit et ce qui ne suit pas :
--   · **les lieux suivent tous.** « Chez Mamie » est une donnée réelle,
--     et elle vaut autant dans la maison d'arrivée ;
--   · **seules les catégories qu'on a créées soi-même suivent.** La
--     maison d'arrivée a déjà son socle ; y déverser un second
--     « Apéro » n'ajouterait rien qu'un doublon rangé par l'index.
--
-- `on conflict do nothing` (sans cible : c'est ce qui couvre un index
-- unique **partiel**, qu'un `on conflict (…)` ne saurait pas nommer
-- sans répéter son prédicat) : deux « Chez Mamie » ne peuvent pas
-- entrer en collision pendant un emménagement — sinon
-- `accept_family_invite` échouerait en entier sur une 23505 illisible.
--
-- La fonction est recopiée **intégralement depuis 0007**, telle
-- qu'elle, à ces deux `insert` près : `create or replace` l'exige, et
-- une fonction qu'on lit en deux morceaux dans deux migrations est une
-- fonction qu'on lit mal.

create or replace function private.move_into_family(
  p_user   uuid,
  p_family uuid,
  p_role   public.family_role default 'member'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ancienne uuid;
  autres   integer;
begin
  -- Deux acceptations simultanées se croiseraient entre le delete et
  -- l'insert, et la contrainte les arbitrerait par une 23505 que
  -- personne ne saurait lire à l'écran.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user::text, 0));

  select fm.family_id into ancienne
  from public.family_members fm
  where fm.user_id = p_user
  for update;

  -- Recliquer un lien vers la maison où l'on habite déjà : rien à faire.
  if ancienne = p_family then
    return;
  end if;

  if ancienne is not null then
    select count(*) into autres
    from public.family_members fm
    where fm.family_id = ancienne
      and fm.user_id <> p_user;

    if autres > 0 then
      -- On ne vide pas la maison des autres. On refuse, et l'écran
      -- l'explique — d'où l'identifiant machine dans `detail`.
      raise exception 'Tu habites déjà une maison avec d''autres habitants'
        using errcode = 'P0001', detail = 'casa:maison-partagee';
    end if;

    -- Re-parenter AVANT toute suppression. `families` cascade vers
    -- events, calendar_connections, ai_conversations, family_invites,
    -- family_members, places et event_categories : écrites dans
    -- l'autre sens, ces lignes détruiraient tout ce que la personne a
    -- créé, sans une erreur.
    update public.events               set family_id = p_family where family_id = ancienne;
    update public.calendar_connections set family_id = p_family where family_id = ancienne;
    update public.ai_conversations     set family_id = p_family where family_id = ancienne;

    -- Les lieux suivent : « Chez Mamie » vaut autant dans la maison
    -- d'arrivée. Les catégories du socle, non — l'arrivée a le sien.
    insert into public.places (family_id, label, address, archived_at)
    select p_family, p.label, p.address, p.archived_at
    from public.places p
    where p.family_id = ancienne
    on conflict do nothing;

    insert into public.event_categories (family_id, emoji, label, archived_at)
    select p_family, c.emoji, c.label, c.archived_at
    from public.event_categories c
    where c.family_id = ancienne and c.seeded = false
    on conflict do nothing;

    -- Les invitations ne suivent pas : les transporter ferait entrer
    -- chez l'hôte quelqu'un qu'il n'a jamais invité.
    delete from public.family_invites where family_id = ancienne;

    delete from public.family_members where user_id = p_user;
    delete from public.families        where id = ancienne;
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (p_family, p_user, p_role);

  update public.users
  set color = (select private.next_free_color(p_family, p_user))
  where id = p_user;
end;
$$;

revoke all on function private.move_into_family(uuid, uuid, public.family_role)
  from public, anon;
