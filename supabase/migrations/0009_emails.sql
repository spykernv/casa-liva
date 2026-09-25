-- ═══════════════════════════════════════════════════════════════
-- 0009 — Phase 6 : les emails
--
-- Deux ajouts, et une seule idée derrière chacun.
-- ═══════════════════════════════════════════════════════════════

-- ── Ne plus recevoir ─────────────────────────────────────────────
--
-- `PLAN.md` ne le demande pas. Il le faut quand même, et **avant** le
-- premier envoi automatique.
--
-- Quelqu'un à qui on écrit sans qu'il puisse arrêter finit par marquer
-- comme indésirable — et ce n'est pas ce message-là qu'il condamne,
-- c'est le domaine `casaliva.app` en entier. Or le lien de connexion
-- est un email : on se couperait de l'application elle-même. C'est
-- exactement la panne du 3 août (JON-36), par un autre chemin.
--
-- Le réglage ne couvre que les envois **subis** : résumés et rappels.
-- Une invitation à un événement et un lien de connexion répondent à
-- une action de quelqu'un ; les taire trahirait l'attente.

alter table public.users
  add column if not exists wants_digests boolean not null default true;

comment on column public.users.wants_digests is
  'Résumés et rappels automatiques. N''affecte ni les invitations à un événement, ni le lien de connexion : ceux-là répondent à une action.';

-- ── Répondre à une invitation depuis l'email ─────────────────────
--
-- §16 montre « [ Je viens ] [ Pas dispo ] » dans le message lui-même.
-- Pour que ça marche sans connexion, il faut un secret par personne et
-- par événement.
--
-- **Pourquoi une table à part, et pas une colonne sur
-- `event_participants`.** Cette table-là est lisible par toute la
-- maison (`participants_select_visible_events`) : un jeton posé dessus
-- serait lisible par tout le monde depuis la console du navigateur, et
-- n'importe qui pourrait répondre à la place de n'importe qui. Une
-- colonne révoquée aurait pu marcher, mais chez Postgres un `revoke`
-- de colonne ne fait rien tant que le rôle garde le privilège de
-- table — c'est précisément le piège que D12 documente pour les
-- fonctions, sous une autre forme.
--
-- Ici : RLS active, **aucune policy**. Personne n'y accède depuis une
-- session utilisateur, quel que soit le rôle. Seule la clé de service
-- passe, et c'est elle qui envoie les emails.
--
-- Conséquence voulue : un jeton n'existe que si un email est parti.

create table if not exists public.event_rsvp_tokens (
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.users(id)  on delete cascade,
  token      text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.event_rsvp_tokens enable row level security;

-- Aucune policy, volontairement. Ce n'est pas un oubli : c'est la
-- protection. L'advisor Supabase le signalera en « RLS enabled, no
-- policy » — c'est l'état recherché.

-- La clé primaire couvre déjà `(event_id, user_id)` ; il manque le
-- chemin inverse, celui qu'emprunte la cascade de `users`.
create index if not exists event_rsvp_tokens_user_idx
  on public.event_rsvp_tokens (user_id);
