# Décisions techniques — écarts assumés par rapport au plan

Chaque écart au cahier des charges (`PLAN.md`) est listé ici avec sa raison.
Rien n'est modifié en silence.

---

## D1 — Groq, pas Grok

**Plan §24** annonçait « xAI / Grok ». **Correction du commanditaire** : il s'agit de
**Groq**, la plateforme d'inférence qui sert des modèles open source (Llama, Qwen,
GPT-OSS…), et non de Grok de xAI.

Conséquences : `lib/ai/groq.ts` (et non `grok.ts`), variable `GROQ_API_KEY` (et non
`XAI_API_KEY`). Groq sert aussi le Speech-To-Text (Whisper), ce qui économise un
fournisseur supplémentaire.

> **Périmé sur ce dernier point — voir D39.** Le Speech-To-Text passe par ElevenLabs depuis le
> 4 août 2026. L'argument de l'économie s'est retourné le jour où ElevenLabs est entré dans le
> projet : c'est Groq qui serait devenu le fournisseur en trop, pour ce seul usage. Le reste de
> D1 tient.

---

## D2 — Calendrier maison plutôt que FullCalendar

**Plan §4** citait FullCalendar. Nous construisons un composant calendrier dédié.

**Pourquoi.** Les maquettes du plan (§11, §12) ne sont pas une vue FullCalendar standard :
barres colorées par personne côte à côte, avatars empilés, lignes « ✨ TOUT LE MONDE
LIBRE » injectées dans la grille horaire. Obtenir ça avec FullCalendar demande de réécrire
le rendu de toute façon, tout en héritant de ~300 kB de JavaScript client — contre l'exigence
« minimal client JS » (§70) sur une app mobile-first. Le drag/resize tactile sur mobile est
également plus fiable avec des Pointer Events maîtrisés qu'avec l'abstraction FullCalendar.

**Coût accepté.** Nous écrivons nous-mêmes la grille, le drag, le resize et le layout des
chevauchements. C'est ~500 lignes, testables, et entièrement sous notre contrôle visuel.

---

## D3 — `motion` remplace `framer-motion`

Framer Motion a été renommé : le paquet npm s'appelle désormais `motion` et l'import React
est `motion/react`. Même bibliothèque, même API. Le plan §44 reste valable tel quel.

---

## D4 — Auth : lien magique d'abord, Google ensuite

**Plan §7** fait de « Continuer avec Google » l'entrée principale — c'est bien la cible.
Mais `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` n'existent pas encore (le commanditaire
a demandé de faire l'intégration Google **à la fin**, cf. phase 4).

Nous livrons donc l'authentification par **lien magique email** (Supabase Auth) dès la
phase 3, puis nous ajoutons **Google OAuth** en phase 4 avec exactement l'UX demandée :
un bouton, autoriser, connecté. Les deux méthodes cohabitent ensuite — le lien magique
reste utile pour un membre sans compte Google.

---

## D5 — Une seule intégration Google pour deux usages

Le même client OAuth Google sert (a) à se connecter à Casa Liva et (b) à lire Google
Calendar. On demande les scopes calendrier au moment de la connexion de l'agenda, pas au
login, pour que la première connexion reste sans friction.

---

## D6 — Noms

Dossier local `casa-calendrier`, paquet npm et produit `casa-liva`, repo GitHub
`spykernv/casaliva`. C'est cohérent, seulement hérité de l'existant.

---

## D10 — Une interface `CalendarProvider`, pas un couplage à Google

Le plan ne parle que de Google (§17-20). Mais un déploiement plus large imposerait Apple
Calendar et Outlook, que beaucoup de gens utilisent exclusivement. On écrit donc la phase 4
derrière une interface, exactement comme le plan l'impose déjà pour l'IA (§24 : « ne pas coupler
toute l'application directement à un fournisseur »).

**Le piège à éviter :** modeler l'interface sur Google. Les trois fournisseurs ne synchronisent
pas de la même façon — Google a un `syncToken`, Microsoft Graph des *delta tokens*, CalDAV un
`ctag` / `sync-collection`. Une interface bâtie autour du `syncToken` de Google serait un
emballage Google déguisé, et il faudrait tout casser au premier autre fournisseur.

L'interface doit donc être formulée en **curseur opaque** : « donne-moi ce qui a changé depuis
ce marqueur, et rends-moi un nouveau marqueur ». Chaque implémentation décide ce que le marqueur
contient. De même, la normalisation vers `CasaEvent` appartient à l'adaptateur, pas au cœur.

Une seule implémentation pour l'instant : `google`. On ne construit pas les autres tant que
personne ne les demande (§77).

---

## D9 — Scope `calendar.events` plutôt que `calendar.events.readonly`

La phase 4 ne fait que **lire** les agendas Google : `calendar.events.readonly` suffirait, et
demander moins est toujours préférable sur un scope sensible.

On demande quand même l'écriture. **Pourquoi :** changer de scope plus tard oblige *chaque*
habitant à repasser par l'écran de consentement Google — celui qui affiche « application non
vérifiée » et demande de cliquer sur *Paramètres avancés*. Faire vivre ça deux fois à une
grand-mère pour une raison purement technique est un coût d'adoption réel, et l'adoption est
la priorité absolue du produit.

Le jour où l'on voudra qu'un « Golf samedi » créé dans Casa Liva atterrisse aussi dans l'agenda
Google de chacun — un souhait très naturel — le scope sera déjà là.

**Contrepartie assumée :** on détient une permission qu'on n'utilise pas encore. Tant qu'aucun
code n'écrit chez Google, le risque reste théorique ; mais c'est à surveiller, et à retirer si
l'écriture n'arrive jamais.

---

## D8 — Google : écran de consentement « In Production », non vérifié

Piège n°1 de ce type d'intégration : laisser l'écran de consentement Google en statut
**« Testing »** fait **expirer tous les refresh tokens au bout de 7 jours**. Concrètement,
chaque habitant devrait reconnecter son agenda toutes les semaines, et le cron de
synchronisation tomberait en `invalid_grant` sans prévenir.

La bascule en **« In Production »** n'est pas la même chose qu'une app *vérifiée*. Une app
en Production non vérifiée fonctionne, émet des refresh tokens durables, mais affiche
« Google hasn't verified this app » à la première connexion (l'utilisateur passe par
*Advanced → Go to Casa Liva*) et reste plafonnée à ~100 utilisateurs.

Pour une famille, c'est le bon compromis : **Production + non vérifiée**. La vérification
Google (justification scope par scope, vidéo de démo, ~10 jours de revue) n'a de sens que
le jour où l'app s'ouvrirait au public — ce que le plan exclut explicitement (§77).

Quel que soit le mode, l'UI doit prévoir un chemin de reconnexion : un token peut toujours
être révoqué côté Google.

---

## D7 — Clé `service_role` à fournir

L'API de gestion Supabase n'expose pas la clé secrète `service_role` (par conception).
Elle doit être collée manuellement dans `.env.local` avant la **phase 6** (cron + digests),
seul endroit qui en a besoin. Tout le reste fonctionne sous RLS avec la clé anon.

Dashboard → Project Settings → API Keys → `service_role`.

---

## D20 — Les lieux : ajout au périmètre, hors plan

> **Tranchée par D45 (5 août 2026)** : les quatre questions ouvertes ci-dessous y trouvent leur
> réponse. Ce qu'on a cru un jour fait partie de l'histoire ; on n'y touche pas.

`PLAN.md` ne prévoit qu'un champ `location` en texte libre (§11-12). Le commanditaire a
demandé le 3 août 2026 une notion de **lieu partagé** : un endroit où l'on se retrouve, avec
un **nom obligatoire** (« Chez Mamie », « Le golf ») et une **adresse exacte facultative**, un
tap ouvrant l'itinéraire dans Maps ou Waze.

**Pourquoi le nom est obligatoire et l'adresse non.** C'est le nom qui lève l'ambiguïté dans
un agenda partagé : « Chez Mamie » veut dire quelque chose pour la famille, « 12 rue des
Lilas » ne dit rien à personne. Beaucoup de lieux familiers n'ont pas besoin d'adresse du
tout — on sait déjà où c'est.

**Partagé par toute la maison**, et c'est le point : un lieu créé par quelqu'un sert à tout le
monde. C'est exactement le contraire d'un champ de texte retapé — et mal orthographié —
à chaque événement.

Répond à la règle produit : trouver l'adresse d'un rendez-vous familial est une des choses
qu'on redemande le plus souvent à voix haute.

Spécification et points à trancher dans `ETAT.md`.

---

## D21 — On ne modifie pas l'événement de quelqu'un d'autre

**Renversement assumé d'une décision antérieure.** La migration 0001 écrivait l'inverse, avec
son argument :

> « Tout le monde dans la maison peut déplacer un événement de la maison : c'est un agenda
> partagé, pas un système de tickets. »

Le commanditaire a tranché autrement le 3 août : **seul le créateur** d'un événement peut le
déplacer, le modifier ou le supprimer. Les autres répondent « je viens / pas dispo », et c'est
tout.

**Ce qui ne change pas :** les **lieux** restent communs et modifiables par tous. Corriger une
adresse fautive profite à toute la maison, et personne n'en est propriétaire.

La distinction est cohérente : un événement appartient à qui l'organise, un lieu appartient à
la maison.

**Conséquences à traiter ensemble** — les policies `events_update_own_families` et
`events_delete_own_families` doivent passer de `family_id in (…)` à `creator_id = auth.uid()`,
et l'UI doit cesser de proposer le glisser-déposer sur l'événement d'un autre. Le garde-fou des
événements Google (D13) reste valable et devient un cas particulier de celui-ci : leur
`creator_id` est le propriétaire de la connexion.

**Fait le 3 août (migration 0008).** Deux choses trouvées en l'appliquant :

- **Inviter, c'est modifier.** `participants_insert_visible_events` laissait n'importe quel
  membre ajouter n'importe qui à n'importe quel événement de la maison. La règle n'aurait tenu
  qu'à moitié : on ne pouvait plus déplacer le golf de quelqu'un, mais on pouvait encore y
  convier la terre entière. La policy autorise désormais le créateur (sur son événement) et
  chacun **pour lui-même** — répondre reste ouvert à tous, c'est tout l'intérêt d'inviter.
- **Les policies ont changé de nom en même temps que de sens.**
  `events_update_own_families` → `events_update_own`. Un nom qui décrit l'inverse de son effet
  a déjà coûté un incident à ce projet (D17, « Entrer dans la maison »).

Les contrôles de `verify:rls` ont dû être ajoutés **après** le déménagement de B chez A : les
contrôles « B ne peut pas modifier l'événement de A » existants ne prouvaient rien sur ce
point, puisqu'à ce moment-là B vivait encore ailleurs et que c'était l'isolation entre maisons
qui le bloquait. On a donc sept contrôles de plus, et le seul qui compte vraiment est
« B ne peut pas modifier l'événement de A **chez qui il vit** ».

---

## D17 — Une seule maison par personne, garantie par la base

**Plan §77** range « familles multiples » dans ce qu'il ne faut *pas* construire, et le
commentaire de la migration 0002 l'affirmait déjà : « Casa Liva est mono-foyer ». L'intention
était donc écrite — mais nulle part imposée. `family_members` avait pour clé primaire
`(family_id, user_id)`, ce qui autorise N maisons par personne.

**Ce que ça a produit, en production, le premier jour de test réel.** Une habitante s'est
inscrite seule, l'onboarding lui a créé sa maison, puis elle a accepté une invitation. Elle
s'est retrouvée dans **deux** maisons. `getCasaContext()` faisait alors un `.limit(1)` **sans
`ORDER BY`** : Postgres rendait la ligne qu'il voulait — en l'occurrence, systématiquement la
coquille vide, parce qu'elle était physiquement avant l'autre. Elle ne voyait personne ;
tout le monde la voyait.

Déterministe par accident, pas par garantie : un `VACUUM FULL` ou un changement de plan aurait
inversé le gagnant sans un mot.

La contrainte `family_members_one_per_user` (migration 0007) rend la situation impossible.
`getCasaContext()` a perdu son `.limit(1)` : une seconde ligne fait désormais **crier**
`maybeSingle()` au lieu d'être tirée au sort. `npm run verify:rls` contient un contrôle qui
tente d'insérer un doublon **avec la clé de service** — c'est le seul qui prouve que la
garantie vient de la base et non du code applicatif.

**Écart au plan :** `PLAN.md:407` prescrit « Casa Liva est prête. » comme dernier écran
d'onboarding. Le bouton disait « Entrer dans la maison » alors qu'il en **créait** une —
un libellé qui décrivait l'inverse de son effet, et c'est lui qui a produit le bug. Il dit
maintenant « Créer ma maison », et l'écran prévient : si on a reçu un lien, il faut ouvrir
le lien.

---

## D18 — Rejoindre une maison, c'est déménager

Corollaire de D17. `accept_family_invite` ajoutait une appartenance sans jamais regarder d'où
venait la personne ; elle **déplace** désormais (`private.move_into_family`).

Trois règles, dans cet ordre :

1. **Re-parenter avant de supprimer.** `families` cascade vers `events`,
   `calendar_connections`, `ai_conversations`, `family_invites` et `family_members`. Écrite
   dans l'autre sens, la fonction détruirait tout ce que la personne a créé — sans lever la
   moindre erreur. Les rendez-vous suivent leur auteur, et on le lui dit avant.
2. **Les invitations ne suivent pas.** Les transporter ferait entrer chez l'hôte quelqu'un
   qu'il n'a jamais invité.
3. **On refuse quand la maison de départ est habitée.** On ne vide pas la maison des autres.
   Le refus est explicite à l'écran, pas une erreur Postgres.

**Rejoindre ne se fait plus dans le rendu d'un GET.** `/invitation/[token]` appelait la RPC
pendant son rendu : ouvrir l'URL suffisait à changer de maison, sans question ni « Annuler »,
et le moindre préchargement du lien brûlait le jeton. C'est maintenant un écran qui **demande**,
et une Server Action qui agit — conforme aux deux règles d'`AGENTS.md` que ça violait.

Chaque échec porte un identifiant machine (`casa:introuvable`, `casa:expiree`,
`casa:deja-servie`, `casa:maison-partagee`) dans le `detail` de l'exception. L'écran ne devine
plus le cas en filtrant du français avec des expressions régulières — un message est fait pour
être réécrit, pas pour piloter du code.

---

## D19 — On ne cherche pas les invitations par adresse email

Idée écartée : détecter, à l'inscription, qu'une invitation attend cette adresse, et proposer
de rejoindre plutôt que de créer une maison. L'index `family_invites_email_idx` sur
`lower(email)` existe depuis la migration 0001 et n'est interrogé nulle part.

**Pourquoi on ne le fait pas.** Le champ `email` d'une invitation est **décoratif** : seul le
jeton du lien donne accès. Vérifié sur les données réelles — les deux invitations émises
portaient `sophie.exemple@gmail` (sans `.com`) et `sophie.exemple@gmai.com`, et c'est la
seconde qui a été acceptée par une personne dont l'adresse réelle est encore différente.

Un appariement par email n'aurait donc rien détecté dans le seul cas où il aurait servi. Le
garde-fou est ailleurs : un libellé de bouton honnête (D17).

---

## D11 — Deux scopes Google, pas un seul (complète D9)

D9 actait `calendar.events`. Il en manque un : **`calendarList.list` n'accepte pas
`calendar.events`** et répond 403 « insufficient authentication scopes ». Or sans lui, on ne
peut pas proposer « quels agendas veux-tu synchroniser ? », qui fait partie de la phase 4.

On demande donc :

```
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar.calendarlist.readonly
```

Le second est le scope le plus étroit qui liste les agendas, et Google le classe **non
sensible** — il n'ajoute rien au coût d'une éventuelle vérification.

**Action humaine possible :** si la liste des scopes déclarés dans l'écran de consentement
Google ne contient pas `calendar.calendarlist.readonly`, l'ajouter. Sinon le premier essai de
connexion échouera avec un 403 au moment de lister les agendas — pas au consentement.

---

## D12 — Les jetons OAuth passent par des fonctions, pas par la table

`private.oauth_credentials` n'est pas atteignable depuis l'application, **même avec la clé de
service**. Ce n'est pas la RLS qui bloque, c'est PostgREST : le schéma `private` n'est pas dans
« Exposed schemas », et `.schema("private")` renvoie `PGRST106 Invalid schema`.

On passe donc par quatre fonctions `public.*_oauth_credentials*` en `SECURITY DEFINER`
(migration 0004), exécutables par `service_role` uniquement.

**Le piège, vérifié sur la vraie base :** `revoke all on function … from public` **ne révoque
rien** chez Supabase. Un `ALTER DEFAULT PRIVILEGES` du projet accorde `EXECUTE` nominativement
à `anon` et `authenticated` sur toute fonction créée dans `public` ; retirer le pseudo-rôle
`PUBLIC` laisse ces grants intacts. Il faut **nommer les deux rôles explicitement** :

```sql
revoke all on function public.get_oauth_credentials(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_oauth_credentials(uuid, text) to service_role;
```

`npm run verify:rls` contient désormais un contrôle de non-régression sur ce point précis :
une migration future qui oublierait de nommer les rôles rouvrirait la porte en silence.

**Faux positif à ignorer sciemment.** L'advisor Supabase signale `rls_disabled` en niveau
*critical* sur `private.oauth_credentials`, avec le message « fully exposed to the anon and
authenticated roles ». C'est faux sur ce projet : l'advisor teste `relrowsecurity` sans
regarder ni l'exposition PostgREST ni les GRANT. La table n'a **aucun** privilège pour les
rôles clients, et son schéma n'est pas exposé — strictement plus fort que la RLS. **Ne pas
appliquer son `remediation_sql`.**

---

## D13 — Un événement importé ne se modifie pas dans Casa Liva

Le laisser glisser au doigt serait pire qu'un refus : la modification tiendrait quelques
minutes, puis la synchronisation suivante la remplacerait par la version Google, sans rien
dire. **Une action qui ne tient pas est une trahison silencieuse.**

