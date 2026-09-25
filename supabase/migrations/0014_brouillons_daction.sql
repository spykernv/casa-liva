-- ═══════════════════════════════════════════════════════════════
-- 0014 — Un tool d'écriture ne s'exécute pas, il propose
--
-- La table qui rend vraie LA décision de la phase 9 (D41). Casa AI
-- gagne le droit de créer un événement, mais **jamais celui de
-- l'écrire** : `create_event` valide, résout les prénoms en habitants
-- et le jour en date réelle, range le résultat ici, et rend au modèle
-- « aperçu prêt, ne dis pas que c'est fait ». Ce qui écrit, c'est un
-- geste humain qui consomme la ligne une seule fois.
--
-- **Pourquoi une table et pas la conversation.** `loadHistory()`
-- reconstruit les tours d'assistant avec `calls: []` : au tour suivant
-- le modèle ne voit plus ni l'appel ni son résultat. Un aperçu qui
-- vivrait dans la conversation serait donc oublié entre la question et
-- la validation — et « corriger » ferait **réinventer** l'événement au
-- lieu de le corriger. L'état de l'aperçu doit vivre ailleurs que dans
-- la mémoire du modèle, parce que cette mémoire est délibérément
-- courte.
--
-- **Pourquoi un jeton consommable.** Sans lui, recharger la page et
-- rejouer la validation créerait un deuxième événement. Le
-- `consumed_at` fait de l'exécution une opération à usage unique, et
-- c'est la base qui l'arbitre — pas un drapeau côté navigateur, que
-- deux onglets contrediraient.
--
-- **Le jeton *est* l'identifiant de la ligne, et c'est la RLS qui en
-- fait un jeton.** Un second secret n'ajouterait rien : une ligne qui
-- n'appartient pas à l'appelant n'est pas « refusée », elle est
-- introuvable. C'est la différence avec `event_rsvp_tokens` (D26), qui
-- vit dans une table sans policy précisément parce qu'il n'y a aucune
-- session derrière un lien d'email. Ici il y en a une.
--
-- Répercuté dans `types/database.ts` dans le même commit, et
-- `npm run verify:rls` gagne ses contrôles d'isolation dans le même
-- commit aussi — c'est ce qui a attrapé la faille inter-maison de
-- `calendar_connections` en 0005.
-- ═══════════════════════════════════════════════════════════════

create table public.ai_action_drafts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id)    on delete cascade,
  family_id  uuid not null references public.families(id) on delete cascade,

  -- La conversation d'où vient l'aperçu. Nullable : l'aperçu de
  -- « ✨ Opportunité Casa » (JON-65) ne naîtra d'aucune conversation.
  conversation_id uuid references public.ai_conversations(id) on delete cascade,

  -- Le tool qui a proposé. `check` plutôt qu'un type énuméré : la liste
  -- s'allongera en JON-66, et une contrainte se modifie sans avoir à
  -- reconstruire un type dont dépendent des colonnes.
  tool text not null check (tool in ('create_event', 'modify_event', 'delete_event')),

  /* Les arguments **déjà résolus par le serveur** : des dates réelles,
     des identifiants d'habitants, une cible relue en base. Jamais ce
     que le modèle a écrit tel quel — ce serait déplacer le problème
     d'un cran, pas le régler. */
  payload jsonb not null,

  /* L'usage unique. `null` = jamais exécuté. La consommation est un
     `update … where consumed_at is null returning id` : Postgres
     arbitre, donc deux taps simultanés ne peuvent pas gagner tous les
     deux. */
  consumed_at timestamptz,

  -- Ce qui a été créé, quand ça l'a été. Sert à répondre « c'est déjà
  -- fait » plutôt qu'un refus sec sur un second appui.
  result_event_id uuid references public.events(id) on delete set null,

  /* Un aperçu périme. Une demi-heure : bien plus que les quinze
     secondes visées, et bien moins qu'une soirée — « ajoute un golf
     samedi matin » validé le lendemain matin ne veut plus dire la même
     chose, et l'aperçu affiché serait celui d'hier. */
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now()
);

create index ai_action_drafts_user_idx on public.ai_action_drafts (user_id, created_at desc);

alter table public.ai_action_drafts enable row level security;

/* Même forme que `conversations_all_self` corrigée par 0011 : le
   `with check` contraint **les deux** colonnes. Ne contraindre que
   `user_id` laisserait fabriquer un brouillon portant le `family_id`
   d'une autre maison — la forme exacte de la faille de
   `calendar_connections` (0005), et de celle que 0011 a refermée. Rien
   n'en sortirait aujourd'hui, puisque l'exécution reprend la maison de
   `getCasaContext()` ; c'est précisément ce qu'on se disait en 0001. */
create policy action_drafts_all_self on public.ai_action_drafts
  for all to authenticated
  using ( user_id = (select auth.uid()) )
  with check (
    user_id = (select auth.uid())
    and family_id in (select private.user_families())
  );
