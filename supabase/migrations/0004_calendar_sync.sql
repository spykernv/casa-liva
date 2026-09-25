-- ═══════════════════════════════════════════════════════════════
-- Casa Liva — phase 4 : agendas externes
--
-- Trois choses manquaient pour synchroniser réellement un agenda :
--
-- 1. Un lien entre un événement importé et la connexion qui l'a
--    apporté. C'est lui qui rend la déconnexion propre : supprimer la
--    connexion emporte ses événements, sans script de nettoyage.
-- 2. Une clé d'unicité pour pouvoir faire un `upsert` à chaque passage
--    de synchronisation plutôt que de vider et tout réécrire.
-- 3. Un accès aux jetons OAuth. `private` n'est pas exposé par
--    PostgREST : même la clé de service ne peut pas l'atteindre en
--    direct. Il faut des fonctions `public` en SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════

-- ── calendar_connections ─────────────────────────────────────────

-- Le cœur de l'app parle de **curseur opaque**, pas de `syncToken` :
-- Google a un `syncToken`, Microsoft Graph des *delta tokens*, CalDAV
-- un `ctag`. Le nom de la colonne suit l'interface, pas le
-- fournisseur (cf. DECISIONS.md, D10).
alter table public.calendar_connections rename column sync_token to sync_cursor;

alter table public.calendar_connections
  -- La maison dans laquelle ces événements atterrissent.
  --
  -- Sans elle, le cron ne saurait pas où écrire : rien n'interdit
  -- d'appartenir à deux maisons (`private.user_families()` renvoie un
  -- ensemble), et deviner au moment de la synchronisation ferait
  -- basculer des événements d'une maison à l'autre selon l'ordre des
  -- lignes. On la fige à la connexion.
  add column family_id uuid references public.families(id) on delete cascade,

  -- Le nom tel qu'il s'affiche chez le fournisseur (« Perso »,
  -- « Boulot »). Mémorisé pour ne pas avoir à appeler Google juste
  -- pour écrire un libellé à l'écran.
  add column name text not null default '',

  -- Le jeton a été révoqué, ou a expiré côté Google. La personne doit
  -- reconnecter son agenda — et doit pouvoir le découvrir seule, donc
  -- ce drapeau est lisible sous RLS, contrairement au jeton lui-même.
  add column needs_reauth boolean not null default false,

  -- Dernier échec, pour que la page des réglages puisse dire ce qui
  -- s'est passé plutôt que « quelque chose a échoué ».
  add column last_error text,
  add column last_error_at timestamptz,

  -- Date de la dernière lecture COMPLÈTE.
  --
  -- Une synchronisation incrémentale ne suffit pas éternellement :
  -- Google ne développe les occurrences d'un événement récurrent que
  -- jusqu'à la borne `timeMax` de la lecture initiale. Les occurrences
  -- au-delà n'existent pas encore, donc aucun changement ne les
  -- annoncera jamais. Sans relecture complète périodique, l'agenda se
  -- viderait tout seul par le fond au bout d'un an — panne lente,
  -- silencieuse, et très difficile à diagnostiquer après coup.
  add column last_full_sync_at timestamptz;

-- Une connexion est **la** ligne qui dit « ce calendrier est
-- synchronisé ». La décocher supprime la ligne, donc ses événements.
-- Pas de colonne `enabled` : deux façons de dire la même chose
-- finissent toujours par diverger.

-- ── events ───────────────────────────────────────────────────────

alter table public.events
  add column connection_id uuid
    references public.calendar_connections(id) on delete cascade,

  -- L'événement mobilise-t-il réellement la personne ?
  --
  -- Google distingue « Occupé » de « Disponible » (`transparency`), et
  -- la nuance décide de tout pour Casa Liva : sans elle, un
  -- « Anniversaire de Mamie » sur toute la journée rendrait la famille
  -- indisponible du matin au soir, et « ✨ tout le monde est libre » —
  -- le moment que le produit existe pour créer — ne s'afficherait
  -- plus jamais un jour de vacances.
  --
  -- Un événement créé dans Casa Liva occupe toujours : le défaut est
  -- `true`, et rien dans l'app ne l'écrit à `false` pour l'instant.
  add column busy boolean not null default true;

-- Un événement externe est identifié par (connexion, identifiant chez
-- le fournisseur). Deux habitants invités au même événement Google en
-- ont chacun une copie : ce sont deux lignes, une par connexion, et
-- c'est voulu — chacun a sa couleur et sa confidentialité.
--
-- Index **non partiel**, volontairement. Un `where connection_id is
-- not null` serait plus étroit, mais PostgREST ne transmet que des
-- noms de colonnes dans `on_conflict` — jamais le prédicat — et
-- Postgres refuserait alors d'inférer l'index : tous les `upsert` de
-- la synchronisation échoueraient.
--
-- Sans prédicat, les événements créés dans Casa Liva portent
-- `(null, null)`. Ce n'est pas un conflit : Postgres considère deux
-- NULL comme distincts, donc autant de lignes qu'on veut.
create unique index events_connection_external_key
  on public.events (connection_id, external_event_id);