Trois couches, parce qu'une seule ne suffit pas :

1. **La base** (0004) — les policies `update` / `delete` / `insert` exigent
   `connection_id is null`. C'est la seule couche qu'un navigateur ne peut pas contourner, la
   clé anon étant publique.
2. **Les Server Actions** — `updateEvent`, `deleteEvent` et `setParticipation` refusent
   explicitement. Nécessaire car **une écriture refusée par la RLS ne renvoie pas d'erreur,
   seulement zéro ligne** : sans contrôle, l'action répondrait « c'est fait ».
3. **L'UI** — plus de glisser-déposer ni de poignées, et pas de « Je viens / Pas dispo ».
   Répondre « pas dispo » à son propre rendez-vous Google le ferait disparaître de la grille
   *et* libérerait le créneau pour toute la maison, alors que le rendez-vous tient toujours.

La règle tombera le jour où l'on écrira réellement chez Google — le scope est déjà là (D9).

---

## D14 — Les journées entières ne descendent pas dans la grille

Deux problèmes distincts, une seule cause : Google exprime « le 3 août » sans heure.

**À l'affichage.** Un « Vacances à Nice » stocké de minuit à minuit force `gridBounds` à
afficher les 24 heures — pour toute la famille, et pour les sept colonnes de la semaine
concernée. Les journées entières vont donc dans un bandeau au-dessus de la grille, ce qui est
leur nature : une teinte de journée, pas un créneau.

**Aux disponibilités.** Une nouvelle colonne `events.busy` distingue « occupé » de
« disponible ». Sont marqués non occupants : les événements `transparency: transparent` de
Google, **et toutes les journées entières**.

Ce second point est un choix produit, pas une contrainte technique. Compter un anniversaire ou
un jour férié comme quatorze heures d'occupation ferait disparaître « ✨ tout le monde est
libre » précisément les jours où la famille l'est le plus — c'est-à-dire le moment que le
produit existe pour créer. **À rediscuter si l'usage montre le contraire** (« Vacances » qui
devrait bloquer, par exemple) : la colonne est là, seule la règle de remplissage changerait.

Sont aussi écartés à l'import les `eventType` `workingLocation` et `focusTime` : des blocs
professionnels quotidiens qui n'aident personne à organiser quoi que ce soit en famille. Les
anniversaires, eux, sont conservés — ils vivent dans un agenda Google séparé, qu'on coche ou
non à la connexion.

---

## D15 — Cadence de synchronisation : cron quotidien + opportuniste

Vercel plafonne les crons à **une exécution par jour** sur le plan Hobby. Un
`*/15 * * * *` ferait échouer le déploiement.

La fraîcheur vient donc surtout d'ailleurs : ouvrir `/aujourdhui` ou `/semaine` déclenche une
synchronisation via `after()` si la dernière date de plus de dix minutes. La réponse est déjà
partie quand elle tourne — elle ne coûte rien à l'affichage, et le rendez-vous ajouté dans
Google apparaît au rafraîchissement suivant. Le cron quotidien sert de filet, et porte la
relecture complète hebdomadaire.

**Pourquoi une relecture complète périodique est obligatoire :** Google ne développe les
occurrences d'un événement récurrent que jusqu'à la borne `timeMax` de la lecture initiale. Les
occurrences au-delà n'existent pas encore côté serveur, donc **aucune synchronisation
incrémentale ne les livrera jamais**. Sans relecture, l'agenda se viderait par le fond au bout
d'un an — sans erreur, sans alerte. `last_full_sync_at` force une relecture tous les 7 jours.

À resserrer (`*/15`) le jour où le projet passera en Vercel Pro. Les webhooks Google
(`events.watch`) seraient encore mieux, mais imposent de renouveler des canaux : à considérer
après la phase 4, pas pendant.

---

## D16 — Le compte Google peut différer du compte Casa Liva

**Risque connu, mitigé, pas éliminé.**

Supabase apparie les identités sur **l'adresse email**, pas sur la session en cours. Quelqu'un
connecté par lien magique avec `mamie@exemple.fr` qui autoriserait un compte Google
`mamie.exemple@gmail.com` déclencherait la création d'un **second utilisateur**, et sa session
basculerait dessus : maison vide, impression d'avoir tout perdu.

Ce qui est en place :

- `login_hint` oriente Google vers la bonne adresse quand plusieurs comptes sont ouverts ;
- un cookie `httpOnly` retient l'identité de départ ; au retour, si elle diffère, on **refuse
  d'enregistrer les jetons**, on déconnecte la mauvaise session et on explique en français ce
  qui vient de se passer (`/auth/erreur?raison=compte-google`).

Ce qui reste : le second compte a bien été créé côté Supabase. On le détecte, on ne le
subit pas en silence — mais on ne l'empêche pas.

**La correction propre**, si le cas se produit vraiment : faire notre propre échange OAuth avec
Google (`/api/google/connect` + `/api/google/callback`) au lieu de passer par
`signInWithOAuth`. La session Casa Liva ne bougerait plus du tout, Google devenant une simple
source de données. Cela demande d'ajouter deux URI de redirection dans la console Google
(`http://localhost:3000/api/google/callback` et
`https://casa-liva.vercel.app/api/google/callback`) — raison pour laquelle ce n'est pas le
chemin retenu aujourd'hui : il aurait bloqué tout essai tant que la console n'était pas à jour.

---

## D22 — Parler pour agir : l'aperçu avant l'exécution

**Demande du commanditaire, 3 août 2026.** « Je parle à voix haute, Casa AI traduit ma phrase en
action, me résume ce qu'elle a compris, **me montre à quoi ça ressemblerait**, et n'exécute
qu'ensuite. » Créer un événement, mais aussi en supprimer un.

**Ce n'est pas dans le plan.** Trois morceaux y sont, séparément ; la boucle, non.

- **§27-33** décrit bien une conversation vocale — mais elle *interroge* :
  `Microphone → Speech To Text → Intent Detection → Calendar Query → LLM → Answer → ElevenLabs`.
  Le verbe est `Query`. Rien, dans toute la chaîne vocale du plan, n'écrit quoi que ce soit.
- **§36-38 et la phase 9** décrivent bien des actions IA à confirmation obligatoire — mais à
  l'écrit, et la confirmation y est un bouton : `[ Créer le golf ⛳ ]`.
- **La suppression n'existe nulle part.** Ni dans les tools (§34-35 : `createEvent`,
  `inviteParticipants`, et six lectures), ni dans la phase 9 (`create_event`,
  `find_availability`, `invite_family`, `modify_event`).

Trois ajouts, donc : **la voix comme point d'entrée d'une action**, **l'aperçu** à la place du
simple bouton, et **la suppression**.

**Pourquoi l'aperçu n'est pas du confort.** Un bouton annonce ce qu'on va faire ; il ne montre
pas ce que ça donnera. Or la voix se trompe, et se trompe en silence : un prénom pris pour un
mot courant, une date pour une autre, une heure sur deux dans une cuisine bruyante. Confirmer
une interprétation qu'on n'a pas vue revient à signer en blanc. L'aperçu — l'événement tel qu'il
sera, avec son jour, ses heures, ses participants, sa couleur — rend l'erreur visible en une
seconde, avant qu'elle coûte quelque chose. C'est la même famille de garantie que l'« Annuler »
obligatoire après un `move` / `delete` / `edit` (§48-49), un cran plus tôt. Sur une suppression,
c'est la seule chose qui empêche une phrase mal entendue d'effacer le samedi de quelqu'un.

**Et afficher aussi ce qui a été entendu.** Quand l'aperçu est faux, il faut pouvoir dire *où* ça
s'est cassé : le micro a mal entendu, ou l'IA a mal compris. Deux pannes, deux corrections
différentes — sans le transcript à l'écran, on ne peut pas les distinguer.

**L'aperçu se construit pour le chat écrit d'abord.** La voix n'est qu'une autre façon de remplir
la même demande. Dans l'autre sens, la partie risquée — traduire une phrase en mutation de base —
ne serait essayable qu'avec un micro à la main, jamais en CI, et jamais deux fois à l'identique.

**Ce que ça ne change pas.** Les règles existantes tiennent à la lettre, et l'aperçu doit
**refuser avant de s'afficher** plutôt qu'échouer après avoir promis : on ne modifie ni ne
supprime l'événement d'un autre (D21), un événement importé de Google ne se touche pas (D13), et
le LLM ne parle jamais à la base — il choisit un tool, le backend valide les droits et exécute
(§34-35). Proposer un aperçu qu'on n'a pas le droit d'exécuter serait exactement la trahison
silencieuse que D13 décrit.

**Où ça atterrit : phase 9**, pas phase 8. La phase 8 livre le micro (STT) et la lecture (TTS) ;
la phase 9 livre l'action, sa confirmation et son aperçu. `delete_event` rejoint la liste des
tools de la phase 9, et la voix devient une entrée de plus vers le même aperçu — pas un second
chemin d'exécution à sécuriser séparément.

---

## D23 — « Trouver un moment » : quatre écarts à la maquette

La maquette du plan (§21-22) est suivie dans sa forme — *Faire quoi ? · Avec qui ? · Durée ?*
puis « Les meilleurs moments ». Quatre choix ne s'y trouvent pas.

**Le titre est obligatoire pour chercher.** La maquette montre le champ rempli (« Golf ») sans
dire s'il est requis. Il l'est : une liste de créneaux qu'on ne peut transformer en rien ne
répond pas à la règle produit — *aider la famille à organiser quelque chose*. « Quand
sommes-nous libres ? » sans intention a déjà deux réponses ailleurs : les bandeaux ✨ des vues
jour et semaine, et « Opportunité Casa ». C'est aussi ce qui rend possible le tap unique
ci-dessous : sans titre, il faudrait un second écran.

**Quatorze jours, pas sept.** Le ticket demandait « au moins 7 ». Deux semaines contiennent
deux week-ends, c'est-à-dire deux fois les créneaux que le score favorise réellement — et une
famille qui cherche un moment ensemble vise rarement les trois jours qui viennent.

**Un tap crée, avec « Annuler ».** La maquette montre un bouton unique `[ Créer l'événement ]`
sous la liste, ce qui suppose de sélectionner un créneau puis de valider. On crée directement
depuis la ligne. Le plan n'exige un « Annuler » qu'après `move` / `delete` / `edit` (§49) ; il
en faut un ici aussi, précisément *parce que* l'action tient en un geste — une erreur de doigt
coûte sinon un événement à toute la maison.

**L'écran vit sous `/casa`, pas dans un sixième onglet.** §10 fixe cinq onglets, « jamais
plus ». `/casa/trouver` garde l'onglet ✨ allumé, et l'entrée est la première carte de Casa —
toujours au même endroit, au-dessus de l'opportunité, qui elle va et vient.

---

## D24 — Le moteur ne proposait qu'une heure : celle du début du trou

Défaut trouvé en construisant l'écran, invisible jusque-là parce que rien n'affichait
`findCommonSlots`.

La fonction ne fabriquait qu'**un** candidat par trou, calé sur son début, avec ce
raisonnement : « plus tôt on cale, plus il reste de marge derrière ». Sur des agendas peu
remplis, le trou commence à 8h tous les jours. Les cinq propositions étaient donc
« 08:00 → 10:00 » cinq fois de suite — et 8h est précisément l'heure que `scoreSlot` pénalise
(`hour < 9` → −0.2). Le score existait, tournait, et ne servait à rien : tous les candidats
partageant la même heure, il ne pouvait plus départager que le jour.

**Une liste de « meilleurs moments » qui répond cinq fois la même chose n'a rien choisi.**

Le trou est maintenant échantillonné à la demi-heure, sur des heures rondes — personne ne
propose « 10:47 » —, en gardant aussi le tout début du trou : dans un créneau serré entre deux
rendez-vous, c'est parfois la seule position qui rentre. Le score retrouve alors son rôle, et
la liste ressemble à celle du plan : `samedi 10:00`, `samedi 17:00`, `dimanche 17:00`.

L'enseignement dépasse ce bug : **un score qu'on n'applique qu'à un seul candidat n'est pas un
score, c'est une décoration.** Il n'échouait pas, il ne comparait rien.

---

## D25 — Un lien d'email n'écrit jamais rien… sauf le désabonnement

**Un lien reçu par email est visité par des robots.** Gmail et Outlook préchargent et analysent
les liens avant que quiconque les ouvre. Un `GET /rsvp/<jeton>?r=oui` qui enregistrerait la
réponse dirait « je viens » tout seul, à l'insu de la personne.

C'est mot pour mot ce que **D18** a déjà corrigé sur `/invitation/[token]` — « rejoindre ne se
fait plus dans le rendu d'un GET ». On ne refait pas la même erreur trois mois plus tard sur
une autre route : `/rsvp/[token]` ouvre un **écran qui demande**, et la réponse part par une
Server Action. Bénéfice au passage : on voit à quoi on répond.

**L'exception assumée : `/desabonnement/[token]`, où le GET agit.** La règle s'inverse parce
que la conséquence s'inverse. Un robot qui précharge ce lien coupe des résumés : agaçant,
réversible en un tap, sans effet sur les données de la maison. Alors qu'exiger une
confirmation coûterait bien plus cher — quelqu'un qui veut arrêter de recevoir et à qui on
oppose un écran de plus n'appuie pas sur « confirmer », il appuie sur « indésirable ». Et ce
n'est pas le message qu'il condamne alors, c'est le domaine entier, lien de connexion compris.

Le pire cas d'un GET trop obéissant est ici de rendre exactement le service demandé, un peu
trop tôt.

---

## D26 — Les jetons d'email vivent dans des tables sans policy

`event_rsvp_tokens` (0009) et `unsubscribe_tokens` (0010) ont la RLS **active et aucune
policy**. Ce n'est pas un oubli : c'est la protection.

Le réflexe aurait été de poser le jeton en colonne — sur `event_participants` pour la réponse,
sur `users` pour le désabonnement. Les deux tables sont lisibles par toute la maison : le
jeton l'aurait été aussi, depuis la console du navigateur, et n'importe qui aurait pu répondre
ou désabonner à la place de n'importe qui.

Une colonne révoquée ne marche pas non plus : chez Postgres, `revoke select (colonne)` **ne
fait rien** tant que le rôle garde le privilège de table. C'est le même piège que D12
documente pour les fonctions, sous une autre forme — et il faudrait révoquer la table puis
re-`grant` colonne par colonne, ce qu'une migration future oublierait.

Sans policy, seule la clé de service passe : c'est-à-dire uniquement le code qui envoie les
emails. **Conséquence voulue : un jeton n'existe que si un message est réellement parti.**

L'advisor Supabase signalera « RLS enabled, no policy » sur ces deux tables. C'est l'état
recherché, comme le faux positif de D12.

---

## D27 — Un seul cron, à 18 h, et le rappel d'agenda vide fondu dans l'hebdomadaire

**Un seul cron**, parce que Vercel en plafonne le nombre à une exécution par jour sur le plan
Hobby (D15). Le plan en prévoyait trois. `/api/cron/sync-calendars` les porte tous : il
synchronise **puis** écrit. L'ordre compte — un résumé envoyé avant la synchronisation
annoncerait la veille.

Le nom de la route ne change pas, alors qu'elle fait désormais plus que synchroniser. Le
renommer changerait le chemin déclaré dans `vercel.json`, et un cron qui pointe vers une route
disparue échoue **sans bruit** : exactement la panne que la phase 4 a déjà payée une fois.

**18:00 UTC** — 20 h à Paris l'été, 19 h l'hiver. Le plan veut les résumés « tous les soirs »
(§39) ; 5 h du matin ne l'était pas. Les agendas n'y perdent rien : leur fraîcheur vient
surtout de `syncIfStale`, déclenché à chaque ouverture d'une vue.

**Le rappel d'agenda vide (§42) est fondu dans le résumé hebdomadaire** au lieu d'être un
envoi séparé. Deux emails le même jour, dont un qui dit « ton agenda est vide », c'est un de
trop — et c'est celui-là qu'on cesse d'ouvrir. Dans le résumé, la même phrase devient une
information parmi d'autres au lieu d'un reproche isolé. Le ton reste taquin, jamais un
reproche (§3) : *« Ta semaine ressemble étrangement au désert du Sahara. »*

**Et on ne dit rien quand il n'y a rien à dire.** Le résumé quotidien ne part pas si demain
est vide et qu'aucun créneau ne vaut d'être signalé. Un email vide reçu tous les soirs se fait
mettre en indésirable en une semaine, et emporte le domaine avec lui.

---

## D28 — « Qui est libre le … ? » : la question inverse, et ce qui occupe les gens

**Demande du commanditaire, 3 août 2026.** « Trouver un moment » part d'une envie et cherche
quand. Il fallait l'autre sens : partir d'une date et regarder qui.

**Pourquoi ce n'est pas un doublon.** On connaît presque toujours le jour avant de savoir avec
qui — « samedi, il y a moyen ? » est la phrase qu'on lance à la cuisine, et c'est exactement
celle que le produit existe pour remplacer. Le premier mode répond « quand », celui-ci répond
« qui ». `PLAN.md` §21-22 ne décrit que le premier.

**Le vrai apport est ailleurs : on montre ce qui occupe les gens.** Un agenda qui se contente
de dire « Sophie n'est pas libre » **ferme la discussion**. En affichant que Sophie fait
les courses, il la laisse ouverte : c'est à elle de décider si le golf vaut mieux que les
courses. D'où le bouton **« Je me désiste »**, qui ne s'affiche que sur ses propres
participations, et jamais sur un rendez-vous importé de Google (D13).

C'est le seul endroit du produit où une superposition d'événements devient une information
utile plutôt qu'un conflit. Sans lui, on ne propose pas — et une famille qui ne propose rien
n'organise rien.

**Deux modes, un écran, et le mode vit dans l'URL** (`?jour=2026-08-08`) comme le reste : il se
partage, et le retour arrière le respecte. Le sélecteur est fait de liens, pas de boutons.

