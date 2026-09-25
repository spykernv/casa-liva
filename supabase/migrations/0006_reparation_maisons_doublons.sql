-- ═══════════════════════════════════════════════════════════════
-- Casa Liva — réparation : les personnes présentes dans deux maisons
--
-- Migration de DONNÉES, à passer avant 0007. La contrainte d'unicité
-- de 0007 échoue tant qu'un doublon existe.
--
-- Ce qui s'est passé : `create_family` est idempotent — il protège le
-- chemin « invitation, puis inscription ». Mais `accept_family_invite`
-- ajoutait une appartenance sans jamais regarder d'où venait la
-- personne. Le chemin inverse — s'inscrire seul, se créer une maison,
-- puis accepter une invitation — laissait donc quelqu'un dans DEUX
-- maisons. `getCasaContext()` en tirait une au hasard.
--
-- Constaté en production le 3 août 2026 : une habitante voyait sa
-- propre maison vide pendant que le reste de la famille la voyait
-- dans la bonne.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  doublon  record;
  garde    uuid;
  abandon  record;
  autres   integer;
begin
  for doublon in
    select fm.user_id
    from public.family_members fm
    group by fm.user_id
    having count(*) > 1
  loop
    -- On garde la maison la plus habitée : c'est celle où la personne
    -- a été invitée, pas la coquille que l'onboarding lui a créée.
    -- À égalité, la plus ancienne — un critère stable vaut mieux
    -- qu'un tirage au sort, même pour un cas qui n'arrivera pas.
    select fm.family_id into garde
    from public.family_members fm
    where fm.user_id = doublon.user_id
    order by (
      select count(*) from public.family_members x where x.family_id = fm.family_id
    ) desc, fm.joined_at asc
    limit 1;

    for abandon in
      select fm.family_id
      from public.family_members fm
      where fm.user_id = doublon.user_id
        and fm.family_id <> garde
    loop
      select count(*) into autres
      from public.family_members fm
      where fm.family_id = abandon.family_id
        and fm.user_id <> doublon.user_id;

      if autres > 0 then
        -- Deux maisons habitées : on ne choisit pas à la place des
        -- gens, et on ne vide pas la maison des autres. On s'arrête
        -- bruyamment plutôt que de laisser 0007 échouer sur une 23505
        -- que personne ne saura interpréter.
        raise exception
          'Réparation impossible : % appartient à plusieurs maisons habitées. À trancher à la main.',
          doublon.user_id;
      end if;

      -- Re-parenter AVANT de supprimer. `families` cascade vers
      -- events, calendar_connections, ai_conversations,
      -- family_invites et family_members : écrites dans l'autre sens,
      -- ces lignes détruiraient sans un mot tout ce que la personne a
      -- créé en croyant être dans l'agenda familial.
      update public.events               set family_id = garde where family_id = abandon.family_id;
      update public.calendar_connections set family_id = garde where family_id = abandon.family_id;
      update public.ai_conversations     set family_id = garde where family_id = abandon.family_id;

      -- Les invitations ne suivent pas : les transporter ferait entrer
      -- chez l'hôte quelqu'un qu'il n'a jamais invité.
      delete from public.family_invites  where family_id = abandon.family_id;

      delete from public.family_members  where family_id = abandon.family_id;
      delete from public.families        where id = abandon.family_id;

      raise notice 'Maison % fusionnée dans % pour %',
        abandon.family_id, garde, doublon.user_id;
    end loop;
  end loop;
end;
$$;

-- ── Les coquilles vides ──────────────────────────────────────────
-- Une maison sans habitant n'est atteignable par personne : la RLS
-- passe par `private.user_families()`, qui lit `family_members`.
--
-- Il en traînait neuf. Huit venaient de `scripts/verify-rls.mjs`, qui
-- supprimait ses comptes de test sans supprimer leurs maisons — la
-- cascade part de `users` vers `family_members`, jamais vers
-- `families`. Le script a été corrigé ; ceci nettoie l'existant.
delete from public.families f
where not exists (
  select 1 from public.family_members m where m.family_id = f.id
);
