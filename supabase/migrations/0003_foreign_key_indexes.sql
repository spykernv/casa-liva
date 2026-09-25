-- ═══════════════════════════════════════════════════════════════
-- Index de clés étrangères manquants.
--
-- Postgres n'indexe pas automatiquement le côté « enfant » d'une clé
-- étrangère. Sans index, chaque suppression du côté parent déclenche
-- un parcours séquentiel de la table enfant pour vérifier la
-- contrainte — et `on delete cascade` en fait beaucoup.
--
-- Signalé par le linter Supabase (0001_unindexed_foreign_keys).
-- ═══════════════════════════════════════════════════════════════

create index if not exists events_creator_idx
  on public.events (creator_id);

create index if not exists family_invites_family_idx
  on public.family_invites (family_id);

create index if not exists family_invites_invited_by_idx
  on public.family_invites (invited_by);

create index if not exists ai_conversations_family_idx
  on public.ai_conversations (family_id);