**Ce mode-là ne filtre personne.** La question est « qui est libre », pas « est-ce que ceux
que j'ai cochés le sont » : cocher d'avance reviendrait à répondre avant d'avoir demandé.

---

## D29 — Les catégories d'événement appartiennent à la maison

> **Tranchée par D45 (5 août 2026)** : les quatre questions ouvertes ci-dessous y trouvent leur
> réponse.

**Demande du commanditaire, 3 août 2026.** `PLAN.md` §13 ne prévoit qu'un champ libre. Une
rangée d'émojis a été livrée en phase 2 comme raccourci — elle devient une rangée de
**catégories** : un émoji **et** un titre, que la maison compose elle-même.

**Pourquoi ce n'est pas un réglage de confort.** Le champ libre est retapé à chaque fois, et
mal orthographié une fois sur deux : « Apero », « apéro », « Apéro chez nous ». Trois
événements qui sont le même rituel n'en ont l'air nulle part. Une catégorie fige le nom une
fois, et **toute la maison la voit** — c'est exactement le raisonnement des lieux (D20), sur
l'autre moitié du formulaire.

**Elle appartient à la maison, pas à qui l'a créée.** N'importe qui la crée, n'importe qui la
corrige. La règle constante depuis D21 : *un événement appartient à qui l'organise ; ce qui
sert à le décrire appartient à la maison.*

**La création se fait depuis l'écran de création d'événement**, jamais depuis un écran de
réglages. C'est là que le besoin apparaît — au moment où l'on ne trouve pas sa catégorie — et
renvoyer ailleurs à cet instant-là fait abandonner avant la fin.

### Ce qu'il faudra trancher

1. **Ce que remplit un tap.** Le titre *et* l'émoji, ou seulement l'émoji ? Remplir le titre
   fait gagner le plus de temps, mais écrase ce qui est déjà tapé — il faut décider si l'on
   remplace, si l'on préfixe, ou si l'on ne touche pas à un champ non vide.
2. **Le jeu de base.** Des lignes réellement insérées à la création de la maison (modifiables,
   supprimables, mais qui polluent si on n'en veut pas), ou une liste en dur affichée derrière
   celles de la maison (jamais dans le chemin, mais impossible à corriger) ?
3. **La suppression.** Une catégorie utilisée par des événements passés ne doit pas casser
   l'historique — même piège que les lieux.
4. **Le nombre.** Une rangée qui défile horizontalement tient cinq ou six entrées avant de
   devenir illisible sur un téléphone. Que fait-on à la vingtième ? Les plus utilisées d'abord
   est probablement la seule réponse qui ne demande rien à personne.
5. **La RLS avec la table**, et les contrôles `verify:rls` **dans le même commit** — c'est ce
   qui a attrapé la faille inter-maison de `calendar_connections` (0005).

---

## D30 — Les notifications sur le téléphone vivent en phase 11, avec la PWA

**Demande du commanditaire, 3 août 2026.** Absente de `PLAN.md`, qui ne prévoit que l'email
(§39-43) et range explicitement « système de notifications complexe » dans ce qu'il ne faut
*pas* construire au début (§77).

**Pourquoi c'est en phase 11 et pas ailleurs :** c'est **l'installation qui débloque la
notification**. Sur iPhone, le Web Push n'existe que pour une PWA ajoutée à l'écran d'accueil —
Safari ne propose rien à un site ouvert dans un onglet. La notification n'est donc pas une
feature posée à côté de la PWA : c'est **la raison la plus concrète de l'installer**, et
l'argument à mettre dans l'invitation à installer (§65).

**Elle ne remplace pas l'email.** Une notification se rate — téléphone silencieux, écran
verrouillé, permission refusée ; un email attend. Mais le même événement ne doit pas produire
les deux, sinon on finit par couper les deux.

### Les pièges connus, avant d'écrire une ligne

- **iOS ne notifie que les PWA installées**, et seulement depuis iOS 16.4. Tester dans Safari
  sur un onglet ne prouvera rien, dans un sens comme dans l'autre.
- **Demander la permission au premier écran la fait refuser**, et un refus sur iOS ne se
  redemande pas — il faut désinstaller la PWA. La demande doit venir *après* un moment où la
  personne comprend ce qu'elle y gagne, jamais à l'ouverture.
- **Un abonnement Web Push expire sans prévenir.** Il faut le rafraîchir et retirer les morts,
  sinon la file d'envoi se remplit d'adresses fantômes — même famille de panne que
  `needs_reauth` sur les jetons Google.
- **Les clés VAPID sont des secrets serveur.** La publique va au client, la privée ne sort
  jamais du backend — même règle que toutes les clés du projet.
- **Le contenu d'une notification s'affiche sur un écran verrouillé**, donc devant n'importe
  qui. La règle de confidentialité de D13 s'y applique telle quelle : un événement `is_private`
  n'y écrit jamais son titre.

---

## D31 — Le context builder n'est pas déroulé d'avance : les tools le déroulent

§71 décrit une chaîne : `Question → Intent → Personnes concernées → Dates concernées →
Événements concernés → LLM`. Elle existe bel et bien — mais les trois étapes du milieu **sont
exactement ce qu'un appel de tool décide**. Le modèle nomme les personnes et les dates, le
serveur va chercher les événements correspondants et ne lui rend que ceux-là.

**Pourquoi pas une étape de classification en amont.** Deviner l'intention avant de poser la
question demanderait un premier appel de modèle, donc une latence et un coût de plus — pour un
résultat moins bon que la question posée directement à celui qui va y répondre.

**Ce qui part quand même sans qu'on ait rien demandé** — la *graine* :

- **la date et l'heure courantes, en clair, dans le fuseau de la maison.** Sans elles, « demain »
  ne veut rien dire pour un modèle, et il invente un jour plausible sans jamais signaler qu'il
  l'a inventé ;
- **les prénoms des habitants**, nécessaires à toute question, et ce sont eux que les tools
  attendent en entrée — les identifiants ne quittent jamais le serveur ;
- **aujourd'hui et demain**, parce que « qu'est-ce qu'on fait aujourd'hui ? » est la question la
  plus fréquente et que la servir sans aller-retour supplémentaire est ce qui la fait tenir sous
  les quinze secondes.

Jamais plus. Une conversation qui renvoie tout l'agenda à chaque tour coûte cher **et répond
moins bien** — la question se noie dans le décor. Mesuré sur les essais réels : 2 300 à 5 300
tokens d'entrée par question, boucle d'outils comprise.

**Les allers-retours d'outils ne sont pas conservés en base**, seulement les questions et les
réponses. Ce n'est pas une économie de place : un agenda relu il y a dix minutes est déjà faux,
et le renvoyer apprendrait au modèle à répondre de souvenir plutôt qu'à rappeler le tool.

## D32 — Le raisonnement du modèle reste allumé, à effort bas

Le modèle par défaut est **`claude-opus-5`**, surchargeable par `ANTHROPIC_MODEL` sans
redéploiement. Deux réglages méritent leur ligne.

**L'effort est bas.** Une question d'agenda ne demande pas une réflexion profonde, et la latence
se voit sur un téléphone.

**Mais le raisonnement n'est pas coupé**, alors que ce serait le réflexe pour gagner encore une
seconde. Sur ce modèle, raisonnement désactivé, l'appel d'outil est parfois écrit **dans le
texte** au lieu d'être émis comme appel : le tour réussit, le tool n'est jamais exécuté, et rien
ne le signale. C'est la panne silencieuse que ce projet a déjà payée deux fois — le cron de la
phase 4, le désabonnement de la phase 6. L'effort bas donne l'essentiel de l'économie sans le
risque.

**Le coût reste un arbitrage ouvert, et il appartient au commanditaire.** Opus est le modèle le
plus capable, donc le plus cher ; le routeur (D34) est l'endroit prévu pour envoyer les questions
simples ailleurs, le jour où on aura des mesures plutôt que des intuitions.

## D33 — `AIProvider` : écrite pour l'application, pas pour la moyenne de deux SDK

D10 avait évité le piège pour `CalendarProvider` : dessiner l'interface sous le premier
fournisseur, laisser le second entrer sans rien casser. Le piège symétrique guettait ici — une
interface modelée sur Anthropic aurait été un emballage Anthropic déguisé. Trois choix en
découlent.

**Un tour d'assistant porte du texte *et* des appels ; les résultats reviennent dans un tour à
part.** Anthropic les range en blocs dans un message `user`, Groq en messages `tool` séparés :
aucune des deux conventions ne remonte plus haut que son propre fichier.

**Un tour d'assistant peut porter un écho brut, opaque, signé du fournisseur qui l'a produit.**
Ce n'est pas une fuite d'abstraction mais une contrainte réelle : Anthropic exige que les blocs
de raisonnement d'un tour lui reviennent inchangés, sinon il refuse le tour suivant de la boucle
d'outils. Le nom du fournisseur accompagne l'écho pour que personne ne relise celui d'un autre —
si le routeur bascule en cours de boucle, l'écho est ignoré, pas traduit.

**Le prompt système est coupé en deux : `stable` et `live`.** La coupure n'est pas une préférence
de fournisseur, c'est un fait sur nos données — la moitié ne bouge jamais. Anthropic y pose un
point de cache, Groq se contente de concaténer. Mélangées, le seul horodatage suffirait à faire
repayer les règles à chaque phrase.

**Pas de streaming, et c'est un choix daté.** Sur une question d'agenda, l'attente vient des deux
allers-retours d'outils, pas de la longueur du texte — Casa AI répond en trois phrases. Un
curseur qui écrit mot à mot n'aurait rien accéléré ; dire *ce qu'elle est en train de faire*,
si. La question se reposera en phase 8, quand la voix lira les réponses, et l'ajout se fera par
un rappel optionnel sans casser la garantie « la réponse complète est rendue » dont dépend
l'enregistrement en base.

## D34 — Le routeur bascule sur trois signaux, et il le dit

**Quand basculer.** Trois signaux, trois comportements : *panne* (réseau, 5xx, refus) → on
bascule tout de suite ; *lenteur* → un délai de 20 s est armé sur chaque appel, dépassé on
bascule ; *quota* (429) → on bascule **et** on met le fournisseur au coin cinq minutes, sinon
chaque question suivante repaie le même délai avant de retomber au même endroit. La mise au coin
ne survit pas au processus — sur Vercel chaque instance a la sienne. Ça amortit une rafale, ça ne
prétend pas compter un quota.

**Une bascule silencieuse n'est pas honnête.** L'écran mentionne, sous la réponse, qu'elle vient
du modèle rapide. Répondre avec un modèle plus faible sans le dire, c'est laisser quelqu'un juger
Casa AI sur un essai qu'elle n'a pas passé. En phase 9, où l'IA proposera des actions, la réponse
devra devenir plus stricte que « on le mentionne ».

**Qui répond en premier : Anthropic, pour toutes les questions.** C'est le seuil que JON-51
invitait à discuter — router « résume ma semaine » vers le modèle rapide économiserait des
centimes et une seconde. On ne le fait pas encore, et ce n'est pas de la prudence : la question la
plus banale est celle qui demande le plus d'arithmétique de dates, et une réponse fausse sur un
agenda familial coûte infiniment plus qu'une réponse lente. La couture est posée à un seul
endroit ; la décision se prendra avec des mesures.

**Deux défauts trouvés en essayant le repli pour de vrai**, et qu'aucune relecture n'aurait
donnés :

- **Groq rate son appel d'outil environ une fois sur six** (`tool_use_failed` : du JSON invalide
  produit sous décodage contraint). La même requête, renvoyée telle quelle, passe. Une seule
  reprise, donc — sans elle, une question sur six échouait au moment précis où Groq sert de
  filet, c'est-à-dire quand Anthropic est déjà tombé.
- **Au dernier tour de boucle, on retire les outils.** Sinon le modèle en redemande un de plus,
  sa réponse reste vide, et la personne reçoit « je n'arrive pas à en tirer une réponse claire »
  alors que tout était déjà sous ses yeux. Vu sur les deux fournisseurs.

Le modèle Groq par défaut est `llama-3.3-70b-versatile`, surchargeable par `GROQ_MODEL` : le
catalogue de Groq bouge plus vite que ce dépôt. `openai/gpt-oss-120b` a été essayé — meilleur sur
le papier, deux fois plus d'échecs d'appel d'outil en pratique.

## D35 — Casa AI ne crée rien, et elle le dit elle-même

> **Portée close le 4 août 2026 par [D41](#d41--un-tool-décriture-ne-sexécute-pas-il-propose).**
> Casa AI crée désormais — en proposant un aperçu que la personne valide. Cette décision n'était
> pas fausse, elle était **datée** : elle disait ce que la phase 7 livrait, et pourquoi le reste
> attendait. On ne la réécrit pas ; ce qu'on a cru un jour fait partie de l'histoire.

La phase 7 livre **la lecture, et rien d'autre** : quatre tools qui lisent, aucun qui écrit.
`create_event` et ses semblables sont la phase 9, et ce n'est pas un découpage arbitraire — ils
ont besoin de l'aperçu et de la confirmation décrits en D22, qui sont l'essentiel du travail.

Conséquence assumée à l'écran : quand on demande « organise un apéro samedi », Casa AI propose le
créneau et **renvoie vers « ✨ Trouver un moment »**. Elle ne fait pas semblant, et elle ne promet
pas non plus — D13 interdit exactement ça.

Même raison pour le micro : la barre de saisie de la phase 1 portait une icône de micro
décorative. Elle est remplacée par un bouton d'envoi, et une ligne dit que la voix arrive. Un
bouton qui ment coûte plus cher qu'un bouton absent.

## D36 — L'audio vit dans un bucket privé, et on ne lit jamais ce que le navigateur envoie

`audio_generations.audio_url` existait depuis la migration 0001 sans que rien ne pointe nulle
part : le projet n'avait **aucun bucket**. La phase 8 devait trancher, et voici ce qui a été
tranché, dans l'ordre d'importance.

**Un bucket, pas un flux à la demande.** Streamer depuis la Route Handler à chaque écoute aurait
été le plus simple à protéger — il n'y aurait rien eu à protéger. Mais §72 interdit de générer
deux fois le même audio, et la colonne `text_hash` avec sa contrainte d'unicité attendait ce
code depuis le premier jour. Mesuré : la première écoute prend quelques secondes, les suivantes
330 ms, et le compte ElevenLabs n'est appelé qu'une fois.

**Privé, et le chemin porte l'isolation** — `<user_id>/<empreinte>.mp3`. Un fichier audio
survit à la session qui l'a produit ; public, son URL serait un lien qui marche pour n'importe
qui, pour toujours, et qui contient l'agenda de quelqu'un lu à voix haute. C'est, avec l'email,
le seul endroit du système où une fuite est définitive. Les policies ne regardent que le premier
segment du chemin : deviner une empreinte ne sert à rien, il faudrait d'abord être la bonne
personne. Vérifié — le même fichier demandé sans signature répond `400`.

**L'URL est signée une heure ; le fichier, lui, reste.** C'est l'accès qui expire, pas le cache.
D'où le fait que la colonne range le **chemin** et non l'URL : une colonne qui contient une
valeur périmée est pire qu'une colonne vide. Le nom `audio_url` vient de 0001 ; il dit
l'intention, pas le format.

**L'empreinte porte le texte, jamais l'identifiant du message.** C'est ce qui rend la fraîcheur
structurelle : un agenda qui change produit une réponse différente, donc une empreinte
différente, donc un nouvel audio. Hacher l'identifiant aurait été plus simple — et aurait rejoué
l'agenda de la veille pour toujours.

**Et la décision qui compte le plus : la route ne reçoit qu'un identifiant de message, jamais du
texte.** Le serveur relit le contenu en base et c'est celui-là qui part chez ElevenLabs. La
raison évidente est le quota — sinon n'importe qui fait lire n'importe quoi. La vraie raison est
ailleurs : un texte relu en base est un texte **déjà passé par le masquage** de
`lib/ai/tools.ts`. Faire confiance au navigateur aurait rouvert par la voix ce que D21 et JON-50
ferment à l'écrit.

**Ce qui n'est pas résolu, et qui est assumé.** Deux onglets qui demandent la même lecture au
même instant génèrent deux fois : la contrainte d'unicité protège la table, pas l'appel. Le
bouton est désactivé pendant la génération, donc il faut vraiment le vouloir. On paiera le
verrou le jour où ça se produira, pas avant.

## D37 — La voix appartient à celui qui l'écoute, et l'empreinte du cache la porte

**Demande du commanditaire, 4 août 2026**, après avoir vu D36 marcher. La voix était un réglage
de serveur (`ELEVENLABS_VOICE_ID`) : un choix pris une fois pour toute la maison, par quelqu'un
qui ne l'avait pas écoutée. Elle devient un réglage **par habitant**, dans `/moi`, avec un
aperçu.

**`null` ne veut pas dire « la voix par défaut », il veut dire « je n'ai pas choisi ».** La
nuance décide de ce qui se passe le jour où la maison change d'avis sur sa voix par défaut :
ceux qui n'ont rien choisi suivent, ceux qui ont choisi gardent la leur. Une colonne initialisée
à la valeur par défaut aurait figé tout le monde sur le choix du jour de la migration.

**L'empreinte du cache porte la voix, et c'est structurel.** L'aperçu dit exactement la même
phrase pour les quatre voix. Une clé qui n'aurait porté que le texte aurait fait rejouer le
premier aperçu à la place du deuxième — on aurait choisi une voix **en en écoutant une autre**,
sans que rien ne le signale. Même famille de piège que « hacher l'identifiant du message plutôt
que son contenu » (D36) : un cache dont la clé oublie une variable rend une réponse d'apparence
parfaitement normale, et fausse. Mesuré : la même phrase pèse 104 951 octets en Audia et 97 846
en Thierry ; redemander Audia rend le premier fichier, à l'octet près.

**Quatre voix, pas le catalogue.** Le compte en expose des dizaines ; en proposer dix
reviendrait à ne proposer personne. Quatre suffisent à ce qu'on ne subisse pas la voix qu'on
entendra tous les matins.

**L'aperçu et le choix sont deux gestes séparés.** Le triangle fait entendre, le nom choisit. Un
sélecteur qui enregistre au moment où l'on écoute obligerait à choisir avant d'avoir entendu —
soit exactement ce que la demande voulait corriger.

**La route d'aperçu ne décide de rien.** Ni le texte (écrit dans `lib/voice/voices.ts`), ni la
voix (validée contre la liste, `400` sinon). Sans ces deux verrous, ce serait un proxy ouvert
vers ElevenLabs : n'importe quelle phrase, n'importe quelle voix, sur le quota du compte. La
même validation est refaite dans la Server Action qui enregistre — une action est une porte
d'entrée comme une autre.

**`ELEVENLABS_VOICE_ID` disparaît.** Deux sources de vérité pour la même question — l'une dans
l'environnement, l'autre dans une colonne — auraient fini par se contredire, et c'est la copie
qu'on ne lit plus qui gagne ces disputes. La voix de la maison vit désormais dans
`lib/voice/voices.ts`, à côté de la liste qui la valide. `ELEVENLABS_MODEL`, lui, reste : il ne
parle pas de goût mais de coût.

---

## D38 — Le briefing est écrit par Casa AI, et le cache s'indexe sur les faits

> **Corrigée par D48 (5 août 2026)** : l'empreinte doit porter tout ce qui change
> le texte prononcé, pas seulement les faits. Deux portées peuvent lister les mêmes événements et
> ne pas se dire pareil. D38 n'est pas fausse — elle était incomplète.

**Plan §27.** Le briefing du jour et de la semaine, à écouter. Trois choses étaient à trancher,
et la troisième n'apparaît qu'une fois les deux premières prises.

**Le texte est écrit par le modèle, pas par un gabarit.** Le ticket le suggérait, et l'essai le
confirme : « Les heures se disent, elles ne s'écrivent pas » et « des phrases qui s'enchaînent,
jamais une liste » sont des consignes qu'un gabarit n'applique pas — il produirait exactement le
genre d'énumération qu'on ne peut pas suivre à l'oreille. `summarizeDay()` existait déjà et ne
convenait pas : son propre commentaire disait qu'il répond à « je peux la solliciter ou pas ? »
en un coup d'œil sur une carte. C'est un voisin, pas une base.

**Mais le modèle n'a aucun tool, et il ne choisit rien de ce qu'il lit.** On lui tend une feuille
de faits déjà passée par `visibleTitle` ; il la met en phrases. C'est plus sûr que le chat — il ne
peut structurellement rien demander de plus — et c'est un aller-retour au lieu de trois, ce qui
compte pour quelque chose qu'on écoute en s'habillant.

**Et c'est ce qui rend la troisième décision possible : le cache s'indexe sur les faits, pas sur
la prose.** C'était le piège de ce ticket, et il ne se voit qu'une fois le reste écrit. Un modèle
ne réécrit jamais deux fois la même phrase : une empreinte posée sur le texte prononcé — ce que
D36 et D37 font pour une réponse de chat — n'aurait **jamais** rejoué un briefing. Chaque écoute
aurait repayé le modèle *et* ElevenLabs, et « ne jamais générer deux fois le même audio » (§72)
serait devenu faux sans que rien ne le signale : le fichier arrive, il est juste, il a seulement
coûté trois fois.

`render()` reçoit donc deux choses distinctes là où il n'en recevait qu'une : **ce sur quoi porte
la lecture** (`about`, la clé) et **ce qu'il faut dire** (`say`, une fonction appelée seulement en
cas de manque au cache). Pour une réponse de chat et pour l'aperçu, les deux coïncident — rien ne
change. Pour un briefing, `about` est la feuille de faits.

