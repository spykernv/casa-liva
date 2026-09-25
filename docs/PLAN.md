# Casa Liva — Product & Development Plan

> Transcription du cahier des charges. Source de vérité produit.
> Les écarts assumés sont consignés dans [`DECISIONS.md`](./DECISIONS.md).

---

## 1. Vision

Casa Liva est un agenda familial privé, mobile-first, extrêmement simple, chaleureux et
engageant. Il permet à tous les habitants de Casa Liva de :

- savoir rapidement qui fait quoi ;
- partager leurs disponibilités ;
- organiser des activités ensemble ;
- créer des événements en moins de 15 secondes ;
- connecter leurs calendriers Google existants ;
- trouver automatiquement des créneaux communs ;
- recevoir des invitations et rappels ;
- obtenir des résumés intelligents de la semaine ;
- parler avec une IA qui comprend l'agenda familial ;
- écouter un résumé vocal de l'agenda.

Utilisable aussi bien par un développeur que par une grand-mère. **La priorité absolue est
l'adoption.** Casa Liva doit être plus simple que demander oralement « tu fais quoi samedi ? ».

## 2. Proposition de valeur

Trois questions, trois réponses :

1. **Qu'est-ce que tout le monde fait ?**
2. **Quand sommes-nous disponibles ensemble ?**
3. **Qu'est-ce qu'on pourrait organiser ?**

Exemples réels : aller voir Spider-Man · faire un golf · organiser un apéro · déjeuner
familial · aller à la plage · les courses · « trouve deux heures où Jonathan, Mamie et sa
nièce sont libres » · « résume-moi oralement la semaine de Jonathan ».

## 3. Principes produit

**Simplicité** — une action courante < 15 s. Créer un événement : `Titre → Date/heure →
Participants → Créer`. Maximum. Les paramètres avancés restent facultatifs.

**Mobile first** — pensé pour le téléphone, puis tablette, puis desktop.

**Familial** — pas un logiciel professionnel froid. Ton simple, drôle, chaleureux,
légèrement taquin, positif, jamais infantilisant.

> Casa Liva est organisée.
> Événement statistiquement rarissime.

**Adoption avant sophistication** — ne pas recopier Google Calendar. Construire uniquement
ce qui résout le problème familial.

## 4–5. Stack & hébergement

`Next.js` · `React` · `TypeScript` · `Tailwind CSS` · `Framer Motion` · calendrier.

App Router : Server Components par défaut, Client Components uniquement si interaction
navigateur, Server Actions pour les mutations, Route Handlers pour APIs / OAuth / IA /
webhooks / cron.

`GitHub → Vercel`. Branches `main` / `develop` / `feature/*`. Chaque PR génère une Preview.

## 6–7. Base de données & authentification

**Supabase** seul : PostgreSQL, utilisateurs, familles, événements, participants, connexions
Google, préférences, logs IA, éventuellement Realtime. Pas de seconde base.

Auth : **Supabase Auth**, priorité **Google OAuth**. Login minimal :

```
Continuer avec Google
↓
Bienvenue à Casa Liva 🏡
```

## 8–9. Membres & avatars

```ts
type FamilyMember = {
  id: string
  firstName: string
  email: string
  avatar: string
  color: string
  timezone: string
}
```

Couleur unique par membre : Jonathan → bleu, Papa → vert, Maman → rose, Mamie → violet,
Nièce → orange.

Avatars minimaux, flat, friendly, reconnaissables, circulaires — lisibles en 32/40/48 px.
Pas de photo dans le MVP : `couleur de fond + visage minimal + initiale`.

## 10. Navigation principale

Bottom navigation fixe : **Aujourd'hui · Semaine · Casa · IA · Moi**.

```
┌─────────────────────────┐
│       CASA LIVA         │
│                         │
│       Calendrier        │
│                         │
├─────────────────────────┤
│ 🏠   📅   ✨   🤖   👤 │
└─────────────────────────┘
```

## 11. Vue Aujourd'hui

```
CASA LIVA
Lundi 3 août
[J] [P] [M] [L]

08:00
09:00 █████ Jonathan
10:00 █████ Jonathan
11:00       █████ Papa
12:00
13:00 🍝 Déjeuner Casa
14:00
15:00             █████ Mamie
16:00
17:00 ✨ TOUT LE MONDE LIBRE
18:00 ✨ TOUT LE MONDE LIBRE
19:00
                          [+]
```

