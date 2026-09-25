-- ═══════════════════════════════════════════════════════════════
-- 0017 — Le rappel avant un événement
--
-- Troisième et dernier cas de §66 bis (D30, D54, JON-79). Les deux
-- premiers — l'invitation qui arrive, la réponse à ce qu'on a proposé —
-- vivent depuis 0016 ; celui-ci manquait, et il lui manquait surtout
-- une horloge (voir D54 : Vercel Hobby plafonne ses crons à un par
-- jour, d'où un workflow GitHub Actions toutes les quinze minutes).
--
-- ── Le délai appartient à l'ÉVÉNEMENT, pas à celui qui le reçoit ──
--
-- Tranché avec le commanditaire le 26 août, et ça mérite une phrase
-- parce que ça ressemble à une entorse à la règle des propriétaires
-- (`AGENTS.md`) : « une préférence appartient à celui qui la subit ».
--
-- Un délai de rappel n'est pas une préférence. **C'est une propriété de
-- l'événement** : un train ne se prépare pas comme un cinéma, et c'est
-- vrai pour tout le monde à bord, pas seulement pour l'organisateur. Il
-- appartient donc à qui organise (D21), au même titre que l'heure et le
-- lieu.
--
-- Ce qui reste à chacun, et qui est la vraie préférence : `wants_push`
-- (0016). On ne choisit pas *quand* on est prévenu d'un train qui n'est
-- pas le sien, mais on choisit **si** on est prévenu. Les deux règles
-- tiennent ensemble.
--
-- ── Pourquoi `rappel_envoye_pour` porte une DATE et non un booléen ──
--
-- Il faut qu'un second passage du planificateur ne renvoie rien. Un
-- `rappel_envoye_at timestamptz` suffirait — mais il faudrait alors
-- penser à le remettre à zéro **partout** où un événement est déplacé :
-- les Server Actions, l'aperçu d'IA, la synchronisation Google. Un seul
-- chemin oublié et le rappel d'un rendez-vous repoussé de trois heures
-- ne partirait jamais.
--
-- On range donc le `start_at` **pour lequel** le rappel est parti. Si
-- l'heure change, la valeur rangée cesse de correspondre et le rappel
-- repart tout seul. Aucun code à tenir à jour, aucun déclencheur : la
-- colonne s'invalide d'elle-même. C'est la même idée que la clé de
-- cache du briefing qui porte sa portée (D48) — ce dont dépend un
-- résultat doit entrer dans ce qui l'identifie.
--
-- ── Le défaut est 30 minutes, et il est assumé ──
--
-- Un rappel qui n'existe que si on pense à le demander est un rappel
-- que personne ne découvre. Les lignes existantes le prennent aussi :
-- c'est sans danger, la route ne regarde que les événements **à venir**
-- et pose la trace au premier passage. `null` = pas de rappel, et c'est
-- ce que l'organisateur choisit quand il n'en veut pas.
--
-- Additive. Répercutée dans `types/database.ts` et `types/index.ts`
-- dans le même commit.
-- ═══════════════════════════════════════════════════════════════

alter table public.events
  add column if not exists rappel_minutes integer default 30;

alter table public.events
  add column if not exists rappel_envoye_pour timestamptz;

comment on column public.events.rappel_minutes is
  'Combien de minutes avant le début prévenir. NULL = pas de rappel. Appartient à l''événement, donc à qui l''organise (D21) — ce n''est pas une préférence mais une propriété : un train ne se prépare pas comme un cinéma.';
comment on column public.events.rappel_envoye_pour is
  'Le start_at POUR LEQUEL le rappel est parti. Porte la date et non un booléen : si l''heure change, la valeur cesse de correspondre et le rappel repart seul — aucun chemin de déplacement à tenir à jour.';

-- ── Une borne, pour que l'écran ne puisse pas écrire n'importe quoi ──
--
-- La liste proposée s'arrête à deux heures (D56). Au-delà d'une
-- journée, soustraire des minutes cesse d'être juste : deux fois par an
-- un « jour » fait 23 ou 25 heures d'horloge, et un rappel « la veille »
-- tomberait à côté (D51). Tant que la borne tient, on reste dans une
-- arithmétique de minutes, que `verify:dates` n'a pas à surveiller.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_rappel_minutes_borne'
  ) then
    alter table public.events
      add constraint events_rappel_minutes_borne
      check (rappel_minutes is null or (rappel_minutes >= 0 and rappel_minutes <= 1440));
  end if;
end $$;

-- ── L'index qui rend le balayage des quinze minutes bon marché ──
--
-- Le planificateur cherche « les événements à venir dont le rappel n'est
-- pas encore parti ». Partiel sur `rappel_minutes is not null` : les
-- événements sans rappel n'ont aucune raison d'être parcourus, et sur un
-- agenda familial ils finiront par être la majorité.

create index if not exists events_rappel_a_envoyer_idx
  on public.events (start_at)
  where rappel_minutes is not null;
