-- ═══════════════════════════════════════════════════════════════
-- 0008 — On ne modifie pas l'événement de quelqu'un d'autre
--
-- Renversement assumé de la migration 0001, décidé par le
-- commanditaire le 3 août 2026. Voir D21 et JON-39.
--
-- 0001 écrivait l'inverse, et l'argumentait :
--
--   « Tout le monde dans la maison peut déplacer un événement de la
--     maison : c'est un agenda partagé, pas un système de tickets. »
--
-- La règle devient : **un événement appartient à qui l'organise.** Les
-- autres répondent « je viens » ou « pas dispo », et c'est tout. Les
-- lieux, eux, resteront communs et modifiables par tous (JON-38) — un
-- lieu appartient à la maison, personne n'en est propriétaire.
--
-- Les policies changent de nom en même temps que de sens.
-- `events_update_own_families` décrirait désormais l'inverse de ce
-- qu'elle fait, et ce projet a déjà payé pour savoir ce que coûte un
-- libellé qui ment sur son effet (D17, « Entrer dans la maison »).
-- ═══════════════════════════════════════════════════════════════

-- ── events : modifier et supprimer ───────────────────────────────
--
-- `connection_id is null` est conservé tel quel : un événement importé
-- reste intouchable même pour le propriétaire de la connexion (D13).
-- La prochaine synchronisation écraserait la modification sans rien
-- dire, et une action qui ne tient pas est pire qu'un refus.
--
-- `family_id in (…)` est conservé aussi, alors que `creator_id =
-- auth.uid()` semble suffire. Ce n'est pas redondant : c'est ce qui
-- garantit qu'un événement resté en arrière après un déménagement
-- (D18) ne redevient pas modifiable à distance.

drop policy events_update_own_families on public.events;
create policy events_update_own on public.events
  for update to authenticated
  using (
    creator_id = (select auth.uid())
    and connection_id is null
    and family_id in (select private.user_families())
  )
  with check (
    creator_id = (select auth.uid())
    and connection_id is null
    and family_id in (select private.user_families())
  );

drop policy events_delete_own_families on public.events;
create policy events_delete_own on public.events
  for delete to authenticated
  using (
    creator_id = (select auth.uid())
    and connection_id is null
    and family_id in (select private.user_families())
  );

-- ── event_participants : inviter, c'est modifier ─────────────────
--
-- `participants_insert_visible_events` laissait n'importe quel membre
-- ajouter n'importe qui à n'importe quel événement de la maison. La
-- règle du dessus n'aurait alors tenu qu'à moitié : on ne pouvait plus
-- déplacer le golf de quelqu'un, mais on pouvait encore y convier la
-- terre entière — et c'est bien une modification de son événement.
--
-- Deux cas restent ouverts, et un seul est fermé :
--   * le créateur invite qui il veut sur SON événement ;
--   * n'importe qui s'ajoute LUI-MÊME (« finalement je viens ») ;
--   * personne n'ajoute quelqu'un d'autre à l'événement d'un tiers.
--
-- `participants_update_self` (0001) n'a pas besoin de changer : elle
-- limite déjà la réponse à soi-même, ce qui est exactement ce que D21
-- laisse à tout le monde.

drop policy participants_insert_visible_events on public.event_participants;
create policy participants_insert_self_or_creator on public.event_participants
  for insert to authenticated
  with check (
    event_id in (
      select e.id from public.events e
      where e.family_id in (select private.user_families())
    )
    and (
      user_id = (select auth.uid())
      or event_id in (
        select e.id from public.events e
        where e.creator_id = (select auth.uid())
      )
    )
  );