## 12. Vue semaine

Inspirée de Google Calendar : scroll vertical, drag, resize, tap événement, tap créneau
vide, long press, swipe jour. Chaque personne garde sa couleur ; un événement familial
affiche plusieurs avatars.

```
🎬 Spider-Man
19:30 → 22:00
[J] [P] [M] [L]
```

### 12 bis. La semaine se lit, la journée se règle — *ajout au périmètre (D46)*

Recette du 5 août 2026, capture à l'appui : les titres d'événements s'affichaient tronqués à
trois caractères — « Co… », « Rel… ».

**Ce n'était pas un défaut de marge, c'était une division.** À 375 px :

```
(375 − 40) / 7                                       = 47,86 px par colonne
 − 1 bordure − 3 barre de couleur − 16 padding       = 27,86 px de texte
 à 13 px semi-gras                                   = 4 caractères
```

Et dès **deux** événements superposés, le bloc tombe à 20,43 px, soit **1,43 px de texte**. À
trois, la largeur devient négative. Aucun réglage de padding ne récupère 1,43 px.

§12 dit « inspirée de Google Calendar ». **Ni Google Agenda ni Apple Calendar ne montrent sept
colonnes horaires en portrait sur un téléphone** : le premier bascule en « 3 jours » ou en
« Planning », le second propose une liste. Suivre la lettre de §12 revenait à reproduire une
forme qu'aucun des deux n'utilise sur ce format.

La semaine devient donc **un rail de sept pastilles et des rangées pleine largeur** :

```
lun  mar  mer  jeu  ven  sam  dim
 3    4   [5]   6    7    8    9
 ••   ••  •••   ••   •••       ••

Mercredi 5 août · aujourd'hui
┌ 07:00 │ 🍝 Déjeuner avec jo          ┐  [Je viens]
│ 08:00 │ Lucie, Jonathan · Chez mamie
└ ────────────────────────────────────┘
```

Un titre y dispose de **255 px** — ≈ 31 caractères sur une ligne, 62 sur deux. Et la lisibilité
**cesse de dépendre du nombre d'événements** : deux rendez-vous à 9 h sont deux rangées de
255 px, pas deux colonnes de 20.

**La grille horaire ne disparaît pas — elle change d'échelle.** Elle vit à la journée, pleine
largeur (303 px de colonne au lieu de 47,9), et c'est là que le glisser-déposer et le
redimensionnement de §12 gardent leur sens. Le swipe entre semaines, lui, reste.

### 12 ter. Deux vues : la maison, et moi — *ajout au périmètre (D47)*

Demande du commanditaire du 5 août : « il faut avoir deux vues, une vue calendrier de la maison
et une vue mon calendrier ».

Une rangée de portée sous l'en-tête : `[ La maison ] [ Moi ] │ (P) (R) (G)` — les deux portées,
puis une pastille par habitant. Elle remplace le filtre par membre, qui posait la même question
sous une autre forme.

**Ce que « ma semaine » veut dire est tranché** : *les événements où je participe sans m'être
désisté*. Pas « ceux que j'ai créés » — un événement créé puis décliné serait alors dans ma
semaine et absent de celle de la maison, un sous-ensemble qui n'en est pas un.

C'est aussi ce qui donne son sens à §16 bis : **se retirer d'un événement le fait disparaître de
sa propre semaine.**

## 13. Création d'un événement

```
Qu'est-ce qu'on fait ?
[ Apéro samedi soir ]

Quand ?
[ Samedi 8 août ]  [ 18:00 ] → [ 21:00 ]

Avec qui ?
[x] Jonathan  [x] Papa  [x] Mamie  [ ] Léa

[ C'est parti ]
```

### 13 bis. Les catégories, créées par la maison — *ajout au périmètre (D29)*

Sous « Qu'est-ce qu'on fait ? », la rangée d'émojis devient une rangée de **catégories** :
un émoji **et** un titre, qui remplissent le formulaire d'un tap.

```
Qu'est-ce qu'on fait ?
[                                    ]

🍝 Déjeuner   🍷 Apéro   ⛳ Golf   🎬 Ciné   ➕ Nouvelle
```

