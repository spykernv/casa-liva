-- ═══════════════════════════════════════════════════════════════
-- 0011 — Une conversation appartient à une maison qu'on habite
--
-- Trouvé en écrivant le contrôle d'isolation de la phase 7, ce qui
-- est exactement à quoi sert d'écrire le contrôle.
--
-- `conversations_all_self` (0001) ne contraignait que `user_id` :
-- n'importe qui pouvait donc créer sa propre conversation en y
-- inscrivant le `family_id` d'une **autre** maison. Aujourd'hui ça ne
-- révèle rien — `askCasaAI` prend la maison de `getCasaContext()`,
-- jamais celle de la conversation. Mais c'est précisément la forme des
-- pièges que ce projet a déjà payés deux fois : une colonne à laquelle
-- personne ne fait confiance jusqu'au jour où un code pressé s'y fie.
-- La faille inter-maison de `calendar_connections` (0005) était la
-- même, au mot près : la policy contraignait `user_id` et pas
-- `family_id`.
--
-- La table est vide — la phase 7 est le premier code à y écrire — donc
-- cette migration ne peut casser aucune donnée existante.
--
-- Rien à changer dans `types/database.ts` : aucune colonne ne bouge.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists conversations_all_self on public.ai_conversations;

create policy conversations_all_self on public.ai_conversations
  for all to authenticated
  using ( user_id = (select auth.uid()) )
  with check (
    user_id = (select auth.uid())
    -- La maison de la conversation doit être celle qu'on habite.
    -- `private.user_families()` est `security definer` : elle lit
    -- `family_members` sans déclencher la RLS de cette table, donc
    -- sans récursion.
    and family_id in (select private.user_families())
  );