La garantie de fraîcheur n'est pas affaiblie, elle est déplacée d'un cran vers l'amont : un agenda
qui change produit une feuille différente, donc une clé différente, donc un nouveau texte **et** un
nouvel audio. Elle vient toujours du contenu, jamais d'un horodatage ajouté à la main. Mesuré :
retirer un événement de la journée a fait passer l'empreinte de `b0951af4` à `7ad0f7ae` et
disparaître la phrase correspondante ; réappuyer sans rien changer répond `cached: true`.

**La route reçoit ce qu'il faut lire, jamais le texte à dire.** `speakMessage` relit son texte dans
`ai_messages` ; un briefing n'a aucune ligne là-dedans, puisque personne n'a rien demandé par écrit.
La solution facile — envoyer depuis le navigateur le résumé affiché — aurait fait dire à Casa AI
exactement ce qu'on lui donne, et le masquage n'aurait plus rien garanti. La route prend donc
`{ quoi, jour? }`, et le serveur va chercher le reste.

**Un briefing ne parle jamais de ce qui est déjà fini.** La coupure se fait sur la fin des
événements — donc la feuille ne change qu'aux moments où quelque chose se termine, quelques fois par
jour, et non à chaque seconde. Écrire l'heure courante dedans aurait suffi à rendre le cache
inutile. Une fenêtre entièrement passée fait exception et se raconte en entier, sinon « Écouter la
semaine » sur une semaine révolue ne dirait rien du tout.

**Et le défaut que seule l'écoute a montré :** les jours passés étaient d'abord listés *vides*,
puisque le filtre les avait vidés. Le mardi matin, le briefing de la semaine ouvrait donc sur
« Lundi, rien du tout, tu commences en douceur » — pour une journée déjà derrière, et qui avait en
réalité été chargée. Un jour vidé par un filtre et un jour réellement libre s'écrivent pareil ; seul
celui qui reste à venir veut dire quelque chose. Les jours révolus ne sont plus listés du tout.

**Ce que `verify:ai` gagne, et pourquoi maintenant.** Jusqu'ici `lib/voice/` ne lisait aucun
événement : le contrôle « aucun titre lu en direct » y passait **par vacuité**. Le briefing le met
à l'épreuve pour la première fois, et deux contrôles s'ajoutent : *tout fichier qui appelle
`getEvents` doit référencer `visibleTitle`* — avec un compteur qui fait échouer le contrôle le jour
où plus personne ne lit d'événement, c'est-à-dire le jour où il redeviendrait vide de sens — et
*`generateSpeech` n'a qu'un seul appelant*, `lib/voice/speech.ts`, le goulot par lequel tout texte
prononcé est fabriqué côté serveur. Un troisième interdit `body.text` dans les routes de la voix.
Les trois ont été vérifiés en les cassant exprès : chacun échoue quand sa garantie tombe.

**Ce qui est laissé de côté, et assumé.** §27 place aussi le bouton sur « le profil d'une personne »
et « la vue familiale ». Le premier n'a pas d'écran — aucune route ne montre la journée d'un
habitant seul. Le second dirait exactement la même chose que `/aujourdhui`, à un onglet de là : un
troisième bouton sur un écran qui en porte déjà deux, pour zéro information nouvelle.

---

## D39 — Le Speech-To-Text passe par ElevenLabs, et D1 se corrige d'elle-même

**Demande du commanditaire, 4 août 2026.** D1 avait tranché l'inverse, et il faut le dire :

> « Groq sert aussi le Speech-To-Text (Whisper), ce qui économise un fournisseur supplémentaire. »

**L'argument est tombé tout seul, sans que personne ne le remarque.** Il tenait quand Groq était le
seul service vocal envisagé. Depuis la phase 8, ElevenLabs est **dans** le projet : sa clé est en
production, éprouvée par la synthèse et par le briefing. Le fournisseur supplémentaire, ce serait
désormais **Groq pour ce seul usage** — exactement ce que D1 voulait éviter, à l'envers.

**La voix devient entièrement ElevenLabs : elle écoute et elle parle chez le même prestataire.**
Une clé, un compte, un quota, une facture. Et `lib/voice/` cesse d'avoir un pied chez deux services
pour deux moitiés du même geste — c'est le genre d'écart qui ne coûte rien le premier jour et qui,
le jour d'une panne, oblige à regarder deux tableaux de bord pour comprendre laquelle des deux
moitiés est tombée.

Groq ne disparaît pas : il reste ce que JON-51 en a fait, **le repli de Casa AI pour écrire**. Ce
qui change, c'est qu'il n'a plus qu'un rôle au lieu de deux.

**Le contrat est proche de celui de la synthèse, ce qui n'est pas un hasard :**

```
POST https://api.elevenlabs.io/v1/speech-to-text
xi-api-key: <clé>              (la même)
multipart/form-data plutôt que JSON — c'est la seule vraie différence de forme
```

**Ce que ça coûte, et il faut le savoir avant la panne.** Le micro et la synthèse partagent
désormais le même quota. Un compte à sec ne rend pas Casa AI muette d'un côté seulement : elle
devient **sourde et muette d'un coup**. Et contrairement à l'écrit, la voix n'a pas de repli — le
routeur de D34 ne couvre que la rédaction. C'est précisément ce qui vient d'arriver au compte
Anthropic en production (JON-61), où seul le texte trahissait la bascule. Les messages d'erreur
doivent donc nommer la panne : « Casa AI n'a pas réussi à t'entendre » et « Casa AI n'a pas réussi
à se faire entendre » ne se corrigent pas au même endroit.

**Ce que ça ne change pas**, et c'est l'essentiel : la clé ne touche jamais le navigateur,
l'enregistrement est transcrit puis **oublié** — aucune colonne n'existe pour le conserver, et il ne
faut pas en créer (JON-55) — et le transcript s'affiche **toujours**, sans quoi on ne peut pas
savoir si l'erreur vient du micro ou de la compréhension.

---

## D40 — Deux niveaux, pas deux noms de modèle : Sonnet pour le chat, Haiku pour le briefing

**Demande du commanditaire, 4 août 2026**, après avoir rechargé le compte Anthropic (JON-61) :
« sois économe ». La clé n'ouvre que la famille des « .5 » — `fable-5`, `opus-5`, `sonnet-5`,
`haiku-4-5`.

Le premier réglage demandait **Opus pour tout**, y compris pour dire « il te reste trois choses
aujourd'hui ». Ce n'était pas un défaut : c'était le choix du premier jour, pris quand personne
n'avait de mesure. `router.ts` avait d'ailleurs posé la couture exprès — « le jour où l'on aura des
mesures, la décision se prend ici, une fois ».

**Ce n'est pas « un modèle moins cher partout ».** Les deux usages ne demandent pas le même travail,
et la ligne de fracture est nette :

- **le chat** choisit un tool, écrit une date au format `AAAA-MM-JJ`, lit un résultat, recommence,
  puis répond. C'est de l'arithmétique de dates dans une boucle d'outils, et c'est là qu'une réponse
  fausse coûte : « Papa est libre samedi » alors qu'il ne l'est pas se paie en vrai. → **Sonnet 5** ;
- **le briefing n'a aucun tool.** Le fuseau, les jours révolus, l'événement à cheval sur minuit, le
  masquage : tout le difficile est réglé par notre code *avant* que le modèle ne voie quoi que ce
  soit. Il ne reste qu'à faire deux phrases d'une liste, sous un prompt de trente lignes très
  contraint. → **Haiku 4.5**.

Le raisonnement de `router.ts` — « une réponse fausse sur un agenda familial coûte infiniment plus
qu'une réponse lente » — opposait **Anthropic à Groq**, pas Opus à Sonnet. Sonnet 5 n'est pas un
modèle de repli.

**Mesuré, sur le vrai code et la vraie clé** : Opus 3 561 ms, Sonnet 2 300, Haiku 677. Et sur le
juge — la semaine vide, celle qui avait fait déraper le modèle de repli en 445 caractères de
développement personnel (JON-61) — Haiku rend **48 caractères** : « Ta semaine est complètement
libre. Profite bien. » Sur une journée chargée avec un événement masqué, il tient les heures en
toutes lettres et écrit « Sophie sera occupée », jamais le titre.

### Un niveau, pas un nom — et c'est ce qui empêche une panne pendant une panne

La forme évidente était `AIInput.model?: string`, avec l'appelant qui écrit « claude-haiku-4-5 ».
Ça marche jusqu'au premier repli : le routeur bascule sur Groq, qui reçoit un identifiant Anthropic
et répond `400`. La panne n'arriverait donc **que** les jours où le fournisseur principal est déjà
tombé — le pire moment, et le plus difficile à reproduire.

`AIInput` porte donc un `tier` (`standard` | `light`) que **chaque fournisseur traduit dans son
propre catalogue**. C'est la règle de D33, appliquée une fois de plus : l'interface décrit le besoin
de l'application, jamais la forme d'un SDK. Côté Groq, `light` retombe volontairement sur le même
modèle — ce fichier est le filet, et le jour d'une panne n'est pas le moment de découvrir qu'un
modèle plus petit se comporte autrement. La couture est là (`GROQ_MODEL_LIGHT`), pas la décision.

### Le piège trouvé en appelant le code, pas en le relisant

**Haiku 4.5 refuse `output_config: { effort }`** : `400 — This model does not support the effort
parameter`. Le paramètre est envoyé depuis la phase 7 pour baisser le raisonnement d'Opus.

Laissé tel quel, **chaque briefing aurait échoué et serait retombé sur Groq** : exactement la panne
de JON-61, mais causée par nous, invisible à l'écran — le fichier arrive, il est juste, il est
simplement écrit par le mauvais modèle et payé deux fois. Le drapeau appartient donc au **niveau**
et non au modèle : un petit modèle n'a de toute façon pas de molette de raisonnement à baisser.

C'est la deuxième fois dans cette phase qu'un défaut ne se voit qu'en exécutant le vrai chemin —
après le contrôle de `verify:ai` qui ne bronchait pas quand la route appelait l'API en direct.

### Opus ne disparaît pas, il devient un recours

`ANTHROPIC_MODEL` reste surchargeable sans redéploiement (D31). Si le chat se met à se tromper de
date, on remonte d'un cran en changeant une variable, pas une ligne de code. `claude-fable-5` n'est
pas retenu : jamais essayé sur ce projet, et on ne choisit pas un modèle sur son nom — c'est la
leçon de D37 sur les voix.

### La conséquence à connaître

Un briefing déjà en cache **ne sera pas réécrit** par le nouveau modèle : l'empreinte porte les
faits, pas le rédacteur (D38). Pour comparer deux modèles sur le même agenda, il faut retirer la
ligne de `audio_generations` et son fichier — sinon on réécoute le premier en croyant juger le
second.

## D41 — Un tool d'écriture ne s'exécute pas, il propose

**LA décision de la phase 9**, et elle commande tout le reste. Casa AI gagne `create_event` ; ce
tool **n'écrit rien**. Il valide, résout — les prénoms en habitants, « samedi » en date réelle —
range un brouillon avec un jeton dans `ai_action_drafts` (migration **0014**), et rend au modèle
« aperçu prêt, ne dis pas que c'est fait ». L'écriture part d'un **geste humain** qui consomme le
jeton une seule fois.

### Pourquoi ce n'est pas de la prudence

`runTool` s'exécute **au moment où le modèle appelle le tool**. Y brancher `createEvent()` créerait
l'événement avant que personne n'ait rien vu, et D22 tomberait en une ligne — sans qu'aucun
contrôle existant ne bronche : `verify:ai` vérifiait que chaque tool déclaré est *exécutable*, et
il l'aurait été, de la mauvaise façon.

Et le pendant, plus vicieux. `lib/ai/chat.ts` retire les tools au dernier de ses trois tours pour
forcer une conclusion en prose. Rien dans `askCasaAI` ne compare le texte final aux tools qui ont
réellement tourné : **le modèle peut écrire « c'est créé ! » sans avoir rien créé.** La personne
l'apprend samedi, quand personne ne vient.

Le contrat « proposer, pas exécuter » fait disparaître ce défaut au lieu de le surveiller. Il n'y a
plus de version du monde où « c'est créé » est vrai sans qu'un humain ait appuyé — et l'aperçu
affiche **« Rien n'est encore enregistré »** au-dessus du bouton, au même endroit que le geste.
Une phrase du modèle ne peut donc plus contredire l'écran.

### Le même choix règle trois autres problèmes d'un coup

- **la double exécution** — c'est le jeton, et c'est **Postgres** qui l'arbitre : la condition
  `consumed_at is null` vit dans le `where` de l'`update`, donc deux taps simultanés ne peuvent pas
  gagner tous les deux. Un drapeau relu puis écrit côté application aurait laissé passer les deux,
  et c'est le geste exact qu'on fait quand la connexion rame ;
- **l'injection par un titre d'agenda** (D42) — au pire un aperçu absurde qu'on refuse d'un tap ;
- **les quinze secondes** — aucun appel de modèle supplémentaire pour confirmer, et « Corriger »
  n'en demande pas non plus.

### L'ordre de la consommation n'est pas symétrique

**On consomme d'abord, on exécute ensuite.** L'inverse laisserait deux appuis rapides créer deux
événements. Un jeton brûlé pour rien est un désagrément ; un double dîner de famille est un
incident. Quand l'écriture échoue, le jeton est **rendu** — sans quoi une date mal corrigée
coûterait tout l'aperçu et il faudrait refaire parler le modèle pour rien.

### Ce qui rend la garantie structurelle, et pas seulement écrite

`lib/ai/tools.ts` **ne touche pas la base** : il appelle `ctx.propose`, passé par le contexte. Le
fichier qui *choisit* une action et celui qui la *range* restent deux fichiers, et `verify:ai`
refuse le premier `.insert(` qui entrerait dans le second. L'exécution, elle, passe par
`createEvent()` — la Server Action de la phase 2 — donc par `refusalFor`, le filtrage des
participants sur les membres connus, et le forçage de `creator_id`.

**Corollaire qui n'était écrit nulle part, et qu'on grave ici : l'événement créé par l'IA
appartient à qui a parlé, pas à Casa AI.** C'est la règle des trois propriétaires, obtenue
mécaniquement plutôt que par vigilance.

### Le jeton est l'identifiant de la ligne, et c'est la RLS qui en fait un jeton