**N'importe qui peut en créer une, et toute la maison la voit.** Casa Liva part avec un jeu de
base, mais une famille a ses propres rituels — « 🛶 Kayak », « 🎲 Soirée jeux », « 🩺 Kiné de
Mamie » — et c'est précisément ce que le champ de texte libre oblige à retaper, mal orthographié,
à chaque fois.

La création se fait **depuis l'écran de création d'événement**, là où le besoin apparaît :
demander d'aller dans un écran de réglages pour ranger une catégorie ferait abandonner
avant la fin.

Une catégorie appartient à la maison, comme un lieu (§13 ter) — pas à qui l'a créée.

### 13 ter. Les lieux — *ajout au périmètre (D20)*

Un endroit où l'on se retrouve : un **nom obligatoire** (« Chez Mamie »), une **adresse
facultative**, un tap ouvre l'itinéraire. Partagé et modifiable par toute la maison.

### 13 quater. Dire à voix haute, ou remplir à la main — *ajout au périmètre (D49)*

Demande du commanditaire du 5 août : « quand on clique sur le "+", avant d'ouvrir la feuille, il
faut un mini-menu avec "dire à l'oral" ou "remplir à la main" ».

Le « + » ouvrait le formulaire directement. Casa AI sait créer à la voix depuis la phase 9
(§36 bis), mais il fallait le savoir, aller dans l'onglet IA, et deviner qu'on pouvait le lui
demander. **Une capacité qu'on ne découvre pas est une capacité qu'on n'a pas.**

```
Ajouter un événement

🎙  Dire à voix haute
    « Apéro samedi 19h avec Sophie ».
    Casa AI prépare, tu valides.

✏️  Remplir à la main
    Le formulaire, comme avant.
```

**Le micro ne démarre pas tout seul**, et pas par prudence : Safari iOS n'accorde
`getUserMedia` que dans la foulée immédiate d'un geste, et une navigation n'en est pas un. Un
démarrage automatique échouerait **en silence** sur le seul navigateur de la maison. La page
d'arrivée fait ressortir le micro ; c'est la personne qui appuie.

Les deux autres portes de création — le tap sur un créneau vide de la grille, et l'état vide —
ouvrent toujours le formulaire directement : on y a déjà désigné une heure, redemander le chemin
serait une question de trop. **Seul le « + », qui ne désigne rien, pose le choix.**

## 14–15. Modèles

```ts
type Event = {
  id: string
  familyId: string
  creatorId: string
  title: string
  description?: string
  startAt: Date
  endAt: Date
  location?: string
  source: "casa-liva" | "google"
  externalEventId?: string
  createdAt: Date
  updatedAt: Date
}

type EventParticipant = {
  eventId: string
  userId: string
  status: "pending" | "accepted" | "declined"
}
```

## 16. Invitations

Notification dans Casa Liva **et** email.

```
Casa Liva a un plan pour toi.

⛳ Golf
Samedi 10:00 → 12:00

Jonathan et Papa sont déjà partants.

[ Je viens ]   [ Pas dispo ]
```

### 16 bis. On se joint à un événement sans demander — *ajout au périmètre (D50)*

Demande du commanditaire du 5 août : « pour chaque événement, il faut pouvoir le rejoindre ou se
retirer facilement, **sans demander la permission** ».

**Le droit existait déjà ; c'est le geste qui manquait.** Depuis D21, seul le créateur modifie ou
supprime un événement — mais *tout le monde répond*, et `refusalFor` le dit explicitement en
passant `ownerOnly: false`. Répondre « je viens » ou « pas dispo » n'a jamais été interdit. Ça se
faisait seulement à trois taps, enterré dans la feuille de détail.

Le geste remonte donc sur la rangée : `[ Rejoindre ]` devient `[ Je viens ]`, et retaper retire.

Ça complète la triade de propriété du projet :

> Un **événement** appartient à qui l'organise.
> Un **lieu**, une **catégorie** — ce qui sert à décrire — appartient à la **maison**.
> Une **préférence** appartient à celui qui la subit.
> **Une participation appartient à celui qui la vit.**

**Sauf sur un événement importé de Google** : répondre « pas dispo » à son propre rendez-vous
libérerait le créneau pour toute la maison alors qu'il tient toujours. On organiserait un apéro
pendant le dentiste de quelqu'un.

