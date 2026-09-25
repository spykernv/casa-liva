-- ═══════════════════════════════════════════════════════════════
-- Casa Liva — schéma initial
--
-- Trois principes tiennent tout le fichier :
--
-- 1. RLS sur chaque table, sans exception. Une table sans policy est
--    une table inaccessible, pas une table ouverte.
-- 2. Les lectures d'appartenance passent par des fonctions
--    SECURITY DEFINER dans un schéma `private` NON exposé. Une policy
--    sur `family_members` qui interroge `family_members` provoque une
--    récursion infinie (Postgres 42P17) ; la fonction casse la boucle.
-- 3. Tout appel de fonction dans une policy est enveloppé dans
--    `(select ...)`. Sans ça, Postgres réévalue la fonction pour
--    CHAQUE ligne — les benchmarks Supabase mesurent 178 s contre
--    12 ms sur une table d'un million de lignes.
--
-- Les secrets OAuth vivent dans une table sans aucune policy : seule
-- la clé secrète serveur peut y toucher.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── Schéma privé (jamais listé dans « Exposed schemas ») ──────────
create schema if not exists private;
revoke all on schema private from anon, authenticated;
grant usage on schema private to authenticated;

-- ── Domaines ─────────────────────────────────────────────────────
create type public.member_color as enum (
  'blue', 'green', 'pink', 'purple', 'orange', 'teal', 'red', 'ochre'
);

create type public.family_role as enum ('owner', 'member');

create type public.event_source as enum ('casa-liva', 'google');

create type public.participant_status as enum ('pending', 'accepted', 'declined');

-- Ce que Casa Liva a le droit de montrer d'un agenda Google importé.
-- Ce réglage est appliqué à l'IMPORT, pas à l'affichage : en mode
-- `availability`, le titre réel n'entre jamais dans la base. On ne peut
-- pas divulguer ce qu'on n'a pas stocké.
create type public.visibility_mode as enum ('availability', 'titles', 'full');

-- ── Horodatage ───────────────────────────────────────────────────
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- Tables
-- ═══════════════════════════════════════════════════════════════

-- Profil applicatif. `auth.users` reste la source de vérité de
-- l'identité ; cette table porte ce qui est propre à Casa Liva.
create table public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  first_name  text not null default '',
  avatar      text not null default '',
  color       public.member_color not null default 'blue',
  timezone    text not null default 'Europe/Paris',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Casa Liva',
  created_at timestamptz not null default now()
);

create table public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id   uuid not null references public.users(id)    on delete cascade,
  role      public.family_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table public.events (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null references public.families(id) on delete cascade,
  creator_id        uuid not null references public.users(id)    on delete cascade,

  title             text not null,
  description       text,
  emoji             text,
  location          text,

  start_at          timestamptz not null,
  end_at            timestamptz not null,
  all_day           boolean not null default false,

  source            public.event_source not null default 'casa-liva',
  external_event_id text,

  -- Événement importé dont le contenu est masqué : l'UI affiche
  -- « 🔒 Jonathan occupé » et rien d'autre.
  is_private        boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint events_end_after_start check (end_at > start_at)
);

create table public.event_participants (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id  uuid not null references public.users(id)  on delete cascade,
  status   public.participant_status not null default 'pending',
  primary key (event_id, user_id)
);

-- Un agenda externe connecté. Les jetons ne sont PAS ici : voir
-- `private.oauth_credentials`.
create table public.calendar_connections (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references public.users(id) on delete cascade,
  provider             text not null default 'google',
  external_calendar_id text not null,
  visibility_mode      public.visibility_mode not null default 'titles',
  sync_token           text,
  last_synced_at       timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, provider, external_calendar_id)
);

-- Invitations à rejoindre la maison.
create table public.family_invites (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references public.families(id) on delete cascade,
  email       text not null,
  invited_by  uuid not null references public.users(id) on delete cascade,
  token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  accepted_at timestamptz,
  expires_at  timestamptz not null default now() + interval '14 days',
  created_at  timestamptz not null default now()
);

-- ── Casa AI ──────────────────────────────────────────────────────
create table public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id)    on delete cascade,
  family_id  uuid not null references public.families(id) on delete cascade,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system')),
  content         text not null,
  provider        text,
  model           text,
  -- Suivi de coût (§72). Jamais de contenu d'agenda ici.
  input_tokens    integer,
  output_tokens   integer,
  created_at      timestamptz not null default now()
);

create table public.audio_generations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  -- Empreinte du texte : évite de régénérer deux fois le même audio (§72).
  text_hash  text not null,
  text       text not null,
  provider   text not null default 'elevenlabs',
  voice_id   text,
  audio_url  text,
  status     text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  unique (user_id, text_hash)
);