Pas de second secret. Sous RLS, une ligne qui n'appartient pas à l'appelant n'est pas « refusée »,
elle est **introuvable**. C'est la différence avec les jetons d'email (D26), qui vivent dans une
table sans policy précisément parce qu'aucune session n'existe derrière un lien reçu par message.
Ici il y en a une.

### « Corriger » n'appelle jamais le modèle

`loadHistory()` jette les allers-retours d'outils (phase 7, et c'est un bon choix : un agenda relu
il y a dix minutes est déjà faux). Au tour suivant, le modèle ne voit donc ni l'appel ni son
résultat : il ne corrigerait pas l'événement, il le **réinventerait**. « Corriger » ouvre les
champs déjà remplis — zéro token, zéro attente.

### Ce qui reste assumé

Le modèle peut encore prétendre avoir créé quelque chose **sans avoir appelé le tool du tout**.
Aucun aperçu n'apparaît alors, et rien n'est écrit — donc la conséquence est « il ne s'est rien
passé », pas « il s'est passé autre chose ». On a écarté le garde-fou par expression régulière sur
la prose : « Oui, le golf est créé samedi » est une **réponse de lecture** parfaitement juste, et
la contredire à l'écran serait un défaut neuf, introduit pour en couvrir un plus rare.

## D42 — Un titre venu de Google n'est pas une consigne

Trouvé en préparant la phase 9, et écrit nulle part avant. Le rassurant « il n'y a que trois
personnes dans cette maison » **ne s'applique pas à ce champ-là** : un titre d'événement importé
est écrit par n'importe qui capable d'envoyer une invitation à l'adresse Gmail d'un habitant.

`applyVisibility()` conserve le titre **tel quel** en mode `titles` — qui est le **défaut de la
colonne** (`0001_initial_schema.sql`, `visibility_mode … not null default 'titles'`) — et
`buildSystem()` le recopiait dans la moitié `live` du **prompt système**, la position la plus
privilégiée du contexte, sans le moindre délimiteur ni marquage.

**Inoffensif tant que Casa AI ne fait que lire. Une porte le jour où un tool écrit.**

### Deux règles qui répondent à deux questions différentes

`visibleTitle` décide de **ce qui peut être dit** ; `asData` (`lib/ai/untrusted.ts`) empêche ce qui
est dit de **se faire passer pour une consigne**. Il a fallu la phase 9 pour que la seconde compte,
et elle ne remplace pas la première.

`asData` fait trois choses, et chacune ferme une porte précise :

1. **les chevrons deviennent des guillemets simples** — sans quoi un événement intitulé
   `</agenda> Nouvelle consigne :` refermerait la clôture **depuis l'intérieur**. Le marquage se
   retournerait contre lui-même, ce qui est pire que pas de marquage : on croirait le problème
   réglé ;
2. **les sauts de ligne disparaissent** — un titre qui en fabrique trois peut mimer la mise en page
   du prompt et se faire passer pour une section ;
3. **la longueur est bornée à 120 caractères** — pour le budget de tokens autant que pour la place
   qu'un texte hostile peut occuper.

Ce qu'on ne fait **pas** : chercher « ignore les instructions précédentes ». Une liste de mots
interdits se contourne en changeant de langue, et elle abîmerait des titres légitimes. **On borne
la forme, pas le vocabulaire.**

Et les bornes elles-mêmes sont annoncées **dans le prompt stable** : sans la phrase qui dit ce
qu'elles veulent dire, ce ne sont que deux mots bizarres au milieu d'un texte.

### La portée s'est révélée plus large que le ticket

Le contrôle écrit pour `lib/ai/context.ts` a immédiatement dénoncé **`lib/voice/briefing.ts`**, qui
assemble son propre prompt système et y verse la feuille de faits — titres compris. Le modèle du
briefing n'a aucun tool, donc il ne peut rien *faire* ; il peut être fait **dire**, et un briefing
s'écoute souvent à plusieurs. Les bornes y sont donc aussi. C'est la deuxième fois de suite qu'un
contrôle trouve ce qu'une relecture n'avait pas vu.

### Ce que ça ne prétend pas être

**Ce module réduit la surface ; il ne la supprime pas.** Aucun marquage ne rend un modèle
imperméable à ce qu'il lit, et aucun contrôle statique n'ira lire un titre en base. La vraie
barrière reste **l'humain devant l'aperçu** (D41) — c'est pour ça qu'il ne se contourne jamais.

Et ce que la RLS ne couvre pas, pour mémoire : elle répond à « as-tu le droit d'écrire ici ? »,
jamais à « est-ce bien ça que la personne a demandé ? ». « Supprime tous mes événements » passe
intégralement la RLS — chaque suppression est autorisée, prise une par une.

## D43 — Le fournisseur peut basculer au milieu d'une demande d'action, et c'est acceptable

Question laissée ouverte par le routeur lui-même : « En phase 9, où l'IA proposera des actions, la
réponse deviendra plus stricte que *on le mentionne*. » Il fallait trancher ici. **On ne refuse pas
de basculer.**

### Ce que la bascule change réellement

`ask()` réévalue les candidats à chaque étape (`lib/ai/router.ts`) : un `429` sur Anthropic met le
fournisseur au coin pour cinq minutes et passe à Groq, **au milieu de la même phrase**. Ce qui
change alors :

- **qui a choisi les arguments du tool** — le jour, l'heure, les prénoms ;
- **qui a écrit la prose** au-dessus de l'aperçu.

Ce qui **ne** change **pas** :

- l'aperçu, qui est **fabriqué par le serveur** à partir d'arguments déjà validés — dates bornées,
  prénoms résolus, droits vérifiés (D41) ;
- le fait que rien ne s'écrit sans un geste humain sur ce que cet aperçu montre.

Autrement dit : un modèle plus faible peut se tromper de samedi. **Il ne peut pas faire écrire ce
samedi-là sans que quelqu'un l'ait lu.** C'est exactement ce pour quoi l'aperçu existe, et refuser
la bascule reviendrait à dire qu'on ne lui fait pas confiance — auquel cas il faudrait le refaire,
pas ajouter une règle par-dessus.

### Ce qui a fait pencher la décision

**Refuser coûte plus cher que basculer.** Un refus rendrait Casa AI muette sur les actions pendant
toute une panne Anthropic — c'est-à-dire précisément quand la maison en a autant besoin que
d'habitude — pour éviter un aperçu qu'on relit de toute façon.

**Et la mention ne suffisait pas tout à fait.** L'essai sur la Preview l'a montré : demandé de
déplacer un rendez-vous Google, le tool a refusé, rien n'a bougé, aucun aperçu n'est apparu — et
le modèle de repli a répondu « **Je modifie l'appel avec Matthieu pour 22h — c'est à valider de
ton côté !** ». La ligne grise « répondu par le modèle rapide » était bien là, sous une phrase
parfaitement fausse.

C'est ce qui a produit le garde-fou qui manquait, et il ne dépend d'aucun modèle :
`AskResult.refusal`. **Quand un tool d'écriture a refusé et qu'aucun aperçu n'en est sorti, le
serveur le dit à l'écran** — trois conditions vérifiables, sans une seule expression régulière sur
du français. Le texte du modèle, lui, n'est pas réécrit : il part en base tel qu'il a été produit.

### La règle qui en découle

> On bascule, on le dit, et **on ne laisse jamais l'écran dépendre de ce que le modèle a écrit**
> pour savoir si quelque chose va se passer.

C'est la même leçon que D17, appliquée à un fournisseur de repli plutôt qu'à un commentaire : ce
qui est écrit dans une phrase n'est pas une garantie ; ce qui est vérifié par le serveur, si.

### Ce qui reste ouvert

Le budget des quinze secondes, quand Groq répond après une tentative Anthropic. `DEADLINE_MS`
autorise vingt secondes **par fournisseur** : le pire cas mesurable est donc bien au-delà de la
cible. On ne le règle pas ici — la bascule est rare, et la borne vaut mieux qu'un échec — mais
c'est le premier endroit à regarder le jour où quelqu'un trouvera la boucle vocale lente.

## D44 — On repart d'une conversation neuve, et l'écran n'a pas d'historique

**Ajout au périmètre du 4 août 2026**, demandé après le premier essai des actions vocales sur un
vrai téléphone : « il faudrait que ce soit de nouvelles conversations à chaque fois, pas un long
chat bot ». `PLAN.md` gagne un **§26 bis** — il ne disait rien de la façon dont une conversation
commence ou finit, et c'est exactement ce qui manquait.

### Ce que faisait la phase 7, et pourquoi ça se retourne

`getLastConversation()` reprenait le fil de la dernière fois, jusqu'à vingt messages en arrière.
Sur le papier c'est une commodité. À l'usage, trois choses :

1. **on ne revoyait jamais les suggestions.** Elles ne s'affichent que sur un fil vide — or le fil
   n'était plus jamais vide. C'est pourtant le seul endroit qui apprend ce qu'on peut demander, et
   il a **changé** en phase 9 : « Ajoute un golf samedi matin avec Sophie » y est apparu. Un
   habitant qui avait déjà posé une question en phase 7 ne l'aurait jamais vu ;
2. **le contexte d'hier pesait sur la question d'aujourd'hui.** `loadHistory()` renvoie douze
   messages au modèle : une demande d'action se lisait à la lumière d'un échange sans rapport ;
3. **un agenda familial n'est pas un chat.** On y pose une question, on obtient une réponse, on
   ferme. Le fil continu suggère le contraire — qu'il faudrait se souvenir d'où on en était.

La règle produit tranche : *est-ce que ça aide la famille à organiser quelque chose ensemble ?*
Reprendre le fil de la veille, non. Revoir ce qu'on peut demander, oui.

### « Pas d'historique » veut dire « pas d'historique à l'écran »

**On ne supprime rien en base**, et ce n'est pas un raccourci — c'est ce que deux garanties
existantes exigent :

- **« Écouter » relit le message en base par son identifiant** (D36). C'est ce qui fait que la voix
  ne dit jamais un texte venu du navigateur. Un message effacé rendrait le bouton muet ; un message
  jamais écrit rouvrirait la porte que D36 ferme ;
- `provider`, `model`, `input_tokens`, `output_tokens` vivent sur `ai_messages` (§72). Sans eux,
  une réponse bizarre redevient inimputable et personne ne voit le contexte grossir.

Ce qui disparaît, c'est **la reprise et la consultation** : `/ia` ne charge plus rien, et aucun
écran ne propose de relire un fil passé. Si le commanditaire voulait dire « efface », il faudrait
d'abord remplacer ces deux garanties — et le dire ici.

### Ce qu'on a changé de plus petit possible

**Rien côté serveur.** `askCasaAI` ouvrait déjà une conversation neuve quand le navigateur n'en
fournissait pas (`resolveConversation`). Il suffisait que la page cesse d'en fournir une —
`lib/data/ai.ts` disparaît entièrement, et c'est le bon signe : la fonctionnalité qu'on retire ne
laisse pas de moignon.

### Le piège du bouton, et où il est posé

**« Nouvelle conversation » vit en haut du fil, l'aperçu d'action en bas.** Un bouton qui efface
tout, posé près de celui qui valide, finirait par être tapé à sa place. Et ce n'est pas rattrapable :
un aperçu qui quitte l'écran reste en base jusqu'à sa péremption, mais **plus personne ne peut le
valider** — le jeton ne voyage que par la réponse qui l'a apporté.

C'est la conséquence assumée du choix : un aperçu se valide **là où il s'affiche**, tout de suite.
C'était déjà vrai avant — un brouillon ne revenait jamais dans l'historique (JON-63) — mais ça
devient visible maintenant que quitter l'onglet suffit à repartir de zéro.

## D45 — Un lieu et une catégorie sont des raccourcis, pas des clés étrangères

**Livraison des deux ajouts du 3 août 2026 (D20, D29), ensemble**, comme JON-38 le demandait :
« ce sont deux fois le même objet ». `PLAN.md` §13 bis et §13 ter les décrivaient déjà et ne
deviennent faux nulle part — ce fichier répond donc à une autre question que la leur : non pas
*qu'est-ce qui manquait*, mais *pourquoi a-t-on tranché comme ça*.

### La thèse : ce qui s'affiche reste sur l'événement

Un tap **recopie** — le titre et l'émoji d'une catégorie dans `events.title` et `events.emoji`,
le nom d'un lieu dans `events.location`. **Aucune clé étrangère ne part d'`events`.** Ces deux
tables sont un carnet, pas un référentiel. Trois problèmes disparaissent au lieu d'être résolus :

- **la suppression ne casse rien** : l'événement porte déjà tout ce qu'il affiche ;
- **l'import Google n'a rien à résoudre.** `applyVisibility` reste la seule écriture du lieu
  importé et décide par un `location: null` littéral. Une clé étrangère aurait déplacé cette
  décision d'une colonne qu'on ne peut pas contourner vers un `join` qu'on peut oublier — et
  aurait fait entrer dans une table partagée par la maison une adresse écrite par quiconque sait
  envoyer une invitation à une adresse Gmail (D42) ;
- **Casa AI n'y touche pas.** Aucun identifiant ne part au navigateur pour en revenir : ce serait
  la « cible glissée dans les corrections » que `verify:ai` refuse depuis la phase 9. Mieux : le
  modèle écrit « chez Mamie » en texte libre, et la résolution à l'affichage lui donnera
  l'itinéraire **sans une ligne de code d'IA**.

### Le défaut que la clé étrangère aurait produit, et que rien n'aurait vu

`private.move_into_family` (0007) re-parente les événements par
`update public.events set family_id = …`. Une clé étrangère composite vers un descripteur de
l'ancienne maison aurait fait échouer cet `update` sur une `23503`, donc `accept_family_invite`
en entier : **emménager chez quelqu'un serait devenu impossible**.

Et le harnais serait resté vert — les événements que `verify:rls` crée avant le déménagement ne
portaient aucun descripteur. La migration 0015 transporte désormais les lieux et les catégories
non-socle, et le contrôle qui l'exerce a été écrit dans le même commit.

### Les autres arbitrages

1. **On range, on ne supprime pas.** `archived_at`, et **aucune policy `for delete`** : la
   garantie tient par la base, pas par la discipline. Pour une catégorie c'est du confort ; pour
   un lieu c'est nécessaire — l'événement recopie le nom, jamais l'adresse, et c'est l'adresse
   qui fait l'itinéraire.
2. **Le socle est fait de vraies lignes** (six), posées par un déclencheur `after insert on
   families`. Une liste en dur serait incorrigible, ce que D29 interdit au mot près. Et surtout :
   pas de troisième réécriture de `create_family`, qui porte le verrou consultatif du bug des
   deux maisons **et** le `keep_user` de `next_free_color`.
3. **`label` et pas `name`.** `Defaulted`, dans `types/database.ts`, est une union **globale** qui
   contient déjà `"name"` : une colonne ainsi nommée deviendrait optionnelle à l'insertion alors
   qu'elle est `not null` sans défaut. Le trou serait silencieux à la compilation.
4. **Les doublons s'empêchent** : index unique partiel sur le nom **replié** (casse, accents,
   espaces multiples), sur `archived_at is null` — sinon ranger réserverait le nom à perpétuité.
5. **Il n'y a pas de socle pour les lieux**, et l'asymétrie est voulue : « Apéro » veut dire la
   même chose dans toutes les maisons, « Chez Mamie » ne veut rien dire dans aucune autre.

### Comment la migration a été vérifiée avant d'atteindre quatre personnes réelles

**Le branching Supabase exige le plan Pro.** La migration a donc été **répétée en transaction sur
la vraie base**, dix assertions comprises, terminée par un `rollback`, puis la production
recomptée : une maison, quatre habitants, vingt et un événements, zéro trace.

C'est même mieux qu'une branche pour ce cas : une branche Supabase démarre sur un schéma vide
(« production data will not carry over »), donc le rattrapage des maisons existantes n'y aurait
jamais été exercé.

Deux pièges payés ce jour-là :

- **un bloc `exception` en PL/pgSQL annule tout son contenu**, pas seulement l'instruction qui a
  échoué. Le premier jet du contrôle « ranger libère le nom » testait donc un nom que le bloc
  précédent avait défait — il passait pour une mauvaise raison ;
- retirer les deux `insert` de `move_into_family` fait bien tomber le contrôle du déménagement.

`verify:rls` passe de 51 à **67 contrôles**, de deux natures et il faut les deux : les négatifs
(une maison ne voit pas l'autre) et les **positifs** (B, colocataire, PEUT corriger un lieu de la
maison). Un harnais fait de refus passerait aussi bien avec des policies trop fermées, et
personne ne le saurait avant que quelqu'un n'essaie.

### Ce qui est perdu, et qui doit être su

**Renommer un lieu détache le passé.** Le repliage couvre la casse et les accents, donc la
correction typographique courante (« Chez Mamié » → « Chez Mamie ») continue de résoudre ; un
vrai renommage (« Le golf » → « Le Golf National ») laisse les anciens événements sur un nom qui
n'existe plus. Le modèle est fait pour **corriger une adresse**, pas pour renommer.

**Une catégorie ne filtre rien, ne colore rien, ne groupe rien.** Elle fait gagner des frappes et
fige une orthographe. C'est suffisant pour livrer, et ça doit être écrit ici plutôt qu'attendu
ailleurs.

## D46 — La semaine se lit en liste ; la grille horaire vit à la journée

**Ajout au périmètre du 5 août 2026**, sorti de la recette humaine (JON-68) parce que ce n'était
pas un défaut de mise en page. `PLAN.md` gagne un **§12 bis** : §12 décrit une grille à sept
colonnes inspirée de Google Calendar, et ce chapitre devient faux.

### Ce n'était pas une marge, c'était une division

La capture de recette montrait des titres tronqués à trois caractères — « Co… », « Rel… ». À
375 px :

```
(375 − 40) / 7                                  = 47,86 px par colonne
 − 1 bordure − 3 barre de couleur − 16 padding  = 27,86 px de texte
 à 13 px semi-gras                              = 4 caractères
```