## 17–20. Google Calendar

Bouton `Connecter mon Google Calendar`.
Flow : `Casa Liva → Google OAuth → Permission Calendar → Google Calendar API → Casa Liva`.

Objectif : afficher les événements personnels sans forcer personne à changer son
organisation. Normalisation `Google Event → Casa Liva Event Adapter → Calendar UI`.

**Confidentialité** — à la connexion :

```
Que peut voir Casa Liva ?
○ Seulement mes disponibilités
● Les noms de mes événements
○ Tous les détails
```

Ainsi « Rendez-vous médecin » peut devenir `🔒 Jonathan occupé 14:00 → 15:00`.

**Sync** : initial sync + incremental sync (+ webhooks éventuellement). Ne jamais recharger
tout le calendrier. Stocker `calendar_id`, `sync_token`, `last_synced_at`.

## 21–22. Disponibilités & « Trouver un moment »

`Casa Events + Google Events → Availability Engine` → `busy intervals`, `free intervals`,
`common availability`.

```
✨ Trouver un moment

Faire quoi ?  [ Golf ]
Avec qui ?    [x] Jonathan [x] Papa [x] Mamie
Durée ?       [ 1h ] [ 2h ] [ 3h ]
              → Chercher

Les meilleurs moments :
Samedi   10:00 → 12:00
Samedi   16:00 → 18:00
Dimanche 09:00 → 11:00

[ Créer l'événement ]
```

### 22 bis. « Qui est libre le … ? » — *ajout au périmètre (D28)*

La question inverse, sur le même écran. On part d'une **date** et on regarde **qui** — parce
qu'on connaît presque toujours le jour avant de savoir avec qui.

```
Qui est libre ?     [ Samedi 8 août ]

✨ Tout le monde est libre    10:00 → 12:00  ·  17:00 → 22:00

[J] Jonathan   Libre toute la journée
[P] Sophie   Libre 08:00→14:00 et 17:00→22:00
               14:00  🛒 Courses          [ Je me désiste ]
[M] Mamie      Libre toute la journée

[ Proposer quelque chose ce jour-là ]
```

**Ce qui occupe les gens est affiché, et c'est le point.** Un agenda qui dit seulement
« Sophie n'est pas libre » ferme la discussion ; en montrant qu'elle fait les courses, il la
laisse ouverte — c'est à elle de décider si le golf vaut mieux. « Je me désiste » ne s'affiche
que sur ses propres participations, et jamais sur un rendez-vous importé.

## 23–26. Casa AI

Assistant familial connecté aux calendriers. Il doit pouvoir lire les agendas, comprendre
les disponibilités, résumer une journée / une semaine, comparer plusieurs agendas, trouver
des disponibilités, proposer des moments, répondre aux questions, générer des réponses
vocales et comprendre la voix.

Architecture : `User → Casa AI → AI Router → Calendar Context → LLM → Response (texte + voix)`.
Fournisseurs : **Anthropic** et **Groq** (modèles open source servis par Groq — *pas* xAI/Grok),
plus **ElevenLabs** pour la voix.

```ts
interface AIProvider {
  generate(input: AIInput): Promise<AIResponse>
}
// AnthropicProvider · GroqProvider
```

Le LLM reçoit : question + agenda utilisateur + agenda famille + disponibilités calculées +
contexte temporel — et **uniquement** les données nécessaires.

Suggestions rapides du chat : « Résume ma semaine » · « Quand sommes-nous tous libres ? » ·
« Que fait Jonathan demain ? » · « Trouve un moment pour un apéro » · « Résume la semaine de
Casa Liva ».

### 26 bis. On repart d'une conversation neuve — *ajout au périmètre (D44)*

Demande du commanditaire du 4 août, après avoir essayé les actions vocales sur son téléphone.

**`/ia` s'ouvre toujours sur une conversation neuve.** Ce n'est pas un chat qu'on reprend :

```
Que veux-tu savoir, Jonathan ?

Casa AI lit les agendas de la maison, répond, et prépare
tes événements — tu regardes, et c'est toi qui valides.

[ Résume ma semaine                        ]
[ Quand sommes-nous tous libres ?          ]
[ Ajoute un golf samedi matin avec Sophie ]
```

Et un bouton **« Nouvelle conversation »** en haut du fil, dès qu'il y a quelque chose à effacer.

