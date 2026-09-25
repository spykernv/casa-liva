-- ═══════════════════════════════════════════════════════════════
-- 0010 — Se désabonner sans se connecter
--
-- `wants_digests` (0009) dit *si* on reçoit. Il manquait le moyen de
-- l'éteindre **depuis l'email**, sans ouvrir l'application.
--
-- Ce n'est pas du confort. Gmail et Outlook affichent leur propre
-- bouton « Se désabonner » quand l'en-tête `List-Unsubscribe` est
-- présent, et dégradent la réputation du domaine quand il manque sur
-- des envois périodiques. Sans lui, les gens marquent comme
-- indésirable — et ce qu'ils condamnent alors, c'est `casaliva.app`
-- en entier, lien de connexion compris. On connaît déjà le prix d'un
-- domaine qui n'écrit plus (JON-36).
--
-- Même schéma de protection que `event_rsvp_tokens` (0009), et pour la
-- même raison : la table `users` est lisible par toute la maison, donc
-- un jeton posé dessus permettrait à n'importe qui de désabonner
-- n'importe qui. Ici, RLS active et **aucune policy** — seule la clé
-- de service passe, c'est-à-dire seul le code qui envoie les emails.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.unsubscribe_tokens (
  user_id    uuid primary key references public.users(id) on delete cascade,
  token      text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

alter table public.unsubscribe_tokens enable row level security;

-- Aucune policy, volontairement. Voir 0009.
