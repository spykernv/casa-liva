-- ═══════════════════════════════════════════════════════════════
-- 0013 — Chacun sa voix
--
-- Demande du commanditaire (JON-59). La voix de Casa AI était un
-- réglage de serveur : un choix pris une fois pour toute la maison,
-- par quelqu'un qui ne l'avait pas écoutée. On n'impose pas une voix à
-- quelqu'un qui va l'entendre tous les matins.
--
-- **Nulle par défaut**, et pas « la valeur de la voix par défaut ».
-- La nuance compte : `null` veut dire « je n'ai pas choisi », donc
-- « donne-moi celle de la maison ». Le jour où la maison change d'avis
-- sur sa voix par défaut, ceux qui n'ont rien choisi suivent — ceux qui
-- ont choisi gardent la leur.
--
-- Aucune contrainte sur le contenu : la liste des voix vit dans
-- `lib/voice/voices.ts` et bouge au rythme du catalogue d'ElevenLabs,
-- pas à celui du schéma. Une valeur inconnue retombe silencieusement
-- sur la voix par défaut plutôt que de rendre l'app muette — c'est le
-- code qui valide, à l'écriture comme à la lecture.
--
-- Additive, donc sans risque pour les trois habitants : les lignes
-- existantes prennent `null`, c'est-à-dire exactement le comportement
-- d'avant.
--
-- Répercutée dans `types/database.ts` dans le même commit.
-- ═══════════════════════════════════════════════════════════════

alter table public.users
  add column if not exists voice_id text;

comment on column public.users.voice_id is
  'Voix ElevenLabs choisie par la personne. NULL = celle de la maison. Validée par lib/voice/voices.ts, pas par le schéma.';