**Aucun historique à l'écran** : pas de liste, pas de tiroir, pas de conversations précédentes.
Une question, une réponse, on ferme.

Le plan ne disait rien de la façon dont une conversation commence ou finit — c'est ce qui
manquait. Ce qu'il disait des **suggestions rapides** (§26) ne tenait d'ailleurs que si l'écran
les remontre : elles n'apparaissent que sur un fil vide, donc on ne les revoyait jamais après la
première question.

## 27–33. Voix

Bouton `🔊 Écouter` sur : agenda du jour, agenda de la semaine, profil d'une personne,
réponse Casa AI, vue familiale.

Flow : `Calendar Data → LLM Summary → Text → ElevenLabs → Audio`.
États UI : « Casa AI prépare ton résumé... » → « Création de l'audio... » →
`▶ 0:00 ━━━━━━━━━━━ 1:21` (play / pause / restart).

Conversation vocale : `Microphone → Audio → Speech To Text → Text → Intent Detection →
Calendar Query → LLM → Answer → ElevenLabs → Voice`.

**Ne jamais appeler ElevenLabs depuis le client avec la clé API.** Wrappers serveur
`generateSpeech(text)` et `transcribeAudio(audio)`.

### 27 bis. Chacun choisit sa voix — *ajout au périmètre (D37)*

Le plan ne prévoyait qu'une voix, la même pour tout le monde. Le commanditaire a demandé le
4 août qu'elle devienne un **réglage par habitant**, dans `/moi`, avec un **aperçu de cinq
secondes** avant de choisir.

> On n'impose pas une voix à quelqu'un qui va l'entendre tous les matins. Et on ne choisit pas
> une voix sur son nom : « Aurore — douce et grave » ne dit rien tant qu'on ne l'a pas entendue.

Quatre voix françaises, pas le catalogue : en proposer dix reviendrait à ne proposer personne.
Le triangle fait écouter, le nom choisit — deux gestes séparés, sinon il faudrait choisir avant
d'avoir entendu.

**Ce que ça change au-delà de l'écran :** l'empreinte du cache audio doit porter **la voix** en
plus du texte. L'aperçu dit la même phrase pour les quatre ; une clé qui n'aurait porté que le
texte aurait fait écouter une voix et en choisir une autre. Détail en D37.

### 27 ter. Écouter la maison, ou m'écouter moi — *ajout au périmètre (D48)*

Demande du commanditaire du 5 août : « pour "écouter la semaine", il faut distinguer "écouter la
semaine de la maison" et "écouter ma semaine" ».

Le briefing prend une **portée**, et le bouton la dit :

| Vue active | Bouton |
|---|---|
| La maison | « Écouter la semaine de la maison » |
| Moi | « Écouter ma semaine » |

**Un seul bouton, pas deux.** Chaque lecteur possède son propre élément `audio` et il n'existe
aucun registre global : deux boutons côte à côte, deux taps, et deux voix parlent en même temps.
Le libellé suit donc la vue, et changer de vue coupe l'audio en cours.

Une pastille de **membre** laisse le libellé sur « la maison » : la route ne connaît que deux
portées, on n'en fabrique pas une troisième pour un filtre visuel — et surtout **on ne laisse pas
le libellé mentir** sur ce qui va être prononcé. C'est ce qui a fait corriger `/aujourdhui` au
passage : il disait « Écouter **ma** journée » en lisant l'agenda de toute la maison.

Le filtrage réutilise la définition de §12 ter. Deux définitions de « ma semaine » divergeraient,
et c'est la voix qui dirait alors autre chose que ce que l'écran montre — sans erreur, sans trace.

## 34–35. Tools & permissions IA

Le LLM n'accède **jamais** directement à la base. Tools serveur explicitement autorisés :

```ts
getUserSchedule() · getFamilySchedule() · getUserAvailability()
getCommonAvailability() · getEvent() · searchEvents()
createEvent() · inviteParticipants()
```

Le LLM choisit un tool, le backend valide, puis exécute.

Casa AI ne doit jamais accéder à une information à laquelle l'utilisateur n'a pas accès.
Si Mamie est en `availability-only`, la réponse est « Mamie est occupée mercredi de 14h à
16h », **pas** « Rendez-vous cardiologue ».