-- ── Jetons OAuth ─────────────────────────────────────────────────
-- Dans le schéma privé : ni `anon` ni `authenticated` ne peuvent
-- l'atteindre, même par erreur de policy. Supabase ne conserve pas le
-- `provider_refresh_token` de Google — c'est à nous de le capturer
-- au retour du callback, et c'est la seule occasion de le lire.
create table private.oauth_credentials (
  user_id       uuid primary key references public.users(id) on delete cascade,
  provider      text not null default 'google',
  refresh_token text not null,
  access_token  text,
  expires_at    timestamptz,
  scopes        text,
  updated_at    timestamptz not null default now()
);
revoke all on table private.oauth_credentials from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Index — les colonnes lues par la RLS doivent être indexées,
-- sinon chaque policy déclenche un seq scan.
-- ═══════════════════════════════════════════════════════════════
create index family_members_user_id_idx        on public.family_members (user_id);
create index events_family_start_idx           on public.events (family_id, start_at);
create index events_external_idx               on public.events (source, external_event_id)
  where external_event_id is not null;
create index event_participants_user_idx       on public.event_participants (user_id);
create index calendar_connections_user_idx     on public.calendar_connections (user_id);
create index family_invites_email_idx          on public.family_invites (lower(email));
create index ai_conversations_user_idx         on public.ai_conversations (user_id);
create index ai_messages_conversation_idx      on public.ai_messages (conversation_id, created_at);
create index audio_generations_user_idx        on public.audio_generations (user_id);

-- ═══════════════════════════════════════════════════════════════
-- Déclencheurs updated_at
-- ═══════════════════════════════════════════════════════════════
create trigger users_touch                before update on public.users
  for each row execute function private.touch_updated_at();
create trigger events_touch               before update on public.events
  for each row execute function private.touch_updated_at();
create trigger calendar_connections_touch before update on public.calendar_connections
  for each row execute function private.touch_updated_at();
create trigger ai_conversations_touch     before update on public.ai_conversations
  for each row execute function private.touch_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- Fonctions d'appartenance (anti-récursion)
-- `security definer` : s'exécutent avec les droits du propriétaire,
-- donc lisent `family_members` sans déclencher sa propre RLS.
-- `set search_path = ''` : exigé par le linter Supabase, d'où les
-- noms pleinement qualifiés.
-- ═══════════════════════════════════════════════════════════════

create or replace function private.user_families()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select fm.family_id
  from public.family_members fm
  where fm.user_id = (select auth.uid());
$$;

revoke all on function private.user_families() from public, anon;
grant execute on function private.user_families() to authenticated;

create or replace function private.owns_family(target_family uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family
      and fm.user_id = (select auth.uid())
      and fm.role = 'owner'
  );
$$;

revoke all on function private.owns_family(uuid) from public, anon;
grant execute on function private.owns_family(uuid) to authenticated;

-- Les identifiants des personnes qui partagent au moins une maison
-- avec l'utilisateur courant. Sert aux policies de `public.users`.
create or replace function private.housemates()
returns setof uuid
language sql
security definer
set search_path = ''
stable
as $$
  select distinct fm.user_id
  from public.family_members fm
  where fm.family_id in (
    select fm2.family_id
    from public.family_members fm2
    where fm2.user_id = (select auth.uid())
  );
$$;

revoke all on function private.housemates() from public, anon;
grant execute on function private.housemates() to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Création du profil à l'inscription
-- ═══════════════════════════════════════════════════════════════
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_name text;
begin
  -- Google renvoie `full_name` / `name`, le magic link ne renvoie rien.
  -- On se rabat sur la partie locale de l'email, capitalisée : mieux
  -- vaut « Jonathan » qu'un champ vide à l'écran.
  raw_name := coalesce(
    new.raw_user_meta_data ->> 'given_name',
    split_part(coalesce(new.raw_user_meta_data ->> 'full_name', ''), ' ', 1),
    ''
  );

  if raw_name = '' then
    raw_name := initcap(split_part(new.email, '@', 1));
  end if;

  insert into public.users (id, email, first_name, avatar)
  values (new.id, new.email, raw_name, new.id::text)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ═══════════════════════════════════════════════════════════════
-- Row Level Security
-- Chaque policy cible `to authenticated` : sans ça, elle est aussi
-- évaluée pour le rôle `anon` à chaque requête, pour rien.
-- ═══════════════════════════════════════════════════════════════