Et dès **deux** événements superposés, `calc(50% − 3px)` laisse **1,43 px de texte**. À trois, la
largeur devient négative. **Aucun réglage de padding ne récupère 1,43 px.**

### Ce qui a tranché, et pourquoi ce n'est pas trahir la demande

Le commanditaire demandait « la même UI que le calendar de Apple ou l'agenda de Google ». Or
**ni l'un ni l'autre ne montre sept colonnes horaires en portrait sur un téléphone** : Google
bascule en « 3 jours » ou en « Planning », Apple propose une liste. Suivre la lettre de la
demande revenait à reproduire une forme qu'aucun des deux n'utilise sur ce format — donc à
reproduire le défaut.

Quatre designs ont été maquettés avec les vraies données de la maison, chiffrés, et soumis. Le
commanditaire a tranché pour l'agenda en connaissance de cause. **C'est la bonne façon de
s'écarter d'une demande : montrer, expliquer le calcul, et laisser décider.**

### Ce que ça change

Un titre passe de 27,86 px à **255 px** — ≈ 31 caractères sur une ligne, 62 sur deux. Et surtout
la lisibilité **cesse de dépendre du nombre d'événements** : deux rendez-vous à 9 h sont deux
rangées de 255 px, pas deux colonnes de 20. Le chevauchement cesse d'être un problème
typographique. La cible passe de 47,9 × 22 à 343 × 68 — vingt-trois fois la surface.

**La grille horaire ne disparaît pas, elle change d'échelle** : elle reste à la journée, pleine
largeur, où le glisser-déposer et le redimensionnement de §12 gardent leur sens.

### Deux défauts qu'aucune maquette n'aurait montrés

Trouvés en ouvrant l'écran sur la Preview, pas en relisant :

- **« Tout le monde est libre de 08:00 à 22:00 » s'affichait les sept jours d'affilée.** Sur une
  maison peu chargée la bande se déclenche partout. C'est vrai, et c'est sans valeur : sur un
  jour vide, la phrase répète ce que le jour dit déjà, et sept répétitions noient l'unique
  occurrence qui aurait compté. **Un créneau commun n'est une information que quand il est un
  trou dans une journée occupée** — et **la bande a fini par quitter `/semaine` entièrement**
  le 26 août, après essai sur un vrai téléphone (**D57**) ;
- **trois textes sous le plancher de 16 px** — les en-têtes de jour, à 13 px en capitales. C'est
  la convention d'étiquette du projet, mais elle ne s'applique pas ici : ce sont les repères
  principaux de l'écran, pas des étiquettes qu'on survole.

### Et deux qui n'avaient jamais été signalés

- **`/semaine` avait deux éléments collants** : l'en-tête en `top-0` et les jours en
  `top-[5.5rem]` = 88 px, pour un en-tête qui en mesure ~104. Les jours passaient **sous** le
  titre, plus toute l'encoche en application installée. `PageHeader` gagne un slot `below` : on
  **supprime la notion** plutôt que de recalculer le nombre, parce qu'un second `sticky
  top-[Xrem]` redevient faux dès qu'on ajoute une ligne au titre ;
- **le numéro du jour échouait le contraste AA** : blanc sur l'accent donne 3,46:1 quand le petit
  texte exige 4,5:1. Passé à 20 px gras, on entre en régime « grand texte » (seuil 3:1). La
  lisibilité pour un œil de soixante-dix ans et la conformité tirent au même endroit.

## D47 — Le calendrier de la maison, le mien, et ce que « le mien » veut dire

**Ajout au périmètre du 5 août 2026** — « il faut avoir deux vues, une vue calendrier de la maison
et une vue mon calendrier ». `PLAN.md` gagne un **§12 ter**.

### La définition, et pourquoi elle a été tranchée plutôt que devinée

> **Un événement est dans « ma semaine » si j'y participe sans m'être désisté. Rien d'autre.**

**Pas de `|| creatorId === meId`**, et c'est vérifié plutôt que supposé. On croit volontiers qu'un
événement importé de Google n'aurait que son propriétaire en participant, ce qui obligerait à
rattraper par le créateur : `lib/calendar/sync.ts` écrit **toujours** une ligne
`event_participants` en `accepted`, et `createEvent` force le créateur dans la liste. La clause
n'aurait donc rien rattrapé.

Elle aurait en revanche créé une incohérence réelle : un événement que j'ai créé **puis décliné**
serait dans « ma semaine » et absent de « la semaine de la maison ». Un sous-ensemble qui n'en
est pas un, et personne n'aurait su dire pourquoi.

C'est aussi ce qui donne son sens à D50 : **se retirer d'un événement le fait disparaître de sa
propre semaine.**

### Où vit la définition, et pourquoi ça compte

`lib/calendar/scope.ts` — module **pur**, sans `server-only`, parce que l'écran **et la voix**
doivent le consommer. C'est la leçon de `lib/data/availability.ts` : une constante rangée dans un
module `server-only` puis lue par un composant client embarque tout le client Supabase dans le
bundle du navigateur.

Deux définitions de « ma semaine » divergeraient, et c'est la voix qui dirait alors autre chose
que ce que l'écran montre — sans erreur, sans trace. `verify:ai` a gagné un contrôle qui
l'interdit (D48).

### `ScopeSwitch` remplace `MemberFilter`

Sur les deux vues. Trois idiomes de filtre pour une seule question — *de qui montre-t-on les
événements ?* — c'était deux de trop. Il en hérite le garde-fou qui compte (**toujours exactement
une chip active**, donc jamais d'écran vide sans explication) et gagne ce qui manquait : un
dégradé qui **dit** que la rangée déborde. Elle débordait sans le moindre indice, donc personne
ne faisait défiler.

## D48 — La portée du briefing entre dans la clé de cache

**Ajout au périmètre du 5 août 2026** — « pour "écouter la semaine", il faut distinguer "écouter
la semaine de la maison" et "écouter ma semaine" ». `PLAN.md` gagne un **§27 ter**. **Corrige
D38**, qui est annotée d'un renvoi vers ici.

### Ce que D38 disait, et où elle s'arrête

D38 pose que l'empreinte du cache porte **les faits, pas le rédacteur** : un modèle ne réécrit
jamais deux fois la même phrase, donc une clé posée sur la prose n'aurait jamais rejoué un
briefing. C'était juste, et ça l'est resté.

D48 en montre la limite, et elle est vicieuse. « Ma semaine » et « la semaine de la maison »
listent parfois **exactement les mêmes événements** — une semaine où tout est déjà à moi — mais
ne se disent pas pareil : l'une tutoie, l'autre nomme les gens. **Faits identiques, prose
différente.** Sans l'audience dans la clé, la deuxième écoute rejouait l'audio de la première.

Ça parle, c'est fluide, et c'est le mauvais briefing. Le profil de défaut exact que ce projet
redoute : aucune erreur, une réponse d'apparence normale, et fausse.

`about` porte donc `briefing:<scope>:<audience>` — **explicitement**, et pas seulement par
l'effet du filtre sur les faits.

### Deux contrôles, et ils ont été cassés exprès

`verify:ai` passe de 27 à **29 contrôles** :

| Contrôle | Ce qu'on casse pour le voir tomber |
|---|---|
| la clé porte le périmètre **et** l'audience | retirer l'audience du gabarit |
| « ma semaine » se calcule avec `mine()` | remplacer l'appel par un filtre recopié |

Le premier est un contrôle de **forme** — `gatherBriefing` lit la base, elle ne peut pas être
exécutée en CI. C'est un écart assumé par rapport aux contrôles qui *exécutent* la règle : ici la
garantie vit dans le gabarit, et c'est le gabarit qu'on garde.

### Un seul bouton, jamais deux

Chaque `Player` possède son propre élément `audio` et **il n'existe aucun registre global** — la
pause n'a lieu qu'au démontage. Deux boutons côte à côte, deux taps, et deux voix parlent en même
temps.

Le libellé suit donc la vue active. La `key` de `<Listen>` sérialise le corps de la requête, donc
`pour` en fait partie, donc changer de vue **coupe** l'audio en cours au lieu de le superposer —
sans une ligne de plus.

Une pastille de **membre** laisse le libellé sur « la maison » : la route ne connaît que deux
portées, on n'en fabrique pas une troisième pour un filtre visuel, et surtout **on ne laisse pas
le libellé mentir** sur ce qui va être prononcé.

### Le mensonge existant, corrigé au passage

`/aujourdhui` affichait **« Écouter ma journée »** en lisant l'agenda de **toute la maison**. Ce
que D36 interdit à l'écrit — faire dire à la voix autre chose que ce qui est autorisé — n'a
aucune raison d'être toléré sur un libellé. Il dit maintenant « la journée de la maison », ce que
la grille en dessous montre.

## D49 — Deux chemins vers un événement, et le choix est explicite

**Ajout au périmètre du 5 août 2026** — « quand on clique sur le "+", avant d'ouvrir la feuille,
il faut un mini-menu avec "dire à l'oral" ou "remplir à la main" ». `PLAN.md` gagne un
**§13 quater**.

### Pourquoi ce n'est pas un confort

Le « + » ouvrait le formulaire directement. Casa AI sait créer à la voix depuis la phase 9 (D22,
D41) — mais il fallait le savoir, aller dans l'onglet IA, et deviner qu'on pouvait le lui
demander. **Une capacité qu'on ne découvre pas est une capacité qu'on n'a pas.** Le produit
portait deux façons de créer un événement et n'en montrait qu'une.

### Le micro ne démarre pas tout seul, et les deux raisons diffèrent

**Dans la feuille**, un tap serait pourtant un geste utilisateur parfaitement valide. Mais ce qui
est dicté doit ensuite être transcrit, compris, résolu, transformé en aperçu, puis validé — et
toute cette mécanique vit dans `CasaChat` (D41 : *un aperçu se valide là où il s'affiche*). La
recopier ferait **deux chemins d'écriture à tenir d'accord**, exactement ce que JON-66 a coûté à
l'`UndoBar`.

**À l'arrivée sur `/ia`**, c'est structurel : **Safari iOS n'accorde `getUserMedia` que dans la
foulée immédiate d'un geste**, et une navigation n'en est pas un. Un démarrage automatique
échouerait **en silence** sur le seul navigateur de la maison. La page d'arrivée fait donc
ressortir le micro, et c'est la personne qui appuie.

### Ce qui ne pose pas le choix

Le tap sur un créneau vide de la grille et le bouton de l'état vide ouvrent le formulaire
**directement** : on y a déjà désigné une heure, et redemander « à l'oral ou à la main ? » à ce
moment-là serait une question de trop. **Seul le « + », qui ne désigne rien, pose le choix.**

Et il le pose sur les deux écrans : le même bouton avec deux comportements serait le premier
défaut signalé à la recette suivante.

## D50 — Une participation appartient à celui qui la vit

**Ajout au périmètre du 5 août 2026** — « pour chaque événement, il faut pouvoir le rejoindre ou
se retirer facilement, **sans demander la permission** ». `PLAN.md` gagne un **§16 bis**.

### La demande révélait autre chose que ce qu'elle disait

**Le droit existait déjà. C'est le geste qui manquait.**

Depuis D21, seul le créateur modifie ou supprime un événement — mais *tout le monde répond*, et
`actions/events.ts` le dit noir sur blanc en passant `ownerOnly: false` à `refusalFor` : « D21
retire aux autres le droit de *modifier* l'événement, pas celui de dire s'ils viennent — sinon on
n'invite plus personne, on décrète. »

La RLS l'autorisait, l'`upsert` l'autorisait, la Server Action l'autorisait. Ça se faisait
seulement **à trois taps**, enterré dans la feuille de détail.

C'est ce qui a changé ce qu'on a construit : **remonter un geste, pas ouvrir un droit.** Toucher
à la règle de propriété aurait été une régression sur une décision qui est bonne — et c'est le
genre d'erreur qu'on commet en lisant une demande au pied de la lettre.

### La règle de propriété gagne son quatrième volet

> Un **événement** appartient à qui l'organise (D21).
> Un **lieu**, une **catégorie** — ce qui sert à décrire — appartient à la **maison** (D20, D29,
> D45).
> Une **préférence** appartient à celui qui la subit (D27, D37).
> **Une participation appartient à celui qui la vit** (D50).

C'est le pendant exact de D21 : on ne modifie pas l'événement d'un autre, mais on n'a besoin de
la permission de personne pour dire si on y va.

### L'exception, et elle n'est pas négociable

**Pas sur un événement importé de Google.** Répondre « pas dispo » à son propre rendez-vous le
ferait disparaître de la grille **et** libérerait le créneau pour toute la maison — alors que le
rendez-vous, lui, tient toujours. On organiserait un apéro pendant le dentiste de quelqu'un.
C'est déjà ce que `refusalFor` garantit ; l'écran ne fait que cesser de proposer le geste.

## D51 — Un contrôle de dates charge le vrai code, par un crochet d'alias plutôt que par `jiti`

**JON-69, le 25 août 2026.** Ce n'est pas un ajout au périmètre : la famille ne verra rien
changer. C'est le contrôle qui empêche la **dixième** occurrence du défaut de JON-60 — neuf sites
qui comptaient un jour en 24 h fixes et une semaine en 168 h.

`PLAN.md` ne bouge donc pas, et le tableau des ajouts d'`AGENTS.md` non plus.

### Pourquoi il fallait charger `lib/calendar/layout.ts`, et pourquoi ça coinçait

Le site dont le défaut se voyait le plus est `clampToDay` : il comptait les minutes *écoulées*
depuis minuit alors que la grille est graduée en heures *d'horloge*. Un rendez-vous de 23h30 était
dessiné à « 22h30 » le 29 mars, et **sous le bas de la grille** le 25 octobre — donc nulle part.

Or `verify:ai` n'importe que `lib/calendar/visible.ts` et `lib/ai/untrusted.ts`, les deux seuls
modules qui n'importent rien d'autre. `layout.ts`, lui, écrit `import { casaDate } from
"@/lib/date"` — et `@/` est une convention de `tsconfig.json`, que Node ne lit pas. Trois issues
étaient sur la table : déclarer `jiti`, écrire un résolveur, ou se contenter de `lib/date.ts`. La
troisième était écartée d'avance : elle laissait dehors exactement le site qui comptait.

### Le crochet, et pourquoi pas `jiti`

`jiti` aurait fait le travail sans une ligne à écrire, et il est déjà là en dépendance
transitive de Next et de Tailwind. Ce qui a tranché n'est pas le coût, c'est le **nombre de
mécanismes** :

- `verify-ai.mjs` charge déjà du TypeScript **nativement**. Ajouter `jiti` aurait créé une
  **seconde** façon de faire la même chose dans le même dossier — et deux mécanismes pour un
  seul travail finissent toujours par diverger, comme deux copies d'une règle ;
- ce qui manquait n'était pas la transpilation, c'était **l'alias**. Node 24 efface les types
  tout seul ; il ne sait simplement pas où pointe `@/`. Répondre par un transpileur entier à un
  problème de résolution de chemin, c'est répondre à côté ;
- et ce qui s'exécute reste alors le **module de production**, dépouillé par Node, jamais réécrit
  par un tiers.

`scripts/alias-hook.mjs` fait donc trente lignes autour de `registerHooks`, et **lit
`tsconfig.json` au lieu de le recopier**. C'était la seule objection sérieuse à cette solution :
un résolveur qui porterait `"@/" → "./"` en dur aurait fini par affirmer le contraire du projet
sans que rien ne le signale. Le jour où `paths` gagne une entrée, le crochet la connaît.

**Le premier jet retirait les commentaires du `tsconfig.json` avec deux `replace` d'une ligne.**
Il a mangé le `/*` de `"**/*.ts"`, au milieu du tableau `include`, et rendu un fichier illisible :
le contrôle tombait avant d'avoir contrôlé quoi que ce soit. Trouvé en l'exécutant. Une relecture
ne l'aurait pas vu.

### Trois règles d'écriture, et la deuxième est la vraie trouvaille

**Les instants sont écrits en UTC, jamais avec `setHours`.** Le premier jet posait l'heure avec
`date.setHours(23, 30)`, qui lit le fuseau de la **machine**. Sur le poste où il a été écrit —
`America/New_York` — « 23h30 » devenait 05h30 à Paris : le contrôle mesurait le portable au lieu
de mesurer le code, et aurait donné un autre verdict en CI. C'est le pendant exact du piège
d'environnement de `.env.local` : *ce qui entoure le code prime sur ce que le code croit dire.*

**Chaque cas porte la forme fautive à côté de la bonne, et exige qu'elles divergent.** `AGENTS.md`
demande de casser un contrôle après l'avoir écrit ; ici, le contrôle **le vérifie lui-même, à
chaque exécution**. Un cas qui cesserait de discriminer — parce qu'on a déplacé une date ou
arrondi une heure — tombe, au lieu de rester vert pour rien. C'est précisément ce qui était arrivé
au banc de JON-60, réglé sur midi : vert **avant comme après** la correction.

Il fallait pour ça trouver les instants qui départagent, et ils ne sont pas là où l'intuition les
place. Les navigations de semaine ne divergent qu'à **une heure près de minuit un lundi** (19
octobre 00h30, 30 mars 00h30) ; le balayage de sept jours, lui, ne diverge qu'en **fin de
soirée** — et les deux écritures fautives ne se trompent même pas le même jour : `minuit + i × 24 h`
répète le 25 octobre à toute heure, `now + i × 24 h` ne saute le 29 mars qu'après 23 h.

**On compare les jours eux-mêmes, pas leur nombre.** Sauter le 29 mars laisse quand même sept
clés distinctes : la fenêtre glisse d'un cran au lieu de se répéter.

### Ce que l'écriture du contrôle a rapporté

**Un dixième site, exactement là où le ticket l'annonçait.** `/api/ia/voix/briefing` bornait son
horizon à `HORIZON_DAYS * 86 400 000` : 400 jours d'horloge n'en font pas 400 × 24, et le jour
situé pile à l'horizon se voyait refuser un briefing que la borne était censée autoriser. Corrigé
dans le même commit.