## 36–38. Actions et suggestions IA

Création d'événement par IA avec **confirmation humaine obligatoire** :

```
Casa AI : Samedi 10h–12h fonctionne pour tout le monde.
[ Créer le golf ⛳ ]
```

Suggestions non agressives, **1 à 2 maximum** :

```
✨ Opportunité Casa
Tout le monde est libre samedi 17h → 20h.
Ça ressemble dangereusement à un créneau pour un apéro.
```

### 36 bis. Parler pour agir — l'aperçu, pas le bouton — *ajout au périmètre (D22, D41)*

Le plan proposait un **bouton** de confirmation : `[ Créer le golf ⛳ ]`. Le commanditaire a
demandé autre chose le 3 août — **voir ce que ça donnera avant que quoi que ce soit ne bouge**,
et pouvoir le corriger.

```
J'ai entendu : « ajoute un golf samedi matin avec papa »

Rien n'est encore enregistré

⛳ Golf
Samedi 8 août · 10:00 → 12:00
[J] [P]

[ Créer ]   [ Corriger ]   [ Laisser tomber ]
```

**Un bouton dit ce qu'on va faire ; il ne montre pas ce que ça donnera.** Le bouton suffirait si
la demande était tapée et relue. Elle ne l'est pas : la voix se trompe en silence — un prénom pris
pour un mot courant, une date pour une autre, une heure sur deux dans une cuisine bruyante.
Confirmer une interprétation qu'on n'a pas vue revient à signer en blanc.

Deux ajouts s'y rattachent, et ils ne sont pas dans le plan d'origine :

- **la voix comme point d'entrée d'une action** — §27-33 décrit une conversation vocale, mais elle
  *interroge* : rien, dans toute la chaîne vocale du plan, n'écrit quoi que ce soit ;
- **`delete_event`**, qui ne figure ni dans la liste de tools de §34-35, ni dans la ligne roadmap.

**Et la règle qui rend tout ça sûr** : un tool d'écriture **n'exécute pas, il propose** (D41). Le
LLM ne touche jamais la base — §34-35 le disait déjà, et la phase 9 en fait la conséquence
mécanique plutôt qu'une consigne : `create_event` range un brouillon avec un jeton, et seule une
main humaine l'échange contre une écriture.

**La correspondance des noms**, parce que le plan et le code ne les écrivent pas pareil :

| Plan (§34-35) | Code | Où |
|---|---|---|
| `getUserSchedule` · `getFamilySchedule` | `get_schedule` | livré, phase 7 |
| `getUserAvailability` · `getCommonAvailability` | `who_is_free` · `find_moments` | livré, phase 7 |
| `searchEvents` | `search_events` | livré, phase 7 |
| `createEvent` | `create_event` | phase 9 — **en proposition** |
| `inviteParticipants` | `modify_event` sur les participants | phase 9 — pas un tool à part |
| *(absent du plan)* | `delete_event` | phase 9 |

`invite_family` n'existe pas : `updateEvent` accepte déjà `participantIds`, et deux tools qui font
la même chose, c'est un incrément livré en double.

## 39–43. Digests, emails, cron

**Daily digest** (tous les soirs) : demain + moments Casa communs.
**Weekly digest** : agenda général, événements familiaux, disponibilités communes,
événements en attente, personnes n'ayant pas mis leur agenda à jour, suggestions.

**Reminder d'agenda** :

> Ton agenda de vendredi ressemble étrangement au désert du Sahara.
> Si tu as des plans, ajoute-les maintenant.
> [ Mettre à jour mon vendredi ]

Emails via **Resend**. Cron via **Vercel Cron** :
`/api/cron/daily-digest` · `/api/cron/weekly-digest` · `/api/cron/calendar-sync`.
Selon les limites du plan, combiner plusieurs traitements dans un même cron quotidien.

## 44–47. Animations

Uniquement lorsqu'elles améliorent l'expérience. Cas : création d'événement, déplacement,
acceptation, disponibilité trouvée, chargement IA, génération audio, sync réussie,
onboarding.

Création : `pop + light scale + fade` → `✓ Ajouté à Casa Liva`.
Créneau commun trouvé : `✨` très léger → « Tout le monde est libre ici. »
Génération audio : petite waveform `● ● ● ● ●` → « Casa AI prépare le briefing... »