alter table public.users                enable row level security;
alter table public.families             enable row level security;
alter table public.family_members       enable row level security;
alter table public.events               enable row level security;
alter table public.event_participants   enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.family_invites       enable row level security;
alter table public.ai_conversations     enable row level security;
alter table public.ai_messages          enable row level security;
alter table public.audio_generations    enable row level security;

-- ── users ────────────────────────────────────────────────────────
-- On voit les gens de sa maison, et soi-même avant d'avoir rejoint
-- quoi que ce soit (sinon l'onboarding ne peut pas lire son profil).
create policy users_select_housemates on public.users
  for select to authenticated
  using ( id = (select auth.uid()) or id in (select private.housemates()) );

create policy users_update_self on public.users
  for update to authenticated
  using      ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

-- ── families ─────────────────────────────────────────────────────
create policy families_select_own on public.families
  for select to authenticated
  using ( id in (select private.user_families()) );

-- N'importe qui peut créer une maison ; la policy d'insertion de
-- `family_members` gère l'auto-rattachement comme propriétaire.
create policy families_insert_any on public.families
  for insert to authenticated
  with check ( true );

create policy families_update_owner on public.families
  for update to authenticated
  using      ( (select private.owns_family(id)) )
  with check ( (select private.owns_family(id)) );

-- ── family_members ───────────────────────────────────────────────
create policy members_select_same_family on public.family_members
  for select to authenticated
  using ( family_id in (select private.user_families()) );

-- Deux cas légitimes : je me rattache moi-même (création de maison ou
-- acceptation d'invitation), ou je suis propriétaire et j'ajoute
-- quelqu'un.
create policy members_insert_self_or_owner on public.family_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or (select private.owns_family(family_id))
  );

create policy members_delete_self_or_owner on public.family_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.owns_family(family_id))
  );

-- ── events ───────────────────────────────────────────────────────
create policy events_select_own_families on public.events
  for select to authenticated
  using ( family_id in (select private.user_families()) );

create policy events_insert_own_families on public.events
  for insert to authenticated
  with check (
    family_id in (select private.user_families())
    and creator_id = (select auth.uid())
  );

-- Tout le monde dans la maison peut déplacer un événement de la
-- maison : c'est un agenda partagé, pas un système de tickets.
create policy events_update_own_families on public.events
  for update to authenticated
  using      ( family_id in (select private.user_families()) )
  with check ( family_id in (select private.user_families()) );

create policy events_delete_own_families on public.events
  for delete to authenticated
  using ( family_id in (select private.user_families()) );

-- ── event_participants ───────────────────────────────────────────
create policy participants_select_visible_events on public.event_participants
  for select to authenticated
  using (
    event_id in (
      select e.id from public.events e
      where e.family_id in (select private.user_families())
    )
  );

create policy participants_insert_visible_events on public.event_participants
  for insert to authenticated
  with check (
    event_id in (
      select e.id from public.events e
      where e.family_id in (select private.user_families())
    )
  );

-- Répondre à une invitation ne concerne que soi. Le créateur peut en
-- revanche retirer quelqu'un.
create policy participants_update_self on public.event_participants
  for update to authenticated
  using      ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

create policy participants_delete_self_or_creator on public.event_participants
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or event_id in (
      select e.id from public.events e where e.creator_id = (select auth.uid())
    )
  );

-- ── calendar_connections ─────────────────────────────────────────
-- Strictement personnel. Les autres membres n'ont pas à savoir quels
-- agendas quelqu'un a connectés — ils en voient seulement le résultat.
create policy connections_all_self on public.calendar_connections
  for all to authenticated
  using      ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

-- ── family_invites ───────────────────────────────────────────────
create policy invites_select_own_families on public.family_invites
  for select to authenticated
  using ( family_id in (select private.user_families()) );

create policy invites_insert_member on public.family_invites
  for insert to authenticated
  with check (
    family_id in (select private.user_families())
    and invited_by = (select auth.uid())
  );

create policy invites_delete_owner on public.family_invites
  for delete to authenticated
  using ( (select private.owns_family(family_id)) );

-- ── Casa AI ──────────────────────────────────────────────────────
-- Une conversation avec l'assistant est privée, même entre membres
-- d'une même maison.
create policy conversations_all_self on public.ai_conversations
  for all to authenticated
  using      ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

create policy messages_all_own_conversations on public.ai_messages
  for all to authenticated
  using (
    conversation_id in (
      select c.id from public.ai_conversations c
      where c.user_id = (select auth.uid())
    )
  )
  with check (
    conversation_id in (
      select c.id from public.ai_conversations c
      where c.user_id = (select auth.uid())
    )
  );

create policy audio_all_self on public.audio_generations
  for all to authenticated
  using      ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );
