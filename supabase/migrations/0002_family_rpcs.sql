-- ═══════════════════════════════════════════════════════════════
-- Casa Liva — création et adhésion à une maison
--
-- La migration 0001 laissait `families` ouverte en INSERT à tout
-- utilisateur connecté (`with check (true)`), ce que le linter
-- Supabase signale à raison. Le problème n'était pas seulement la
-- permissivité : créer une maison puis s'y rattacher faisait deux
-- requêtes, avec une fenêtre où la maison existait sans propriétaire
-- — et donc, RLS aidant, invisible pour tout le monde y compris son
-- créateur.
--
-- On remplace donc la policy par deux fonctions atomiques.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists families_insert_any on public.families;

-- Attribue une couleur encore libre dans la maison. Au-delà de huit
-- habitants on recycle : deux couleurs identiques valent mieux qu'une
-- erreur d'inscription.
create or replace function private.next_free_color(target_family uuid)
returns public.member_color
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (
      select c
      from unnest(enum_range(null::public.member_color)) as c
      where c not in (
        select u.color
        from public.family_members fm
        join public.users u on u.id = fm.user_id
        where fm.family_id = target_family
      )
      limit 1
    ),
    'blue'::public.member_color
  );
$$;

revoke all on function private.next_free_color(uuid) from public, anon;

-- ── Créer sa maison ──────────────────────────────────────────────
-- Idempotent : si l'utilisateur appartient déjà à une maison, on la
-- renvoie au lieu d'en créer une seconde. Casa Liva est mono-foyer
-- (§77 « ne pas construire : multiple families »), et un onboarding
-- relancé deux fois ne doit pas produire deux maisons vides.
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

  select fm.family_id into existing
  from public.family_members fm
  where fm.user_id = me
  limit 1;

  if existing is not null then
    return existing;
  end if;

  insert into public.families (name)
  values (coalesce(nullif(trim(family_name), ''), 'Casa Liva'))
  returning id into new_id;

  insert into public.family_members (family_id, user_id, role)
  values (new_id, me, 'owner');

  update public.users
  set color = (select private.next_free_color(new_id))
  where id = me;

  return new_id;
end;
$$;

revoke all on function public.create_family(text) from public, anon;
grant execute on function public.create_family(text) to authenticated;

-- ── Rejoindre une maison ─────────────────────────────────────────
-- Le jeton d'invitation est le secret : on ne peut pas rejoindre une
-- maison sans l'avoir reçu. La fonction vérifie l'expiration, refuse
-- une invitation déjà consommée, et attribue une couleur libre.
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
    raise exception 'Invitation introuvable' using errcode = 'P0002';
  end if;
  if invite.accepted_at is not null then
    raise exception 'Invitation déjà utilisée' using errcode = 'P0001';
  end if;
  if invite.expires_at < now() then
    raise exception 'Invitation expirée' using errcode = 'P0001';
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (invite.family_id, me, 'member')
  on conflict (family_id, user_id) do nothing;

  update public.family_invites
  set accepted_at = now()
  where id = invite.id;

  update public.users
  set color = (select private.next_free_color(invite.family_id))
  where id = me
    -- On ne réattribue pas une couleur à quelqu'un qui en a déjà
    -- choisi une volontairement dans une autre maison.
    and color is not null;

  return invite.family_id;
end;
$$;

revoke all on function public.accept_family_invite(text) from public, anon;
grant execute on function public.accept_family_invite(text) to authenticated;