## 48–49. Accessibilité — obligatoire

`font-size: 16px` minimum. Boutons tactiles 44×44 px minimum, 48×48 préféré.

À éviter : double tap · swipe caché · icônes minuscules · action critique en icône seule ·
faible contraste · menus imbriqués complexes.

Toujours proposer **Annuler** après `move`, `delete`, `edit`.

## 50. Schéma de base

`users` · `families` · `family_members` · `events` · `event_participants` ·
`calendar_connections` · `ai_conversations` · `ai_messages` · `audio_generations`.
Détail des colonnes : voir `supabase/migrations/`.

## 51–52. Clés API

```env
ANTHROPIC_API_KEY=  GROQ_API_KEY=  ELEVENLABS_API_KEY=
GOOGLE_CLIENT_ID=   GOOGLE_CLIENT_SECRET=
SUPABASE_URL=  SUPABASE_ANON_KEY=  SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=  CRON_SECRET=
```

**RÈGLE ABSOLUE : aucune clé API d'IA dans le client.**
Jamais de `NEXT_PUBLIC_ANTHROPIC_API_KEY`, `NEXT_PUBLIC_GROQ_API_KEY`,
`NEXT_PUBLIC_ELEVENLABS_API_KEY`. Le chemin est toujours
`Browser → Casa Liva Backend → External API`.

## 53. Structure du repository

```
app/           (auth) calendar family ai profile settings onboarding
               api/{google,calendar,events,invites,ai,audio,cron}
components/    ui calendar events family ai audio onboarding
lib/           supabase google-calendar availability
               ai/{anthropic,groq,router,prompts,tools} elevenlabs email auth security
actions/  hooks/  types/  public/
```

## 54–64. Roadmap

| Phase | Contenu | Résultat visé |
|---|---|---|
| **0 — Foundation** | repo, Next.js, TS, Tailwind, Vercel, Supabase, env, CI | Casa Liva accessible sur Vercel |
| **1 — UI Prototype** | navigation mobile, vue jour, vue semaine, membres, couleurs, avatars, événements simulés, responsive | valider l'expérience visuelle |
| **2 — Events** | create / edit / delete / move / resize / participants | un événement créé en < 15 s |
| **3 — Family** | auth, appartenance, invitation, profil, couleur, avatar | |
| **4 — Google Calendar** | OAuth, sélection de calendriers, sync initiale et incrémentale, confidentialité, normalisation | |
| **5 — Availability** | busy / free intervals, créneaux communs, filtre durée et participants → ✨ Trouver un moment | |
| **6 — Emails** | invitations, RSVP, daily & weekly digest, reminders | |
| **7 — Casa AI (texte)** | chat, provider Anthropic, provider Groq, router, tools calendrier, permissions, résumés, disponibilités | |
| **8 — Casa AI (voix)** | TTS ElevenLabs, états de génération, lecteur audio, cache · puis STT et conversation | |
| **9 — AI Actions** | `create_event`, `find_availability`, `invite_family`, `modify_event` — toujours avec confirmation | |
| **10 — Adoption & Polish** | animations, onboarding, tooltips, empty states, copy, erreurs, undo, accessibilité, perf · **catégories d'événement** (§13 bis) · **lieux** (§13 ter) · **la semaine se lit** (§12 bis) · **deux vues, la maison et moi** (§12 ter) · **dire ou remplir** (§13 quater) · **rejoindre sans demander** (§16 bis) · **écouter la maison ou moi** (§27 ter) | un écran qu'on lit d'un coup d'œil, et deux façons d'y ajouter quelque chose |
| **11 — PWA & installation** | installation guidée sur l'écran d'accueil, service worker, coquille hors-ligne, splash screens, gestion des mises à jour · **notifications sur le téléphone** (§66 bis) | une icône Casa Liva sur le téléphone de chaque habitant, qui sait le prévenir |

> Les lignes en gras sont des **ajouts au périmètre** décidés après la rédaction de ce plan.
> `AGENTS.md` en tient la liste complète ; chacun a son entrée dans `DECISIONS.md`.

## 65–67. PWA, onboarding, empty states

PWA installable : manifest, icônes, splash mobile, mode standalone. Objectif : une icône
Casa Liva sur l'écran d'accueil — ça réduit fortement la friction d'adoption.

