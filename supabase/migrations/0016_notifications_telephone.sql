-- ═══════════════════════════════════════════════════════════════
-- 0016 — Les notifications sur le téléphone
--
-- Ajout au périmètre du 3 août 2026 (D30, §66 bis, JON-47). `PLAN.md`
-- ne prévoyait que l'email, et rangeait même « système de
-- notifications complexe » dans ce qu'il ne faut PAS construire au
-- début (§77). Le commanditaire l'a demandé explicitement.
--
-- ── Un abonnement appartient à un APPAREIL, pas à une personne ──
--
-- D'où une table plutôt qu'une colonne : la même personne a un
-- téléphone et une tablette, et se désabonner de l'un ne doit pas
-- couper l'autre. `endpoint` est l'adresse que le service de push
-- (Apple, Google) attribue à cette installation précise — elle est
-- donc unique, et c'est elle qui fait l'identité.
--
-- **`on delete cascade` sur `user_id`** : quelqu'un qui quitte la
-- maison ne doit pas laisser derrière lui une adresse qui notifie
-- encore.
--
-- ── Pourquoi `echecs` et `dernier_succes_at` ──
--
-- **Un abonnement Web Push meurt sans prévenir** : réinstallation,
-- permission retirée, appareil effacé. Le service répond alors `404`
-- ou `410`, une seule fois — après quoi il accepte tout sans rien
-- livrer. Sans compteur, la file d'envoi se remplit d'adresses
-- fantômes et on ne le voit jamais.
--
-- Même famille de panne que `needs_reauth` sur les jetons Google
-- (0005) : ce qui casse en silence doit laisser une trace en base.
--
-- ── Le réglage, lui, appartient à la personne ──
--
-- `wants_push` est le pendant de `wants_digests` (0009). Deux
-- interrupteurs et non un, décidé avec le commanditaire : le push
-- passe en premier, l'email prend le relais quand il n'y a pas
-- d'abonnement — sinon un téléphone muet ou une permission refusée
-- laisserait quelqu'un sans rien, sans qu'il comprenne pourquoi.
--
-- Additive : les lignes existantes prennent `true`, c'est-à-dire
-- « d'accord pour être prévenu » — ce qui ne change rien tant que
-- personne n'est abonné.
--
-- Répercutée dans `types/database.ts` dans le même commit.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,

  -- L'adresse attribuée par Apple ou Google à CETTE installation.
  endpoint text not null unique,
  -- Les deux clés du navigateur, qui chiffrent la charge utile.
  p256dh text not null,
  auth text not null,

  -- De quoi reconnaître un appareil dans `/moi` sans le pister :
  -- « iPhone », « Android ». Jamais l'agent utilisateur complet.
  appareil text,

  created_at timestamptz not null default now(),
  dernier_succes_at timestamptz,
  echecs integer not null default 0
);

comment on table public.push_subscriptions is
  'Un abonnement Web Push par appareil. `endpoint` fait l''identité — la même personne peut en avoir plusieurs.';
comment on column public.push_subscriptions.echecs is
  'Envois refusés d''affilée. Un abonnement meurt sans prévenir (404/410) : sans ce compteur, la file se remplit d''adresses fantômes.';

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- ── Chacun ne voit et ne gère que ses propres appareils ──────────
--
-- Un abonnement est une adresse qui permet d'écrire sur l'écran
-- verrouillé de quelqu'un. Le laisser lisible par la maison
-- reviendrait à laisser n'importe quel habitant retirer — ou pire,
-- deviner — l'adresse de notification d'un autre.
--
-- L'ENVOI, lui, passe par la clé de service (comme les emails) :
-- prévenir Sophie exige de lire l'abonnement de Sophie, ce que la
-- session de celui qui invite ne peut pas faire, et c'est très bien.

drop policy if exists push_lire_les_siens on public.push_subscriptions;
create policy push_lire_les_siens on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists push_ajouter_le_sien on public.push_subscriptions;
create policy push_ajouter_le_sien on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists push_modifier_le_sien on public.push_subscriptions;
create policy push_modifier_le_sien on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists push_retirer_le_sien on public.push_subscriptions;
create policy push_retirer_le_sien on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── Le réglage, à côté de celui des emails ───────────────────────

alter table public.users
  add column if not exists wants_push boolean not null default true;

comment on column public.users.wants_push is
  'Pendant de wants_digests (0009). Le push passe en premier ; l''email prend le relais faute d''abonnement — jamais les deux pour le même événement.';
