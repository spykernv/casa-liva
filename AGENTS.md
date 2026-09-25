<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Casa Liva

Agenda familial privé, mobile-first.

**Nouvelle session : commencer par `docs/ETAT.md`** — où on en est, comment reprendre, et ce
qui est déjà préparé pour la phase suivante. Puis `docs/PLAN.md` (le cahier des charges) et
`docs/DECISIONS.md` (les écarts assumés). **Et le board Linear** — voir juste en dessous.

## Le suivi vit dans Linear

> https://linear.app/jonathan-naal/project/casa-liva-d7532c5615c9 · équipe `JON`

**Linear est la base de gestion du projet, pas une décoration.** Les fichiers de `docs/`
racontent *comment* et *pourquoi* ; Linear dit *où on en est* et *ce qui vient ensuite*. Les
deux doivent rester d'accord.

**À chaque session, sans exception :**

1. **Lire le board avant de coder.** Pas seulement `ETAT.md`. Un ticket peut avoir été ajouté,
   repriorisé ou fermé entre deux sessions — commencer sans le savoir, c'est refaire ou casser
   le travail de quelqu'un.
2. **Tout travail substantiel a son ticket.** S'il n'existe pas, le créer *avant* de commencer,
   avec son milestone. Un incrément livré sans trace est un incrément que personne ne retrouve.
3. **Fermer ce qui est fini, en disant ce qui a réellement été livré** — et surtout les écarts
   par rapport à ce que le ticket demandait. Un ticket fermé en silence sur un écart est une
   dette cachée.
4. **Créer un ticket pour ce qu'on découvre en chemin** : bug, action humaine requise, dette
   assumée. Enterrer une trouvaille dans un message de commit revient à la perdre.
5. **Ne jamais marquer `Done` ce qui n'a pas été vérifié.** « Ça compile » n'est pas « ça
   marche ». Si ça demande un essai humain, le ticket reste ouvert et dit précisément quoi
   essayer.

### Travailler en Scrum, et porter les deux casquettes

Les **milestones** sont les phases du plan ; les **issues** sont des incréments livrables,
chacun ayant une valeur pour la famille — pas des tâches techniques découpées au hasard.

En l'absence d'une équipe, l'agent tient les deux rôles, et doit les distinguer :

- **Product Owner** — garde la règle produit ci-dessous, priorise, refuse. C'est lui qui dit
  « ce ticket n'aide pas la famille à organiser quelque chose, on ne le fait pas », et qui
  ordonne ce qui reste par valeur réelle, pas par facilité d'implémentation.
- **Product Manager** — tient le board honnête : découpage, état, dépendances, ce qui bloque,
  ce qui attend une action humaine. C'est lui qui remarque qu'un ticket traîne en *In Progress*
  depuis trois sessions, ou qu'une phase est annoncée finie alors qu'un ticket reste ouvert.

Priorités : `Urgent` = bloque la phase en cours · `High` = dans la phase · `Medium`/`Low` =
après. Une phase ne se déclare terminée que lorsque ses tickets le sont **et** que
`docs/ETAT.md` le reflète.

## La recette humaine — le seul défaut qu'aucun contrôle n'attrape