### 66 bis. Les notifications sur le téléphone — *ajout au périmètre (D30)*

Casa Liva doit pouvoir **notifier directement sur le téléphone**, sans passer par l'email :
une invitation qui arrive, un rappel juste avant un événement, une réponse à sa propre
proposition.

C'est ici et pas ailleurs, parce que **c'est l'installation qui débloque la notification** :
sur iPhone, le Web Push n'existe **que** pour une PWA ajoutée à l'écran d'accueil. La
notification n'est donc pas une feature de plus à côté de la PWA — c'est la raison la plus
concrète de l'installer, et l'argument à mettre dans l'invitation à installer.

Ne remplace pas les emails de la phase 6 : une notification se rate, un email attend. Mais le
même événement ne doit pas produire les deux — sinon on coupe les deux.

Onboarding : `Bienvenue à Casa Liva 🏡 / Ici, on sait enfin qui fait quoi.` → `Qui es-tu ?`
→ `Choisis ta couleur.` → `Connecte ton agenda Google. [Connecter] [Plus tard]` →
`Casa Liva est prête.`

Jamais « No events ». Plutôt :

> Rien de prévu.
> Soit une journée extrêmement calme, soit quelqu'un a oublié de remplir son agenda.

## 68–69. Design

`clean · bright · warm · premium · minimal · friendly`.
Inspirations : Google Calendar, Apple Calendar, Notion Calendar, Linear, Airbnb — avec une
personnalité familiale.

Tokens : spacing, radius, typography, shadows, animations, couleurs de famille, couleurs
sémantiques. Radius doux : 12 / 16 / 20 px.

## 70–74. Performance, IA et observabilité

Chargement initial instantané, UI optimiste, prefetch, JS client minimal, lazy loading,
données calendrier en cache. Déplacement d'événement : `UI immédiate → serveur async →
rollback si erreur`.

Ne jamais envoyer tout l'historique familial au LLM. Context builder :
`Question → Intent → Relevant users → Relevant dates → Relevant events → LLM`.

Contrôle des coûts : abstraction de provider, limites de tokens, prompt caching, filtrage
de contexte, cache audio, rate limits. Ne jamais générer deux fois le même audio.

Logger : échecs de sync Google, mutations d'événements, échecs d'email, échecs IA, échecs
audio, latence, consommation de tokens.
**Ne jamais logger** : clés API, refresh tokens OAuth, contenu de calendrier sensible.

## 75–76. MVP

**Core MVP** — se connecter · voir Casa Liva · voir les membres · voir les agendas · créer
un événement · déplacer un événement · inviter · connecter Google Calendar · trouver un
créneau commun · recevoir une invitation.

**AI MVP** — ouvrir Casa AI · poser une question · lire l'agenda concerné · le résumer ·
trouver une disponibilité · générer un résumé vocal · l'écouter.

## 77. À NE PAS construire au début

Récurrences complexes · familles multiples · calendriers publics · permissions entreprise ·
marketplace · agents IA complexes · apps natives iOS/Android · système de notifications
complexe · 20 vues calendrier · visio · gestionnaire de tâches avancé.

## 78–80. Métriques

**North Star : Weekly Family Events Organized.**
Puis : WAU / membres · événements créés par semaine · recherches de créneaux communs ·
taux de connexion Google Calendar · requêtes IA par semaine · résumés vocaux écoutés ·
taux d'acceptation des invitations.

Objectif d'adoption : **≥ 80 % des membres ouvrent l'app chaque semaine** — et surtout, que
la famille se mette spontanément à utiliser Casa Liva pour organiser ses activités.

## 81. Product statement

> Casa Liva est le système d'exploitation social de la maison : un endroit unique pour savoir
> qui fait quoi, trouver quand tout le monde est libre et transformer « on devrait faire ça »
> en « c'est prévu samedi à 19h ».

## 82. Ordre de développement — strict

```
Calendar UX → Events → Family → Google Calendar → Availability
→ Emails → Casa AI → Voice → Automation → Polish
```

**Ne pas commencer par l'IA.** Une excellente IA sur un mauvais agenda reste un mauvais
produit. D'abord la boucle centrale : `Voir → Trouver → Organiser → Participer`.
Ensuite, l'IA pour la rendre plus rapide.
