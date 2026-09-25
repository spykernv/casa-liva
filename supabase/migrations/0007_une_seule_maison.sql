-- ═══════════════════════════════════════════════════════════════
-- Casa Liva — une seule maison par personne
--
-- Le produit parle de LA maison. Le commentaire de 0002 l'affirmait
-- déjà (« Casa Liva est mono-foyer »). La base, elle, autorisait N :
-- `family_members` a pour clé primaire (family_id, user_id), et
-- `accept_family_invite` ajoutait une appartenance sans jamais
-- regarder d'où venait la personne.
--
-- L'intention était en commentaire ; elle devient une contrainte.
--
-- PRÉREQUIS : 0006 doit être passée. L'unicité de l'étape 6 échoue
-- tant qu'un doublon existe.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Une couleur libre, sans voler celle qu'on vient de choisir ──
--
-- L'ancienne version calculait les couleurs prises APRÈS l'insertion
-- de l'appartenance : la personne comptait sa propre couleur parmi
-- les prises, et en changeait donc systématiquement. On choisit bleu
-- à l'écran d'avant, on se retrouve vert.
--
-- `keep_user` exclut la personne du calcul : elle garde sa couleur
-- si personne d'autre ne l'a. Changer la couleur de quelqu'un sans
-- le prévenir, c'est changer sa place dans la grille.
drop function if exists private.next_free_color(uuid);

create function private.next_free_color(
  target_family uuid,
  keep_user     uuid default null
)
returns public.member_color
language sql
security definer
set search_path = ''
stable
as $$
  with prises as (
    select u.color
    from public.family_members fm
    join public.users u on u.id = fm.user_id
    where fm.family_id = target_family
      and (keep_user is null or fm.user_id <> keep_user)
  )
  select coalesce(
    (select u.color
       from public.users u
      where u.id = keep_user
        and u.color not in (select color from prises)),
    (select c
       from unnest(enum_range(null::public.member_color)) as c
      where c not in (select color from prises)
      limit 1),
    'blue'::public.member_color
  );
$$;

revoke all on function private.next_free_color(uuid, uuid) from public, anon;

-- ── 2. Le déménagement, en un seul endroit ────────────────────────
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
    -- events, calendar_connections, ai_conversations, family_invites
    -- et family_members : écrites dans l'autre sens, ces lignes
    -- détruiraient tout ce que la personne a créé, sans une erreur.
    update public.events               set family_id = p_family where family_id = ancienne;
    update public.calendar_connections set family_id = p_family where family_id = ancienne;
    update public.ai_conversations     set family_id = p_family where family_id = ancienne;

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

-- ── 3. Créer sa maison ────────────────────────────────────────────
create or replace function public.create_family(family_name text default 'Casa Liva')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me       uuid := (select auth.uid());
  existing uuid;
  new_id   uuid;
begin
  if me is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;

  -- Deux onboardings lancés en même temps (double-tap, deux onglets)
  -- créaient deux maisons. Depuis la contrainte, le second échouerait
  -- en pleine figure.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(me::text, 0));

  -- Plus de `limit 1` : la base garantit désormais une seule
  -- appartenance, et une deuxième ligne doit crier plutôt que d'être
  -- tirée au sort.
  select fm.family_id into existing
  from public.family_members fm
  where fm.user_id = me;

  if existing is not null then
    return existing;
  end if;

  insert into public.families (name)
  values (coalesce(nullif(trim(family_name), ''), 'Casa Liva'))
  returning id into new_id;

  insert into public.family_members (family_id, user_id, role)
  values (new_id, me, 'owner');

  -- `keep_user` : la couleur choisie deux écrans plus tôt survit.
  update public.users
  set color = (select private.next_free_color(new_id, me))
  where id = me;

  return new_id;
end;
$$;

revoke all on function public.create_family(text) from public, anon;
grant execute on function public.create_family(text) to authenticated;

-- ── 4. Rejoindre une maison, c'est déménager ──────────────────────
--
-- Le jeton reste le secret. Ce qui change : on ne s'ajoute plus, on
-- se déplace. Et chaque échec porte un identifiant machine dans
-- `detail` — l'écran ne doit plus deviner le cas en filtrant du
-- français avec des expressions régulières.
create or replace function public.accept_family_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me     uuid := (select auth.uid());
  invite public.family_invites%rowtype;
begin
  if me is null then
    raise exception 'Non authentifié' using errcode = '42501';
  end if;

  select * into invite
  from public.family_invites fi
  where fi.token = invite_token
  limit 1;

  if invite.id is null then
    raise exception 'Invitation introuvable'
      using errcode = 'P0001', detail = 'casa:introuvable';
  end if;

  -- Ce contrôle passe AVANT celui d'`accepted_at` : recliquer son
  -- propre lien une fois entré n'est pas une panne, et n'a aucune
  -- raison d'afficher « invitation déjà utilisée ».
  if exists (
    select 1 from public.family_members fm
    where fm.user_id = me and fm.family_id = invite.family_id
  ) then
    return invite.family_id;
  end if;

  if invite.accepted_at is not null then
    raise exception 'Invitation déjà utilisée'
      using errcode = 'P0001', detail = 'casa:deja-servie';
  end if;
  if invite.expires_at < now() then
    raise exception 'Invitation expirée'
      using errcode = 'P0001', detail = 'casa:expiree';
  end if;

  perform private.move_into_family(me, invite.family_id, 'member');

  update public.family_invites
  set accepted_at = now()
  where id = invite.id;

  return invite.family_id;
end;
$$;

revoke all on function public.accept_family_invite(text) from public, anon;
grant execute on function public.accept_family_invite(text) to authenticated;

-- ── 5. Plus aucune écriture directe sur family_members ────────────
--
-- Cette policy datait de l'époque où le client insérait lui-même, en
-- deux requêtes. 0002 l'a remplacée par des RPC atomiques, et
-- personne ne l'a retirée. Elle laissait un `POST` direct sur
-- `/rest/v1/family_members`, avec la clé anon publique, contourner
-- entièrement le jeton d'invitation.
--
-- Les deux seules portes d'entrée sont désormais `create_family` et
-- `accept_family_invite`, toutes deux SECURITY DEFINER — donc
-- insensibles à l'absence de policy.
drop policy members_insert_self_or_owner on public.family_members;

-- ── 6. La garantie ────────────────────────────────────────────────
alter table public.family_members
  add constraint family_members_one_per_user unique (user_id);

comment on constraint family_members_one_per_user on public.family_members is
  'Casa Liva parle de LA maison. Sans cette contrainte, getCasaContext() tirait une maison au hasard quand quelqu''un en avait deux.';

-- ── 7. Index ──────────────────────────────────────────────────────
-- L'unicité crée son propre index sur (user_id) : l'ancien fait
-- doublon exact, et coûte une écriture de plus à chaque adhésion.
drop index if exists public.family_members_user_id_idx;

-- Clé étrangère oubliée par 0004 : sans index, le déménagement et la
-- cascade de suppression font un parcours séquentiel de `events`.
create index if not exists calendar_connections_family_idx
  on public.calendar_connections (family_id);