**Et le balayage de `/casa` a déménagé dans `lib/date.ts`** (`casaDays`). Tant qu'il était écrit
dans le corps de la page, aucun contrôle ne pouvait l'appeler sans tirer toute la lecture de la
base derrière lui — un contrôle qui aurait recopié la boucle serait resté vert quand on modifie
la page, c'est-à-dire n'aurait rien prouvé. Même précédent que `weekAnchor` en JON-60.

### Fini quand — et ça l'est

`npm run verify:dates` : **11 contrôles**, sans base ni secret, en CI entre « Confidentialité de
Casa AI » et « Build ». Et il a été **cassé six fois exprès**, dont le sabotage exigé par le
ticket — remettre `dayStartMs + 24 * 60 * 60_000` dans `clampToDay` fait tomber **quatre**
contrôles à la fois, y compris celui de forme.

## D52 — Le push d'abord, l'email en relais, et jamais les deux

**JON-47, tranché avec le commanditaire le 25 août 2026.** §66 bis posait la contrainte sans
donner la règle : « ne remplace pas les emails… mais le même événement ne doit pas produire les
deux — sinon on coupe les deux ». Le ticket laissait explicitement la question ouverte : *un
réglage par canal, ou un par type de message ?*

### Deux interrupteurs, et le push passe devant

`wants_push` et `wants_digests`, côte à côte dans `/moi`. À l'envoi : **si la personne est abonnée
et n'a pas coupé, on pousse et l'email ne part pas** ; sinon l'email prend le relais.

Les deux autres options ont été écartées, et pour des raisons différentes :

- **un seul réglage, le canal déduit** était le plus simple à comprendre — un interrupteur. Mais
  quelqu'un dont les notifications sont coupées au niveau du système ne recevrait plus rien, et
  ne comprendrait pas pourquoi. Le canal de secours doit exister *et* se voir ;
- **un réglage par type de message** (invitation / résumé / rappel) est ce que demandent les gens
  qui aiment régler. Ça fait six interrupteurs sur `/moi`, pour un produit qui vise « utilisable
  par une personne âgée ».

### La conséquence qui n'est pas symétrique

**Une réponse (« je viens », « pas dispo ») n'a pas de relais email.** L'invitation en a un —
c'est une action à mener, la rater a un coût. Une réponse est une information agréable : elle
mérite une notification si le téléphone est là, et le silence sinon. Un email par réponse
remplirait quatre boîtes à chaque événement, ce qui est exactement le zèle qui fait couper les
résumés du soir.

### Et le corollaire de confidentialité

Une notification s'affiche sur un **écran verrouillé** : sans déverrouiller le téléphone, sans
même le prendre en main, et devant qui se trouve à côté. C'est la surface la plus exposée du
produit — plus qu'un email, qui suppose d'ouvrir sa boîte. La règle de D13 s'y applique donc telle
quelle et sans exception, et `verify:ai` la garde (29 → **35 contrôles**), y compris par un
contrôle qui refuse qu'une Server Action accepte le texte à afficher : sinon n'importe qui
écrirait ce qu'il veut sur l'écran verrouillé de n'importe quel habitant.

## D53 — Le Web Push passe par une bibliothèque, contrairement à l'email

**Une exception assumée à l'habitude du projet**, qui écrit ses intégrations à la main : Resend est
un `POST` sur une URL, et `lib/email/send.ts` tient en une page sans SDK.

**Le Web Push n'est pas un POST.** La charge utile est chiffrée de bout en bout pour le navigateur
(ECDH P-256, HKDF, AES-128-GCM — RFC 8291) et l'appel est signé par un jeton VAPID (RFC 8292).
Node a toutes les primitives, et c'est précisément le piège : le code *aurait l'air* de marcher.

Ce qui a tranché est le **mode de panne**. Une erreur de chiffrement ne produit pas une exception :
elle produit une charge que le service de push **accepte** — il ne peut pas la lire, il ne fait que
la relayer — et que le navigateur ne sait pas déchiffrer. Rien n'échoue, rien n'arrive, et rien ne
le dit. C'est le profil de défaut le plus coûteux de ce projet, écrit à la main dans du code
cryptographique, pour un agenda familial.

`web-push` (3.6.7) est donc en dépendance directe. Il est **serveur uniquement** : rien n'entre
dans le bundle du navigateur, et `lib/push/send.ts` porte `server-only`.

