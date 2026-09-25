-- ═══════════════════════════════════════════════════════════════
-- 0012 — Où vivent les fichiers audio
--
-- `audio_generations.audio_url` existe depuis la migration 0001, mais
-- rien n'a jamais pointé nulle part : le projet n'avait aucun bucket.
-- C'est ce que cette migration répare, et c'est la décision qui
-- conditionne tout le reste de la phase 8 (JON-54).
--
-- **Pourquoi un bucket et pas un flux à la demande.** §72 interdit de
-- générer deux fois le même audio. Streamer depuis la Route Handler à
-- chaque écoute serait le plus simple à protéger — il n'y aurait rien
-- à protéger — mais on repaierait ElevenLabs à chaque réécoute, et la
-- colonne `text_hash` et sa contrainte d'unicité, posées dès le
-- premier jour, ne serviraient à rien.
--
-- **Pourquoi privé.** Un fichier audio survit à la session qui l'a
-- produit. Public, son URL serait un lien qui marche pour n'importe
-- qui, pour toujours, et qui contient l'agenda de quelqu'un lu à voix
-- haute. C'est, avec l'email, le seul endroit du système où une fuite
-- est définitive. On sert donc des URLs **signées et courtes**.
--
-- **Le chemin porte l'isolation** : `<user_id>/<empreinte>.mp3`. Les
-- policies ne regardent que le premier segment, ce qui les rend
-- lisibles — et impossible à contourner en devinant une empreinte,
-- puisqu'il faudrait d'abord être la bonne personne.
--
-- Rien à répercuter dans `types/database.ts` : aucune colonne ne bouge.
-- ═══════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'casa-audio',
  'casa-audio',
  false,
  -- Une minute de parole pèse environ 500 Ko en MP3. Cinq mégaoctets
  -- laissent de la marge pour un briefing hebdomadaire bavard, et
  -- refusent tout ce qui n'aurait rien à faire là.
  5 * 1024 * 1024,
  array['audio/mpeg']
)
on conflict (id) do nothing;

-- ── Chacun chez soi ─────────────────────────────────────────────
-- Quatre policies plutôt qu'un `for all` : c'est plus long, mais on
-- lit d'un coup d'œil ce qui est permis. La suppression est là pour
-- pouvoir faire le ménage plus tard sans nouvelle migration.

drop policy if exists audio_lire_le_sien on storage.objects;
create policy audio_lire_le_sien on storage.objects
  for select to authenticated
  using (
    bucket_id = 'casa-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists audio_deposer_le_sien on storage.objects;
create policy audio_deposer_le_sien on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'casa-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Le remplacement sert au cas où une génération a échoué en cours de
-- route : on réécrit par-dessus plutôt que de laisser un fichier
-- tronqué que personne n'ira nettoyer.
drop policy if exists audio_remplacer_le_sien on storage.objects;
create policy audio_remplacer_le_sien on storage.objects
  for update to authenticated
  using (
    bucket_id = 'casa-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'casa-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists audio_supprimer_le_sien on storage.objects;
create policy audio_supprimer_le_sien on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'casa-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