-- Pas d'index supplémentaire sur `connection_id` seul : la colonne de
-- tête de l'index ci-dessus fait déjà le travail, y compris pour la
-- cascade de suppression.

-- ── Un événement importé n'est pas modifiable dans Casa Liva ─────
--
-- Le bloquer seulement dans l'UI ne suffit pas : la clé anon est
-- publique, et la policy actuelle autorise n'importe quel membre à
-- écrire sur n'importe quel événement de la maison. Or la prochaine
-- synchronisation écraserait la modification sans rien dire — une
-- action qui ne tient pas est pire qu'une action refusée.
--
-- La règle appartient donc à la base. Elle tombera le jour où l'on
-- écrira réellement chez Google (le scope est déjà là, cf. D9).

drop policy events_insert_own_families on public.events;
create policy events_insert_own_families on public.events
  for insert to authenticated
  with check (
    family_id in (select private.user_families())
    and creator_id = (select auth.uid())
    -- Personne ne fabrique un événement « importé » à la main.
    and connection_id is null
  );

drop policy events_update_own_families on public.events;
create policy events_update_own_families on public.events
  for update to authenticated
  using      ( family_id in (select private.user_families()) and connection_id is null )
  with check ( family_id in (select private.user_families()) and connection_id is null );

drop policy events_delete_own_families on public.events;
create policy events_delete_own_families on public.events
  for delete to authenticated
  using ( family_id in (select private.user_families()) and connection_id is null );

-- ═══════════════════════════════════════════════════════════════
-- Jetons OAuth — passe-plat vers le schéma privé
--
-- `private` n'est volontairement pas dans « Exposed schemas », donc
-- PostgREST refuse `.schema("private").from("oauth_credentials")`,
-- clé de service comprise. Ces fonctions vivent dans `public` pour
-- être appelables par `.rpc()`, s'exécutent avec les droits de leur
-- propriétaire pour atteindre `private`, et sont révoquées pour tout
-- le monde sauf `service_role`.
--
-- Une fonction est exécutable par PUBLIC par défaut. Le `revoke`
-- n'est donc pas décoratif : sans lui, n'importe quel visiteur muni
-- de la clé anon lirait les jetons de tout le monde.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.save_oauth_credentials(
  p_user_id       uuid,
  p_provider      text,
  p_refresh_token text,
  p_access_token  text,
  p_expires_at    timestamptz,
  p_scopes        text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.oauth_credentials as c
    (user_id, provider, refresh_token, access_token, expires_at, scopes, updated_at)
  values
    (p_user_id, p_provider, p_refresh_token, p_access_token, p_expires_at, p_scopes, now())
  on conflict (user_id) do update set
    provider      = excluded.provider,
    -- Google n'émet un refresh token qu'au consentement. Un second
    -- passage sans `prompt=consent` n'en renvoie pas : écraser
    -- l'ancien par une valeur vide déconnecterait silencieusement la
    -- personne, et il faudrait redemander le consentement.
    refresh_token = coalesce(nullif(excluded.refresh_token, ''), c.refresh_token),
    access_token  = excluded.access_token,
    expires_at    = excluded.expires_at,
    scopes        = coalesce(nullif(excluded.scopes, ''), c.scopes),
    updated_at    = now();
$$;

-- Après un rafraîchissement : seul l'access token change.
create or replace function public.save_oauth_access_token(
  p_user_id      uuid,
  p_provider     text,
  p_access_token text,
  p_expires_at   timestamptz
)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.oauth_credentials
     set access_token = p_access_token,
         expires_at   = p_expires_at,
         updated_at   = now()
   where user_id = p_user_id
     and provider = p_provider;
$$;

create or replace function public.get_oauth_credentials(
  p_user_id  uuid,
  p_provider text
)
returns table (
  refresh_token text,
  access_token  text,
  expires_at    timestamptz,
  scopes        text
)
language sql
security definer
set search_path = ''
stable
as $$
  select c.refresh_token, c.access_token, c.expires_at, c.scopes
  from private.oauth_credentials c
  where c.user_id = p_user_id
    and c.provider = p_provider;
$$;

create or replace function public.delete_oauth_credentials(
  p_user_id  uuid,
  p_provider text
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.oauth_credentials
   where user_id = p_user_id
     and provider = p_provider;
$$;

revoke all on function public.save_oauth_credentials(uuid, text, text, text, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.save_oauth_access_token(uuid, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_oauth_credentials(uuid, text)
  from public, anon, authenticated;
revoke all on function public.delete_oauth_credentials(uuid, text)
  from public, anon, authenticated;

grant execute on function public.save_oauth_credentials(uuid, text, text, text, timestamptz, text)
  to service_role;
grant execute on function public.save_oauth_access_token(uuid, text, text, timestamptz)
  to service_role;
grant execute on function public.get_oauth_credentials(uuid, text)
  to service_role;
grant execute on function public.delete_oauth_credentials(uuid, text)
  to service_role;