**Depuis la phase 10, le commanditaire fait passer beaucoup de QA à la main** : padding,
responsivité, format UI, gestes déroutants. Ça atterrit dans
[JON-68](https://linear.app/jonathan-naal/issue/JON-68), qui dit comment signaler et comment
c'est traité.

Ce n'est pas un pis-aller. `verify:ai` et `verify:rls` gardent la confidentialité, les bancs
`jiti` gardent la logique, le navigateur de contrôle sait lire un DOM — **aucun des trois ne voit
qu'un bouton touche le bord, qu'une ligne casse en 375 px, ou qu'on ne comprend pas ce qu'un
geste va faire.** Il faut un œil, et c'est le sien.

**Trois façons de traiter, et il faut choisir la bonne :**

- **un défaut de mise en page ou de copy** → corrigé directement, coché dans JON-68. Pas de
  ticket par padding : `AGENTS.md` réserve les tickets au travail substantiel, et un ticket par
  marge finirait par cacher les vrais ;
- **un défaut qui révèle une règle** → son propre ticket. Le cas d'école est en phase 8 : « un
  message d'erreur recouvrait le champ de saisie » n'était pas une marge, c'était un **ancrage** —
  la bulle grandissait vers le bas au lieu du haut, donc elle recouvrait le bouton qu'elle
  demandait de réessayer ;
- **une demande de changement produit** → ce n'est plus de la recette, c'est un **ajout au
  périmètre**, avec ses quatre endroits (voir plus haut).

**Et la correction ne se négocie jamais contre l'accessibilité** : 48×48, 16 px, contraste AA. Un
padding resserré qui fait passer une cible sous 48 px n'est pas une correction, c'est un échange.

## La règle produit qui tranche tout

> Est-ce que cette feature aide réellement la famille à organiser quelque chose ensemble ?

Si non, on ne la construit pas. Casa Liva doit être **plus simple que demander « tu fais quoi
samedi ? » à voix haute**. Une action courante = moins de 15 secondes.

## Ce que le commanditaire a ajouté au périmètre

`docs/PLAN.md` est la transcription du cahier des charges d'origine. Il **ne contient pas**
tout ce qui a été décidé depuis. **Quatorze** demandes s'y sont ajoutées ; elles comptent autant
que le reste, et chacune a son entrée dans `docs/DECISIONS.md` :

| Ajout | Où | Phase |
|---|---|---|
| **Les lieux** — un endroit nommé une fois, partagé par la maison | D20, D45 · [JON-38](https://linear.app/jonathan-naal/issue/JON-38) | 10 · schéma posé |
| **On ne modifie pas l'événement de quelqu'un d'autre** | D21 · [JON-39](https://linear.app/jonathan-naal/issue/JON-39) | ✅ faite |
| **Parler pour agir** — la voix déclenche une action, avec aperçu | D22, D41 · [JON-40](https://linear.app/jonathan-naal/issue/JON-40) | ✅ faite |
| **« Qui est libre le … ? »** — la question inverse, et le désistement | D28 · [JON-45](https://linear.app/jonathan-naal/issue/JON-45) | ✅ faite |
| **Les catégories d'événement**, créées par la maison | D29, D45 · [JON-46](https://linear.app/jonathan-naal/issue/JON-46) | 10 · schéma posé |
| **Les notifications sur le téléphone** | D30, D52, D53, D54, D56 · [JON-47](https://linear.app/jonathan-naal/issue/JON-47) | 11 · invitations, réponses **et rappels** |
| **Chacun choisit sa voix**, et l'écoute avant | D37 · [JON-59](https://linear.app/jonathan-naal/issue/JON-59) | ✅ faite |
| **Le Speech-To-Text passe par ElevenLabs**, pas par Groq | D39 · [JON-57](https://linear.app/jonathan-naal/issue/JON-57) | ✅ faite |
| **On repart d'une conversation neuve** — `/ia` n'est pas un fil interminable | D44 · [JON-67](https://linear.app/jonathan-naal/issue/JON-67) | 10 |
| **La semaine se lit en liste**, la grille horaire vit à la journée | D46 · [JON-70](https://linear.app/jonathan-naal/issue/JON-70) | ✅ faite |
| **Deux vues : la maison, et moi** | D47 · [JON-71](https://linear.app/jonathan-naal/issue/JON-71) | ✅ faite |
| **Écouter la maison, ou m'écouter moi** | D48 · [JON-72](https://linear.app/jonathan-naal/issue/JON-72) | ✅ faite |
| **Dire à voix haute, ou remplir à la main** | D49 · [JON-73](https://linear.app/jonathan-naal/issue/JON-73) | ✅ faite |
| **On se joint à un événement sans demander** | D50 · [JON-74](https://linear.app/jonathan-naal/issue/JON-74) | ✅ faite |

**Une constante s'en dégage, et elle tranche les cas non prévus.** Trois propriétaires, et
jamais le même :

- un **événement** appartient à **qui l'organise** — déplacer le golf de quelqu'un, non ;
- un **lieu**, une **catégorie**, tout ce qui sert à décrire, appartient à la **maison** et se
  modifie par n'importe qui : corriger une adresse fautive profite à tout le monde ;
- une **préférence** — la voix qu'on entend (D37), les résumés qu'on reçoit (D27) — appartient à
  **celui qui la subit**. Personne d'autre n'a à en décider, et elle ne regarde personne d'autre :
  c'est pourquoi ni `wants_digests` ni `voice_id` ne partent au navigateur avec `FamilyMember` ;
- une **participation** — « je viens », « pas dispo » — appartient à **celui qui la vit** (D50).
  C'est le pendant de D21 : on ne modifie pas l'événement d'un autre, mais on n'a besoin de la
  permission de personne pour dire si on y va. **Sauf sur un événement importé de Google** : s'en
  retirer libérerait le créneau pour toute la maison alors que le rendez-vous tient toujours.

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4
- Supabase (Postgres + Auth + RLS) — projet `kfiycbsussdqqtlzrwvn`, région eu-west-3
- Motion (ex Framer Motion) pour les animations
- IA : Anthropic (défaut) + **Groq** (repli) derrière une interface `AIProvider`. Le **niveau**
  demandé (`AIInput.tier` : `standard` | `light`) est traduit par chaque fournisseur dans son
  propre catalogue — **jamais un nom de modèle dans l'interface**, sinon il part chez l'autre
  pendant un repli (D40). Sonnet 5 pour le chat, Haiku 4.5 pour le briefing
- Voix : **ElevenLabs de bout en bout** — synthèse *et* transcription (D39). Groq n'est plus que le
  repli d'écriture de Casa AI
- Email : Resend · Cron : Vercel Cron · Hébergement : Vercel
- **Notifications téléphone : Web Push** (VAPID) via `web-push` — la seule intégration du
  projet qui passe par une bibliothèque, et D53 dit pourquoi : une charge mal chiffrée est
  **acceptée** par le service et indéchiffrable par le navigateur. Rien n'échoue, rien
  n'arrive, rien ne le dit

## Conventions non négociables

**Server par défaut.** Server Components partout ; `"use client"` seulement quand une
interaction navigateur l'exige (drag, gestes, micro, audio). Mutations = Server Actions.
APIs / OAuth / IA / webhooks / cron = Route Handlers.

**Aucune clé API dans le client.** Jamais de `NEXT_PUBLIC_ANTHROPIC_API_KEY`,
`NEXT_PUBLIC_GROQ_API_KEY`, `NEXT_PUBLIC_ELEVENLABS_API_KEY`. Tous les appels externes
passent par le backend. Seules `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`
sont exposées (elles sont protégées par RLS).

**Le LLM ne touche jamais la base.** Il choisit un *tool* serveur déclaré dans
`lib/ai/tools.ts` ; le backend valide les droits, exécute, et renvoie le résultat.
Casa AI ne peut jamais révéler ce que l'utilisateur n'a pas le droit de voir
(cf. `visibility_mode` d'une connexion Google).

**Et un tool d'écriture ne s'exécute pas — il propose** (D41). `create_event` valide, résout, range
un brouillon avec un jeton dans `ai_action_drafts`, et rend « aperçu prêt ». L'écriture part d'un
**geste humain** qui consomme le jeton une seule fois, et passe par les Server Actions
d'`actions/events.ts` — donc par `refusalFor` et le forçage de `creator_id`. Corollaire :
**l'événement créé par l'IA appartient à qui a parlé, pas à Casa AI.**

**Rien de ce qui vient de l'agenda n'est une consigne** (D42). Un titre importé est écrit par
n'importe qui capable d'envoyer une invitation à une adresse Gmail, et il entrait tel quel dans le
prompt système. Tout titre qui part vers un modèle passe désormais par `asData`
(`lib/ai/untrusted.ts`) et vit entre des bornes que le prompt stable annonce. Ça **réduit** la
surface ; la vraie barrière reste l'humain devant l'aperçu.

**Et le corollaire qui rend ça vrai sans effort :** les tools s'exécutent **sous la session de
la personne**, jamais sous la clé de service. La RLS fait alors tout le travail — un tool ne peut
structurellement pas lire ce que son appelant ne peut pas lire.

**La voix ne dit jamais un texte fourni par le client.** Les trois portes reçoivent *de quoi il
s'agit*, jamais *ce qu'il faut dire* : `/api/ia/voix` prend l'identifiant d'un message et relit
son contenu en base ; l'aperçu de `/moi` dit une phrase écrite dans `lib/voice/voices.ts` ;
`/api/ia/voix/briefing` prend `aujourdhui` ou `semaine` et va chercher les événements lui-même.
Un texte fabriqué côté serveur est un texte déjà passé par le masquage — faire confiance au
navigateur rouvrirait par la voix ce qui est fermé à l'écrit (D36).

**Ce qui est dicté est transcrit puis oublié.** Aucune colonne ne le stocke, aucun bucket ne le
reçoit, aucun journal ne le mentionne, et le `transcription_id` rendu par ElevenLabs n'est jamais
lu. La réserve est écrite : le mode zéro rétention est réservé aux offres entreprise (essayé,
`403`), donc la promesse **s'arrête à la frontière du dépôt** (D39).

**Ces garanties sont vérifiées, pas seulement écrites.** `npm run verify:ai` tourne en CI, sans
base ni secret — **36 contrôles**, et `npm run verify:rls` en compte **67** sur la vraie base. Il refuse le code si `lib/ai/`, `lib/voice/` ou `actions/ia.ts`
contient un client admin, un titre d'événement lu sans passer par `visibleTitle`, une description
d'événement, ou une clé d'IA exposée au navigateur ; si un fichier lit `getEvents` sans référencer
la règle de masquage ; si `generateSpeech` ou `transcribeAudio` gagnent un second appelant ; si
l'endpoint de transcription est écrit ailleurs que dans son enveloppe ; ou si quoi que ce soit du
chemin dicté est conservé.

Depuis la phase 10, il refuse aussi : une **clé de cache de briefing** qui ne porterait pas la
portée en plus du périmètre (D48 — « ma semaine » et « la semaine de la maison » peuvent lister
les mêmes événements et ne pas se dire pareil), et un filtrage de « ma semaine » recopié au lieu
d'appeler `mine()` de `lib/calendar/scope.ts`.

Depuis la phase 9, il refuse aussi : un `.insert(` dans `lib/ai/tools.ts` (un tool qui **exécute**
au lieu de proposer) ; un tool déclaré sans avoir été **classé** lecture ou écriture ; un titre
d'agenda interpolé dans un prompt sans passer par `asData`, ou un prompt qui perd ses bornes ; une
**cible** glissée dans la liste des corrections que le navigateur a le droit d'envoyer ; et toute
écriture dans `events` qui ne passerait pas par les Server Actions. Quatre de ces contrôles
**exécutent** `asData` au lieu de la relire, comme ceux de `visibleTitle`.

**Toute nouvelle surface qui parle de l'agenda entre dans son périmètre dès sa première ligne** —
attendre qu'un contournement apparaisse, c'est écrire le contrôle après l'incident.

**Et depuis la phase 11, la surface la plus exposée du produit y est entrée : la notification.**
Elle s'affiche sur un **écran verrouillé** — sans déverrouiller le téléphone, sans le prendre en
main, devant qui se trouve à côté. Plus exposée qu'un email, qui suppose au moins d'ouvrir sa
boîte. `verify:ai` refuse donc, dans `lib/push/` et `actions/push.ts` : un titre d'événement lu
sans `visibleTitle`, une description, un second appelant de `sendToDevice` — **et surtout une
Server Action qui accepterait le texte à afficher.** Sans ce dernier, n'importe qui écrirait ce
qu'il veut sur l'écran verrouillé de n'importe quel habitant ; c'est la règle de D36 appliquée à
l'écrit, là où elle vaut encore plus qu'à l'oral.

`lib/push/` n'entre **pas** dans `aiFiles` pour autant : il utilise légitimement la clé de
service, comme `lib/email/`. Prévenir Sophie exige de lire l'abonnement de Sophie, ce que la
session de celui qui invite ne peut pas faire — la RLS de 0016 n'ouvre qu'à soi, et c'est elle qui
garantit qu'on ne peut ni retirer ni deviner l'adresse de notification d'un autre.

**Un contrôle qui filtre sur un chemin ne le fait jamais par expression régulière.** Deux des
cinq contrôles neufs ont d'abord été écrits avec `/lib[\/]push[\/]send\.ts$/.test(file)` : sur
Windows, où les chemins portent des antislashs, le filtre ne retirait **rien**. L'un faisait
passer le fichier qui *définit* la fonction pour un appelant de plus ; l'autre vidait la liste des
fautifs par construction, donc **vert pour une mauvaise raison**. On compare `rel(file)`, qui est
déjà normalisé.

**Et un rappel part sans personne devant.** `npm run verify:rappels` (D56, JON-79) charge
`rappelDu` — la fonction qui décide en production — et vérifie qu'un rappel part **une fois**, à
l'heure, et **repart quand l'événement est déplacé**. Il existe parce que ce balayage s'exécute
toutes les quinze minutes sur un serveur : un défaut n'y rend pas d'erreur, il rend un rappel de
trop, un rappel manquant, ou rien. Comme `verify:dates`, chaque cas porte la forme fautive à côté
de la bonne et exige qu'elles divergent.

**Et un jour ne fait pas toujours 24 heures.** `npm run verify:dates` (D51, JON-69) refuse toute
expression qui compte un jour ou une semaine en millisecondes — `24 * 60 * 60_000` **et**
`24 * HOUR`, les deux écritures que le `grep` de JON-60 avait ratées l'une après l'autre. Trois
sites restent délibérés, **avec leur nombre de lignes** : une exception sans compte finit par
couvrir la ligne suivante. À côté du contrôle de forme, il **exécute** `layoutDay`, `weekAnchor`,
`casaDays` et les bornes de fenêtre aux deux dimanches de bascule.

**Et une clé peut être présente sans en être une.** `npm run verify:voix` (JON-82) demande à
ElevenLabs, en une commande, si la clé de cette machine est acceptée — et il charge `refusDeForme`
du vrai module plutôt que d'en recopier la règle. Il existe parce que la voix est restée morte du
5 au 26 août 2026 : `ELEVENLABS_API_KEY` portait l'**identifiant** d'une clé au lieu de la clé.
Rien ne pouvait le dire — `verify:ai` tourne exprès sans secret, donc il ne voit aucune clé, et le
seul endroit qui savait était la réponse d'ElevenLabs recopiée dans les journaux Vercel.

Il sort donc de la CI, comme `verify:rls`, et **il ne prouve que cette machine** : la clé de Vercel
est une autre valeur, et c'est elle qui sert la famille. Ce que `verify:ai` garde, lui, tient sans
secret : la clé ne se lit que dans `lib/voice/elevenlabs.ts`, via `cleElevenLabs()` — un appel qui
relirait `process.env` en direct sauterait le contrôle de forme et rouvrirait la même panne.

Deux choses le distinguent des autres, et elles valent pour tout contrôle de date :

- **chaque cas porte la forme fautive à côté de la bonne et exige qu'elles divergent.** Le banc de
  JON-60, réglé sur midi, était vert *avant comme après* la correction ; ici un cas qui cesse de
  discriminer fait tomber le contrôle au lieu de rassurer pour rien ;
- **les instants s'écrivent en UTC, jamais avec `setHours`** — qui lit le fuseau de la machine.
  Écrit sur un poste en `America/New_York`, « 23h30 » devenait 05h30 à Paris.

**Et la règle que ces deux tickets ont écrite deux fois : une seule fonction décide.** JON-60 l'a
payée avec `WeekBoard`, qui recalculait sa propre ancre de semaine ; JON-75 avec `gridBounds`, qui
relisait les dates alors que `clampToDay` les avait déjà découpées — et les deux ne s'accordaient
pas sur ce qu'est minuit. Un `22h00 → 00h00` était dessiné **96 px sous la grille**, tous les
jours de l'année. Quand deux endroits ont besoin du même calcul, ils appellent la **même
fonction** ; ils ne la refont pas chacun de leur côté.

Le corollaire, lui, se rate dans l'autre sens : **partager la fonction, pas forcément le
résultat.** Faire lire à `gridBounds` le tableau que `layoutDay` a placé aurait fermé ce
défaut-là et en aurait ouvert un autre — `DayBoard` y met l'aperçu du glissement, donc la grille
se serait réorganisée sous le doigt pendant qu'on déplace un bloc.

**Et un contrôle qu'on n'a pas essayé de casser ne prouve rien.** Après en avoir écrit un, le
casser exprès, vérifier qu'il échoue, restaurer. Ce n'est pas du zèle : le premier jet du contrôle
qui garde la transcription **ne bronchait pas** quand la route appelait l'API en direct.

**Couleurs de membre.** Tailwind ne peut pas générer `bg-member-${color}` à la volée.
On passe par `memberStyle(color)` (`lib/design/member-color.ts`) qui pose `--m`, `--m-soft`,
`--m-ink` en style inline, consommées via `bg-[var(--m)]`.

**Accessibilité.** 16px minimum, cibles tactiles 48×48 (`.tap`), contraste AA,
jamais d'action critique en icône seule, toujours un « Annuler » après move/delete/edit.
Le produit doit être utilisable par une personne âgée.

**Ton.** Simple, chaleureux, drôle, légèrement taquin, jamais infantilisant.
Pas d'état vide qui dit « Aucun événement ».

## La base porte PLUSIEURS maisons — une donnée de test doit nommer la sienne

**Il n'y a plus qu'une maison sur la base de production depuis le 31 août** — celle du
commanditaire. Il y en a eu **deux**, portant le même nom : la sienne, et celle d'un inscrit
solitaire (`inconnu A`, 11 août) arrivé par la porte que D59 a depuis fermée. Cette
seconde maison, vide, a été retirée avec son compte.

**La règle qui suit n'a pas bougé pour autant, et ce serait une erreur de la relâcher.** Elle ne
protégeait pas d'un accident passé : elle protège de l'écriture qu'on fait sans regarder. Une
seconde maison peut réapparaître le jour où quelqu'un est invité et repart, et le `where` manquant
coûterait exactement la même chose.

Conséquence, payée le 24 août : un `insert … select id from public.families` **sans `where`**
écrit dans **toutes** les maisons. Deux événements et deux lieux de test ont atterri chez
quelqu'un d'autre, et ont dû être retirés.

**La RLS ne protège rien contre ça** : le MCP Supabase et `verify:rls` écrivent sous la clé de
service, qui la contourne par construction. Toute donnée posée à la main doit nommer sa maison
par son identifiant, jamais par `select from families`.

## Deux pièges d'environnement, payés cette session

**Le serveur de dev lancé depuis un outil ne voit pas `.env.local`.** Il hérite des variables du
processus **parent**, et chez Next celles-ci priment sur le fichier — mesuré : une
`ANTHROPIC_API_KEY` finissant par `0QAA` (compte à zéro) au lieu de celle du fichier (`7QAA`, qui
répond `200`). **Un worktree git isolé ne règle rien** : la variable vient de l'outil, pas du
dossier. Le contournement qui marche est la **Preview Vercel** — ouvrir la PR, attendre le
déploiement, et se connecter avec `npm run dev:login -- <email> <url-preview> <page>`. C'est là
que toute la phase 9 a été essayée. `npm run dev` depuis un terminal ordinaire n'a pas le
problème, et la production non plus.

**La première requête après un déploiement peut servir l'ancien bundle client avec le nouveau
serveur.** Vu le 4 août : le brouillon d'action était bien créé en base, et l'aperçu ne
s'affichait pas — le vieux JavaScript ignorait le champ `draft` de la réponse. Un rechargement
suffit, mais le symptôme ressemble trait pour trait à un défaut. **Recharger avant de
diagnostiquer.**

## Commandes

```bash
npm run dev        # dev server
npm run build      # build de prod
npm run typecheck  # tsc --noEmit
npm run lint
npm run verify:rls   # 67 contrôles d'isolation, sur la vraie base (exige .env.local)
npm run verify:ai    # 36 contrôles de confidentialité — sans base ni secret, donc en CI
npm run verify:dates # 12 contrôles de changement d'heure — sans base ni secret, donc en CI
npm run verify:rappels # 7 contrôles sur les rappels — chargent le vrai module, sans base
npm run verify:voix  # la clé ElevenLabs en est-elle une ? (exige .env.local, appelle l'API)
```

## Branches

`main` (prod) ← `develop` ← `feature/*`. Chaque PR génère une Preview Vercel.