À noter, sans rapport : l'installation a révélé **quatre vulnérabilités `high` préexistantes**,
toutes transitives de `next@16.2.12` (`postcss`, `sharp`, `nanoid`). Aucune ne vient de
`web-push`. Elles se jouent à la construction, pas sur une requête d'habitant —
[JON-77](https://linear.app/jonathan-naal/issue/JON-77).

## D54 — Un rappel « juste avant » ne peut pas venir de Vercel Cron

**Décidé le 25 août 2026 avec le commanditaire. Pas encore implémenté** — cette décision est
écrite maintenant pour qu'elle ne se reprenne pas de zéro.

§66 bis demande « un rappel juste avant un événement ». Or **le plan Hobby de Vercel plafonne les
crons à une exécution par jour** (aujourd'hui `0 18 * * *`, soit 20 h à Paris). Un rappel à
l'heure est donc structurellement impossible avec l'ordonnanceur du projet.

Trois issues ont été posées. La retenue : **un workflow GitHub Actions planifié toutes les quinze
minutes frappe `/api/cron/…` avec le secret partagé.** Vercel ne plafonne que *ses* crons, pas les
appels entrants ; le dépôt a déjà des Actions ; et ça ne coûte rien.

Les deux autres :

- **livrer un rappel du matin** au lieu de « juste avant » — zéro dépendance, mais ce n'est pas ce
  que le chapitre décrit, et ç'aurait été un écart à consigner plutôt qu'une livraison ;
- **passer Vercel en Pro** (~20 $/mois) — propre et sans réserve, mais un abonnement pour un
  agenda de quatre personnes. Réserve cette option au jour où le plan Pro se justifie par
  ailleurs : il débloquerait aussi le branching Supabase qui manquait en phase 10 (D45).

**Deux réserves à connaître avant d'écrire le workflow**, et elles sont honnêtes :

1. **les workflows planifiés de GitHub sont « au mieux »** et peuvent glisser de plusieurs minutes
   sous charge. Un rappel annoncé « dans 30 min » doit donc tolérer un retard, et le dire ;
2. **ils se désactivent après 60 jours sans activité sur le dépôt.** Sur un projet familial qui
   peut dormir un été, c'est un mode de panne réel — et silencieux, comme le cron de la phase 4.
   Le contrôle qui manque n'est pas dans le workflow : c'est de savoir que les rappels ont cessé.

---

## D55 — Le mode d'emploi d'installation vient à la personne, il ne l'attend pas

**Correction d'une décision de forme, prise le 26 août 2026 avec le commanditaire.** Ce n'est
**pas** un ajout au périmètre : `PLAN.md` §65 demande déjà l'invitation à installer, et
`docs/PLAN.md` ne devient faux nulle part. Ce qui change, c'est *comment* elle se présente — d'où
une décision neuve plutôt qu'une section `bis`.

**Ce qu'on avait fait, et pourquoi ça ne suffisait pas.** JON-18 avait livré un bandeau discret en
haut d'`/aujourd'hui`, à partir de la deuxième ouverture, renvoyant vers une page `/installer`. Le
raisonnement était défendable — « la place d'un mode d'emploi n'est pas au-dessus de l'agenda
qu'on venait consulter ». Il supposait surtout qu'on ait **envie d'aller voir**, et c'est
précisément ce qu'on ne fait pas quand on est venu pour autre chose.

Le commanditaire a tranché en désignant un précédent qui marche, `plania-communaute` : **une popup
qui s'ouvre d'elle-même** sur la version web non installée, avec les tutoriels et des
démonstrations filmées.

**Pourquoi cette insistance se justifie ici et nulle part ailleurs dans le produit.** Sur iPhone,
le Web Push n'existe **que** pour une PWA installée (D30). L'installation n'est donc pas un
confort qu'on propose poliment : c'est la porte d'entrée de tout ce que la phase 11 apporte. Une
famille qui n'installe pas ne recevra jamais une invitation sur son téléphone, et ne saura jamais
pourquoi. C'est le seul endroit du produit où couper la lecture de l'agenda se paie moins cher que
de laisser passer.

**Les garde-fous, parce qu'une popup est vite une nuisance :**

- **jamais si l'app est déjà installée** — reproposer ce qui est fait est le premier réflexe qui
  détruit la confiance ;
- **un « plus tard » vaut quinze jours, et vaut pour les deux surfaces.** `installReportee()` vit
  dans `lib/pwa.ts` et décide pour la popup **et** le bandeau : sans ça, fermer la popup ferait
  surgir le bandeau dessous, et on aurait l'air de n'avoir pas écouté. Même leçon que `weekAnchor`
  (JON-60) et `gridBounds` (JON-75) — quand deux endroits ont besoin du même calcul, ils appellent
  la même fonction ;
- **elle laisse voir l'agenda 2,6 s d'abord.** Demander avant d'avoir rendu le moindre service,
  c'est se faire refuser ;
- **deux sorties, et la première est en haut.** Le guide fait 1 944 px dans la popup : n'offrir le
  « Plus tard » qu'en bas obligerait à dérouler tout le mode d'emploi pour le refuser — sans Échap
  sur un téléphone, et avec 8 % de hauteur de fond où taper. Croix collante en haut (48×48) et
  bouton écrit en bas.

**Les films ne sont pas recopiés de Plania.** Ceux-ci portent « Communauté Plania » et
`communaute.plania.ai` en toutes lettres : les servir à la famille montrerait le nom et l'adresse
d'une autre app, ce qui est exactement le doute qu'un mode d'emploi doit lever. Les trois
emplacements se sont d'abord posés **vides**, s'effaçant tant que le fichier n'existait pas — la
structure livrée d'un côté, les films de l'autre.

**Ils ont été tournés le jour même**, avec **HyperFrames** (composition HTML + GSAP → MP4) depuis
`C:\dev\motion-video-claude\projects\pwa-onboarding-casa-liva\` : la structure de
`pwa-onboarding-plania`, la palette de Casa Liva, et deux écarts assumés. **Le film iPhone montre
le défilement de la feuille de partage**, lentement — celui de Plania ouvrait la feuille avec la
bonne ligne déjà visible, alors que c'est *précisément* l'étape qui bloque. Et **pas de
mascotte** : Plania a un robot, Casa Liva a une icône de maison, et c'est elle qu'on cherchera des
yeux sur son écran d'accueil.

Trois défauts s'y sont trouvés, et aucun en relisant le code : **six échecs de contraste AA**
relevés par `hyperframes check` (le terracotta sur crème donne 2,87:1 quand le grand texte exige
3:1 — la règle d'`AGENTS.md` vaut aussi hors du code) ; **GSAP qui écrase le `transform` CSS en
entier**, ce qui aurait décentré la tuile dès la première tween sur `y` ; et des `<span>` restés
en ligne, qui collaient « Cinéma18:00 ». Le dernier est invisible dans le CSS et évident sur une
image extraite du MP4 — **c'est l'image qu'il fallait regarder, pas la feuille de style.**

**Et cette absence gracieuse a coûté trois défauts, tous invisibles à la relecture :**

1. `src` doit être sur `<video>`, **jamais** sur un `<source>` enfant : l'`error` d'un `<source>`
   ne remonte pas au parent ;
2. `onError` seul ne suffit pas — l'erreur part **avant l'hydratation**, le gestionnaire arrive
   après la bataille. Mesuré : trois lecteurs de 398 px de noir sur `/installer`. C'est le piège de
   `beforeinstallprompt`, une troisième fois ; la parade est la même, **lire l'état plutôt
   qu'attendre l'événement** ;
3. et le premier jet de cette parade **ne discriminait pas**. La condition portait aussi sur
   `NETWORK_NO_SOURCE`, vrai transitoirement avant le début du chargement : le lecteur
   disparaissait **toujours**, y compris avec un vrai `.mp4` déposé — vert pour une mauvaise
   raison, et le jour où les films existeraient, ils n'auraient jamais paru. Trouvé en déposant le
   fichier au lieu de faire confiance au seul cas « absent ».

**Le quatrième défaut n'était pas dans le composant, et c'est le plus grave** : `public/videos/`
n'était pas exclu du matcher de `proxy.ts`. Les `.mp4` prenaient un `307` vers `/connexion` et le
navigateur recevait une page HTML en guise de vidéo. C'est la panne de `sw.js` (JON-19), du cron de
la phase 4 et du désabonnement de la phase 6, **une quatrième fois**. Le piège y était pire
qu'ailleurs : `.jpg` était exclu et pas `.mp4`, donc l'affiche se serait affichée et la vidéo
jamais — pendant que le guide masque le lecteur exactement comme pour un fichier absent. **Rien
n'aurait signalé** que les films tournés ne s'ouvraient pas.

---

## D56 — Le délai de rappel appartient à l'événement, pas à celui qui le reçoit

**Décidé le 26 août 2026 avec le commanditaire**, et ça mérite d'être écrit parce que ça
**ressemble** à une entorse à la règle des propriétaires.

La règle d'`AGENTS.md` dit : *une préférence — la voix qu'on entend, les résumés qu'on reçoit —
appartient à celui qui la subit.* Un délai choisi par l'organisateur et imposé aux invités a
donc l'air de la contredire. J'avais d'ailleurs posé la question dans l'autre sens, en proposant
une préférence par personne dans `/moi`.

**Le commanditaire a tranché autrement, et il a raison.** Un délai de rappel **n'est pas une
préférence** : c'est une **propriété de l'événement**, au même titre que l'heure et le lieu. Un
train ne se prépare pas comme un cinéma — et ça n'est pas vrai « pour l'organisateur », c'est vrai
pour tous ceux qui y vont. Le régler par personne aurait produit l'absurdité inverse : quelqu'un
réglé sur « 15 min » arriverait systématiquement en retard au train de toute la maison, et
personne n'aurait rien fait de mal.

Il appartient donc à qui organise (D21), comme le reste de l'événement. **Ce qui reste à chacun
est la vraie préférence** : `wants_push` (0016). On ne choisit pas *quand* on est prévenu d'un
train qui n'est pas le sien ; on choisit **si** on est prévenu. Les deux règles tiennent ensemble,
et la seconde n'a pas bougé d'un pouce.

**Qui reçoit : chaque participant, plus l'organisateur.** Un rappel n'est pas une invitation — la
décision d'y aller est déjà prise — et celui qui a proposé quelque chose a autant besoin qu'un
autre de ne pas l'oublier. Deux exclusions seulement : qui a **décliné** (rappeler un rendez-vous
auquel on a dit non n'informe de rien), et qui a **coupé `wants_push`**.

### La colonne qui s'invalide toute seule

`rappel_envoye_pour` porte le **`start_at` pour lequel** le rappel est parti, et non un booléen
« déjà envoyé ». La différence n'est pas cosmétique.

Avec un booléen, il aurait fallu penser à le remettre à zéro **partout** où un événement est
déplacé : les Server Actions, l'aperçu de Casa AI, la synchronisation Google. Un seul chemin
oublié, et le rappel d'un rendez-vous repoussé de trois heures ne serait **jamais** parti — sans
erreur, sans trace, et découvert par quelqu'un qui a raté quelque chose.

En rangeant la date, l'invalidation est **structurelle** : l'heure change, la valeur cesse de
correspondre, le rappel repart. Aucun code à tenir à jour. C'est la même idée que la clé de cache
du briefing qui porte sa portée (D48) — *ce dont dépend un résultat doit entrer dans ce qui
l'identifie.*

Le `tag` de la notification, lui, empêche l'empilement **à l'écran** et ne remplace rien : deux
envois arriveraient quand même, sur deux appareils, et compteraient deux fois.

### Le délai annoncé est celui qu'on constate, jamais celui qu'on visait

Le planificateur est un workflow GitHub Actions, et ceux-là sont « au mieux » (D54). Recopier
`rappel_minutes` dans le texte produirait « dans 30 min » sur un rappel parti avec vingt minutes
de retard. **Une notification qui ment une fois fait douter de toutes les suivantes** —
`minutesRestantes` recalcule, et l'heure de début est écrite juste en dessous, elle qui ne dérive
jamais.

### Pas d'email de rappel, et c'est un choix

D52 dit « le push d'abord, l'email en relais, jamais les deux ». Pour l'invitation et la réponse,
l'email existe et prend le relais. Ici il n'y a **rien à relayer** : un rappel « dans 30 minutes »
arrivé par email serait lu après coup. Le canal du rappel est le téléphone, ou rien.

### Le contrôle, parce que personne ne regarde

`npm run verify:rappels` (7 contrôles, en CI, sans base ni secret) charge **le vrai module** —
`rappelDu`, celle qui décide en production. Il existe pour une raison précise : **ce balayage
s'exécute sans personne devant**, toutes les quinze minutes. Un défaut n'y rend pas d'erreur, il
rend un rappel de trop, un rappel manquant, ou rien — et le premier à s'en apercevoir serait
quelqu'un qui a raté son train.

Chaque cas porte **la forme fautive à côté de la bonne et exige qu'elles divergent**, comme dans
`verify:dates`. Cassé exprès deux fois : traiter `rappel_envoye_pour` comme un booléen fait tomber
deux contrôles ; rendre stricte la borne du délai en fait tomber un.

### La limite assumée : deux heures

La liste s'arrête à deux heures. Au-delà d'une journée, soustraire des minutes cesse d'être
juste — deux fois par an un « jour » fait 23 ou 25 heures d'horloge (D51). « La veille au soir »,
si c'est demandé, ne sera **pas** une valeur de plus dans cette liste : c'est un autre calcul (une
heure fixe la veille, pas un décalage), et le mélanger ferait exactement le raccourci que JON-60 a
payé.

---

## D57 — La popup d'installation redevient un CTA, après essai sur un vrai téléphone

**Corrige D55, deux heures après l'avoir écrite.** C'est la recette humaine qui fonctionne, pas un
raté : le commanditaire a demandé une popup le matin, l'a essayée sur son iPhone l'après-midi, et
l'a jugée **« trop agressive »**. Un panneau qui monte du bas et couvre l'écran d'un mode d'emploi
non sollicité, quand on venait consulter l'agenda.

**Ce que D55 avait raison de dire, et qui ne change pas :** sur iPhone, le Web Push n'existe que
pour une PWA installée (D30), donc l'installation est la porte d'entrée de toute la phase 11. Il
fallait la rendre plus visible qu'un lien discret.

**Ce que D55 a mal tranché :** de *plus visible* on a conclu *plus insistant*. Or l'insistance ne
se paie pas en attention, elle se paie en **irritation** — et un mode d'emploi imposé à quelqu'un
qui ne l'a pas demandé est précisément ce que ce produit dit ne pas vouloir être.

**La forme retenue est celle qu'on avait au départ**, et le commanditaire l'a nommée : *« ça doit
juste être un CTA qui ouvre la page `/installer` »*. Le bandeau d'`/aujourd'hui`, en `position:
static` — **dans le flux de la page, jamais une couche par-dessus** — qui propose et n'exige rien.

**Une seule chose change par rapport à l'état d'avant D55 :** le bandeau apparaît dès la
**première** ouverture, au lieu d'attendre la deuxième. Le raisonnement d'origine — « ne rien
demander à quelqu'un qui n'a encore rien vu » — tenait tant qu'une popup atteignait les gens plus
tôt. Ce bandeau étant désormais la **seule** surface d'invitation, garder l'attente reviendrait à
retirer la popup **et** sa portée, alors que seule la première a été demandée.

**Les trois films restent, et c'est tout l'intérêt.** Ils vivent sur `/installer`, où l'on arrive
en tapant le CTA — c'est-à-dire en l'ayant voulu. Le travail de D55 n'est pas perdu : il a
seulement cessé d'être imposé.

**Ce que cet aller-retour enseigne, et qui vaut au-delà.** Rien dans `verify:ai`, `verify:rls`,
`verify:dates`, `verify:rappels`, ni dans un navigateur de contrôle ne pouvait dire « ce panneau
est trop agressif ». Le contrôle qui l'a attrapé est un œil sur un vrai téléphone, en une minute.
C'est exactement ce que JON-68 décrit, et c'est la deuxième fois de la journée que ça paie — après
le « 404 » de `/installer`, qui n'en était pas un.

---

## D58 — « Tout le monde est libre » quitte les écrans qu'on ouvre pour lire

**Retiré le 26 août 2026, sur demande du commanditaire**, après essai sur son téléphone. **En deux
temps** : d'abord `/semaine`, puis `/aujourd'hui` dans la foulée — je lui avais signalé que la
bande y existait aussi, sous une autre forme, et il a tranché pareil.

`PLAN.md` **ne devient faux nulle part**, et c'est ce qui range cette décision du côté des
corrections plutôt que des retraits de périmètre : la bande sur la semaine n'était pas au cahier
des charges. Elle est arrivée avec la refonte de `/semaine` (D46), où elle avait déjà fallu être
bridée — sans quoi elle s'affichait les sept jours d'affilée sur une maison peu chargée. **Une
fonctionnalité qu'il faut brider deux fois pour qu'elle cesse de gêner est une fonctionnalité qui
n'est pas à sa place.**

**Là où elle reste, et pourquoi c'est cohérent :**

- **`/casa`** — « ✨ Opportunité Casa » : on y va pour regarder la maison, pas son propre agenda ;
- **`/casa/trouver`** — « Qui est libre le … ? » (§22, §22 bis), qui existe pour ça et rien d'autre.

Les deux ont en commun d'être des écrans où **on est allé chercher un créneau**. `/semaine` et
`/aujourd'hui` sont ceux où l'on vient **lire ce qui est prévu** (D46) — une proposition non
sollicitée y occupe la place de ce qu'on est venu voir. C'est la même erreur de registre que la
popup de D57, commise le même jour sur d'autres écrans, et corrigée par le même œil.

**La ligne qui s'en dégage, et qui tranchera les cas suivants :** un créneau libre se **cherche**,
il ne se **propose** pas. Les deux écrans qui le proposaient sont ceux qu'on ouvre par défaut ;
c'est ce qui rendait la proposition intrusive plutôt qu'utile.

`everyoneFreeToday` n'est **pas** supprimée : deux appelants légitimes la gardent vivante — `/casa`
et le moteur de disponibilité de `lib/data/availability.ts`, qui sert `/casa/trouver` et Casa AI.

---

## D59 — Un compte ne naît que pour une adresse invitée

**Décidé le 26 août 2026 avec le commanditaire**, après qu'il a demandé qui était
`inconnu.a@exemple.com` — un compte que personne de la maison ne reconnaissait.

**Ce n'était pas une fuite, et il fallait le dire d'abord.** Cette personne était dans une **autre
maison**, seule, avec zéro événement, zéro connexion Google, zéro conversation. La RLS cloisonne
par maison : elle n'a jamais pu voir l'agenda de la maison. Ce n'était pas non plus le bug de D17 —
quelqu'un qui s'inscrit seul reçoit sa propre maison, c'est voulu.

**Le vrai défaut était ailleurs, et plus large :** `signInWithOtp` était appelé avec
`shouldCreateUser: true` sans aucune condition. **Toute personne au monde tapant une adresse sur
`casaliva.app` repartait avec un compte.** La vérification a d'ailleurs sorti un **second**
inconnu, jamais visible dans l'app : `inconnu.b@exemple.com`, créé le matin même du signalement,
adresse jamais confirmée. Le profil d'un balayage automatique, pas d'un voisin curieux.

Le coût n'était pas la confidentialité mais **le domaine** : chaque inscription envoie un email
depuis l'adresse vérifiée de la famille — celle qui porte les invitations et les résumés (JON-36).
Un domaine qui écrit à des gens qui n'ont rien demandé finit signalé.

### On lit l'invitation, pas une liste d'adresses

Une liste en dur aurait fermé la porte aussi bien. Elle aurait aussi obligé à **déployer pour
inviter sa mère**. L'invitation existe déjà, elle porte l'adresse, elle expire, elle se consomme :
c'est la même autorisation, mais qui se donne depuis l'app.

**Et l'adresse saisie doit être celle qui a été invitée** — pas seulement « une invitation existe
quelque part ». Sans ça, un lien d'invitation transféré dans un SMS laisserait créer n'importe
quel compte. Le jeton est un secret ; un secret qui voyage par SMS voyage mal.

En cas de panne de lecture, `invitationOuvertePour` rend `false`, donc **refuse**. Un contrôle
d'accès qui s'ouvre quand la base tousse n'est pas un contrôle d'accès.

### Une adresse inconnue rend le même écran qu'une adresse connue

Afficher le refus de Supabase ferait de cette page un **annuaire** : on taperait des adresses une
à une pour apprendre lesquelles ont un compte ici. **Une porte qu'on vient de fermer ne doit pas
devenir une fenêtre.**

Contrepartie assumée, et elle est réelle : quelqu'un qui se trompe d'une lettre attendrait un lien
qui ne partira jamais. L'écran de confirmation le dit désormais — « Casa Liva n'écrit qu'aux
habitants et aux personnes invitées » — et **la phrase est la même pour tout le monde**, donc elle
ne renseigne personne.

### Ce qui a été vérifié avant de basculer, et pourquoi c'était obligatoire

`shouldCreateUser` ne décide que de la **création** : un compte qui existe reçoit son lien quoi
qu'il arrive. Toute la manœuvre repose là-dessus — se tromper aurait **enfermé la famille
dehors**. Essayé sur la Preview, jamais en production, avec trois cas qui **discriminent** :

| Essai | Adresse | Attendu | Obtenu |
|---|---|---|---|
| A | inconnue, sans invitation | refus, aucun compte | `422 Signups not allowed` · 6 → 6 |
| B | **habitant existant** | lien envoyé | aucune erreur au journal |
| C | **invitée** | compte créé | 6 → 7, à 17:02:52 |

Données de test retirées ensuite : 6 comptes, 5 habitants, 0 reste.

**L'écran ne pouvait pas servir de contrôle** — A et B rendent volontairement le même. Ce sont les
**journaux** qui tranchent, et c'est une leçon générale : quand on efface une différence
observable par conception, le contrôle doit aller la chercher là où elle subsiste.

### Un premier jet qui rouvrait la fenêtre qu'il fermait

Le filtre de détection du refus exigeait un `400`. Supabase rend **`422`**. L'écran affichait donc
« L'envoi a échoué » pour une adresse inconnue et « Regarde tes emails » pour une connue :
exactement la différence observable qu'on venait de supprimer. **La protection marchait, c'est
l'habillage qui trahissait.** Trouvé sur la Preview, pas en relisant — et c'est précisément
pourquoi ce changement ne devait pas partir en production sans essai.

### Ce qui n'est pas fait

Les deux comptes inconnus **existent toujours**. `inconnu.b@exemple.com` n'a jamais confirmé son
adresse et ne peut rien faire ; `inconnu.a@exemple.com` a une maison vide. Les supprimer touche
`auth.users` et ses dépendances : ça mérite sa propre précaution, une fois la porte fermée.

---

## D60 — Le DNS vit chez Cloudflare, et le nuage reste gris

**Décision du commanditaire, 27 août 2026.** Le DNS autoritaire de `casaliva.app` passe de Vercel
DNS à **Cloudflare** (plan Free, `aragorn`/`hazel.ns.cloudflare.com`). Vercel reste **registrar**
*et* **hébergeur** : seule l'autorité DNS change.

**Pourquoi.** Attio — où vit le CRM investisseurs — refuse une adresse personnelle et exige une
adresse de domaine. `casaliva.app` était déjà détenu ; **Cloudflare Email Routing** ouvre
`jonathan@casaliva.app` gratuitement, sans Google Workspace. Mais Email Routing exige que
Cloudflare gère la zone. Le DNS a donc bougé pour une raison qui n'a **rien à voir avec le
produit** — et c'est exactement ce qui rend cette décision digne d'être écrite : personne, dans six
mois, ne devinera qu'un besoin de CRM explique pourquoi les serveurs de noms ne sont plus ceux de
l'hébergeur.

### Ce n'est pas un ajout au périmètre

La famille ne voit aucune différence. `PLAN.md` ne nommait aucun fournisseur DNS et ne devient faux
nulle part : **il ne bouge pas**, et le tableau d'`AGENTS.md` ne gagne pas de ligne — il recense ce
qui se voit par la famille. Ce qui devenait faux, c'est `ETAT.md`, qui affirmait
`ns1`/`ns2.vercel-dns.com` et « le DNS se gère dans Vercel → Domains ». Corrigé dans le même
commit, comme le veut la règle des corrections.

### La vraie décision n'est pas « Cloudflare », c'est « DNS only »

L'apex et le wildcard sont des `CNAME` vers `5a92aaed4dd482c0.vercel-dns-017.com` et
`cname.vercel-dns-017.com`, en **nuage gris** — Cloudflare résout, il ne s'interpose pas. Le
commanditaire l'a choisi pour limiter le nombre de changements simultanés. **Il faut que ça le
reste**, et pour une raison propre à ce projet :

> Vercel est **déjà** un CDN. Le nuage orange poserait un second cache devant le sien — ce qui
> aggrave et prolonge le piège écrit dans `AGENTS.md` : *la première requête après un déploiement
> peut servir l'ancien bundle client avec le nouveau serveur.* Ce piège a déjà coûté un
> diagnostic le 4 août, avec **un seul** cache. Un rechargement suffisait ; avec deux couches, le
> symptôme survit au rechargement.

S'y ajoutent, dans le désordre : le plafond de **100 s** par requête du plan Free, un mode SSL à
régler impérativement en *Full (strict)* — et le HSTS de deux ans que sert déjà l'app
(`max-age=63072000`) rendrait une erreur de mode **non contournable** côté navigateur, sur tous les
téléphones qui ont déjà visité le site.

### Deux autres interdits, moins évidents

**Pas de DNSSEC.** Rien ici ne le demande, et il faudrait que le registrar Vercel accepte le DS.
Bénéfice nul, risque d'extinction du domaine bien réel.

**Un seul `v=spf1` à l'apex**, et **jamais** `include:amazonses.com` dedans. Email Routing posera le
sien ; deux enregistrements donnent un `permerror`. Le réflexe « ajoutons Amazon pour ne pas casser
Resend » serait un culte du cargo : Resend s'authentifie sur `send.casaliva.app` (Return-Path) et
par DKIM `resend._domainkey` — l'apex n'entre dans **aucun** des deux alignements DMARC. Vérifié le
jour même : `GET /domains` répond toujours `status: "verified"`.

### Ce que ça ne change pas, vérifié plutôt que supposé

Supabase (`kfiycbsussdqqtlzrwvn.supabase.co`, pas de domaine personnalisé), Google OAuth et la liste
blanche de redirection Supabase — qui raisonnent en **URL**, pas en DNS —, Vercel Cron, les Previews
`*.vercel.app`, et `appOrigin()` (`lib/url.ts`) qui lit `x-forwarded-host`. Les six mentions de
`casaliva.app` dans le code sont de la prose, sauf deux : l'expéditeur de `lib/email/send.ts` et le
sujet VAPID de `lib/push/send.ts` — et ce sont précisément les deux que la section suivante
concerne.

Et le détail qui ne se voit qu'à retardement : les **CAA** autorisent `letsencrypt.org` en `issue`
**et** `issuewild`. C'est ce qui garantit que Vercel renouvellera le certificat dans 90 jours — un
DNS mal migré ne tombe pas le jour même, il tombe au renouvellement.

### Ce que ça met au jour

`casaliva.app` n'a **aucun MX**. Personne ne reçoit sur `hello@casaliva.app` — d'où partent pourtant
toutes les invitations et tous les digests, et qui sert aussi de **sujet VAPID** par défaut
(`lib/push/send.ts`), c'est-à-dire l'adresse par laquelle Apple, Google ou Mozilla joindraient
l'émetteur si ses notifications posaient problème. Une réponse à une invitation disparaît sans
erreur nulle part.

Ce n'est pas causé par la migration — c'est vrai depuis la phase 6 — mais Email Routing rend la
réparation gratuite, et le mode d'échec va changer : un rejet propre au lieu d'un silence. C'est
[JON-84](https://linear.app/jonathan-naal/issue/JON-84), et le détail de la migration vit dans
[JON-83](https://linear.app/jonathan-naal/issue/JON-83).

### Mise à jour du 28 août — dont une chose affirmée à tort la veille

**La coquille du nameserver n'était pas sans conséquence, et le contrôle qui l'a déclarée telle ne
pouvait pas la voir.** `aragon.ns.cloudflare.com` avait bel et bien été saisi chez Vercel, à la
place d'`aragorn`. Cloudflare n'a donc jamais validé la zone, est resté sur *« Waiting for your
registrar to propagate your new nameservers »*, et a refusé Email Routing : *« This zone must be
active before you can enable Email Service. »* Un caractère. La correction chez Vercel a tout
débloqué d'un coup.

**Pourquoi la vérification du 27 août est passée au vert quand même**, et c'est la seule chose de
cette annotation qui mérite d'être sue par cœur :

> `nslookup -type=NS casaliva.app` interroge un résolveur récursif, qui répond avec **le jeu NS
> publié par la zone** — celui que Cloudflare sert, donc `aragorn` + `hazel`, toujours juste. Il ne
> répond **pas** avec la délégation détenue par le registre, qui était fausse à moitié. Et comme
> `hazel` répondait, la résolution marchait de bout en bout.

Le contrôle était donc **structurellement incapable d'échouer sur le défaut qu'il prétendait
écarter** — la forme exacte du piège que ce projet nomme « un contrôle qui ne discrimine pas ».
**Une délégation se vérifie au registre, jamais depuis la réponse de la zone.** Autrement dit : ce
qui prouve une délégation, c'est le serveur du TLD, ou le tableau de bord du fournisseur qui dit
« Active » — pas un `nslookup` qui a déjà trouvé la zone.

**L'apex n'est plus vide.** Email Routing y a posé ce qu'il fallait, et rien de plus : trois
`MX` (`route1`/`route2`/`route3.mx.cloudflare.net`), un DKIM à lui
(`cf2024-1._domainkey.casaliva.app`), et **un** `v=spf1`. La consigne ci-dessus a tenu : personne
n'y a glissé `include:amazonses.com`, et Resend répond toujours `status: "verified"`,
`sending: enabled` au 28 août. Les deux fonctions vivent désormais côte à côte sans se gêner —
**l'entrant à l'apex chez Cloudflare, le sortant sur `send.` chez Resend.**

**Le mode d'échec de `hello@` a basculé, comme annoncé.** Le catch-all est **désactivé** et seule
`jonathan@casaliva.app` existe. Une réponse à une invitation ne se perd donc plus en silence : elle
revient à son auteur en rejet. C'est mieux — un défaut visible vaut mieux qu'un défaut muet — mais
ça ne règle rien pour la famille, et **[JON-84](https://linear.app/jonathan-naal/issue/JON-84) reste
ouvert**. Créer `hello@` est une ligne dans un écran déjà ouvert.

**Et une limite à connaître avant de la découvrir.** Email Routing **reçoit et transfère** ; il
n'envoie pas. On ne peut pas répondre *depuis* `jonathan@casaliva.app` sans ajouter un SMTP ou une
vraie messagerie. Casa Liva n'en souffre pas — elle écrit par Resend — mais l'humain derrière
l'adresse, si.

*Réserve de méthode : les enregistrements ci-dessus viennent du rapport d'opérations et de la
console Cloudflare, pas d'une résolution faite ici — le réseau de la session du 28 août ne
résolvait ni `MX` ni `TXT`. Seul l'état Resend a pu être revérifié en direct.*
