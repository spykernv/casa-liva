-- ═══════════════════════════════════════════════════════════════
-- Casa Liva — deux trous laissés par la migration 0004
--
-- Trouvés par une relecture adversariale, tous deux invisibles à
-- l'usage normal.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Une connexion pouvait pointer vers la maison d'autrui ─────
--
-- 0004 a ajouté `family_id` à `calendar_connections`, mais a laissé la
-- policy de 0001 telle quelle : elle ne vérifie que `user_id`. La clé
-- anon étant publique, n'importe qui pouvait insérer depuis la console
-- du navigateur une connexion portant le `family_id` d'une autre
-- maison, connecter son propre agenda Google par le flux normal, et
-- laisser le moteur de synchronisation — qui tourne sous clé de
-- service et ne revalide rien — déverser ses rendez-vous chez les
-- autres.
--
-- Les événements étaient alors lisibles par `events_select_own_families`
-- et partaient dans le payload envoyé à chaque habitant. Le filtre
-- d'affichage les masquait à l'écran, mais ils avaient bel et bien
-- quitté le serveur.
--
-- La policy doit donc contraindre les DEUX colonnes.

drop policy connections_all_self on public.calendar_connections;

create policy connections_select_self on public.calendar_connections
  for select to authenticated
  using ( user_id = (select auth.uid()) );

create policy connections_insert_self on public.calendar_connections
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and family_id in (select private.user_families())
  );

create policy connections_update_self on public.calendar_connections
  for update to authenticated
  using      ( user_id = (select auth.uid()) )
  with check (
    user_id = (select auth.uid())
    and family_id in (select private.user_families())
  );

create policy connections_delete_self on public.calendar_connections
  for delete to authenticated
  using ( user_id = (select auth.uid()) );

-- Une connexion sans maison ne mène nulle part : le moteur de
-- synchronisation la rejette de toute façon, autant que la base le
-- dise.
alter table public.calendar_connections
  alter column family_id set not null;

-- ── 2. Un réglage de confidentialité pouvait être défait ─────────
--
-- Le moteur de synchronisation lit `visibility_mode` sur la ligne
-- telle qu'elle était au **début** de son exécution. Une lecture
-- complète prend plusieurs secondes ; si quelqu'un resserre son
-- réglage pendant ce temps, la synchronisation en vol termine ses
-- écritures avec l'ancien mode et réinstalle les vrais titres
-- par-dessus les « Occupé ».
--
-- L'écran affiche alors « Seulement mes disponibilités » pendant que
-- la maison lit « Rendez-vous cardiologue ». C'est précisément la
-- garantie que le produit vend, défaite par un double-clic.
--
-- Ce compteur donne au moteur un moyen de savoir que ce qu'il tient
-- est périmé : il le lit au début, le revérifie avant d'écrire, et
-- abandonne s'il a bougé.
alter table public.calendar_connections
  add column sync_generation integer not null default 0;
