@AGENTS.md

# Suivi du projet — Linear fait foi

Le projet se pilote depuis **Linear**, en Scrum, l'agent portant les casquettes de
**Product Owner** et de **Product Manager** :

> https://linear.app/jonathan-naal/project/casa-liva-d7532c5615c9 · équipe `JON`

**Lire le board avant de coder. Le mettre à jour avant de terminer.** Un travail livré sans
ticket, ou un ticket fermé sans dire ce qui a réellement été fait, ne compte pas comme fait.

Les règles complètes — quand créer un ticket, quoi écrire en le fermant, comment prioriser, ce
que recouvrent les deux rôles — sont dans `AGENTS.md`, section « Le suivi vit dans Linear »,
inclus ci-dessus. Elles ne sont **volontairement pas recopiées ici** : deux copies d'une même
règle finissent toujours par diverger, et c'est la copie périmée qu'on lit le jour où ça
compte.

# Phase 10 — le commanditaire est le contrôle qui manque

Depuis le 4 août, il fait passer **beaucoup de QA à la main** : padding, responsivité, format UI,
gestes déroutants. C'est le seul type de défaut que ce projet ne sait pas attraper autrement —
aucun de ses contrôles automatiques ne voit qu'un bouton touche le bord ou qu'une ligne casse en
375 px.

**Ce qu'il signale n'est pas une liste de corrections à appliquer telles quelles.** Trois natures,
trois traitements — une marge se corrige et se coche, un défaut qui révèle une règle prend son
propre ticket, une demande de changement produit est un **ajout au périmètre** avec ses quatre
endroits. La règle est dans `AGENTS.md`, section « La recette humaine », et la liste vit dans
[JON-68](https://linear.app/jonathan-naal/issue/JON-68). Pas recopiées ici, pour la raison
ci-dessus.

Un réflexe, en revanche, mérite d'être su par cœur : **une correction de mise en page ne se
négocie jamais contre l'accessibilité.** 48×48, 16 px, contraste AA. Un padding resserré qui fait
passer une cible sous 48 px n'est pas une correction, c'est un échange — et il se paie sur le
seul utilisateur qu'on ne peut pas se permettre de perdre.

# Phase 11 — trois contraintes iOS qu'aucun contrôle ne rattrape

La phase 11 est ouverte : PWA, installation, notifications. Le détail vit dans `docs/ETAT.md` et
dans les tickets. **Trois choses méritent d'être sues par cœur**, parce qu'elles ne produisent
aucune erreur et qu'on les découvre en les payant :

> **1. Sur iPhone, le Web Push n'existe QUE pour une PWA installée.** Pas « moins bien » : pas du
> tout. Tester dans un onglet Safari ne prouve rien, dans un sens comme dans l'autre. C'est
> pourquoi l'invitation à installer et les notifications sont indissociables — l'installation est
> la première étape de la notification, pas une feature d'à côté.
>
> **2. Un refus de permission ne se redemande pas.** Sur iOS, il faut désinstaller la PWA pour
> revenir en arrière. La demande ne part donc jamais toute seule : elle part d'un tap, sur un
> écran qu'on est allé chercher, et après une phrase qui dit ce qu'on y gagne. Demander au premier
> écran, c'est perdre la personne définitivement.
>
> **3. Une notification s'affiche sur un écran verrouillé.** Sans déverrouiller le téléphone, sans
> le prendre en main, devant qui se trouve à côté. C'est la surface la plus exposée du produit —
> plus qu'un email, qui suppose d'ouvrir sa boîte. La règle de masquage de D13 s'y applique telle
> quelle, et `verify:ai` la garde depuis `lib/push/`.

Et une quatrième, de méthode : **un abonnement Web Push meurt sans prévenir.** Le service répond
`404` ou `410` **une seule fois**, puis accepte tout sans rien livrer. Même famille de panne que
`needs_reauth` sur les jetons Google — ce qui casse en silence doit laisser une trace en base.

# `PLAN.md` n'est pas tout le périmètre

`docs/PLAN.md` transcrit le cahier des charges **d'origine**. Le commanditaire y a ajouté des
demandes en cours de route, et elles comptent autant que le reste — un incrément livré en
suivant le seul `PLAN.md` peut donc être incomplet sans que rien ne le signale.

La liste tient dans un tableau : `AGENTS.md`, section « Ce que le commanditaire a ajouté au
périmètre », inclus ci-dessus. Chaque ligne renvoie à sa décision (`docs/DECISIONS.md`) et à son
ticket Linear. Pour la même raison que plus haut, elle **n'est pas recopiée ici**.

La règle qui tranche les cas non prévus, elle, mérite d'être sue par cœur. Trois propriétaires,
et jamais le même :

> Un **événement** appartient à **qui l'organise**.
> Un **lieu**, une **catégorie** — tout ce qui sert à décrire — appartient à la **maison**.
> Une **préférence** — la voix qu'on entend, les résumés qu'on reçoit — appartient à **celui qui
> la subit**.
> Une **participation** — « je viens », « pas dispo » — appartient à **celui qui la vit** (D50).

Le quatrième volet est le pendant de D21 et il se lit à l'envers du premier : on ne modifie pas
l'événement d'un autre, mais **on n'a besoin de la permission de personne pour dire si on y va**.
Une seule exception, structurelle : sur un rendez-vous importé de Google, s'en retirer libérerait
le créneau pour toute la maison alors qu'il tient toujours.

# Un ajout au périmètre se consigne partout à la fois

Quand le commanditaire ajoute quelque chose, il attend de le retrouver **au même moment** dans
`docs/PLAN.md` (une section `bis` dans le chapitre concerné), le tableau d'`AGENTS.md`,
`docs/DECISIONS.md`, et un ticket Linear. Il l'a demandé explicitement.

Ce n'est pas de la paperasse : chacun de ces endroits est lu par quelqu'un de différent, à un
moment différent. Un ajout consigné à un seul endroit est un ajout que la session suivante
livrera de travers sans que rien ne le signale — c'est précisément le risque que décrit le
paragraphe ci-dessus.

## Une **correction** ne se consigne pas comme un ajout

Le commanditaire change parfois une décision technique déjà prise, sans rien ajouter au produit.
Le 4 août, le Speech-To-Text est passé de Groq à ElevenLabs : **D1 disait le contraire**, et
`PLAN.md` — qui ne nommait aucun fournisseur pour ça — ne devenait faux nulle part.

Dans ce cas, et **seulement** dans ce cas :

- **on ne touche pas à `PLAN.md`.** Ajouter une section `bis` pour une correction abîmerait ce que
  ce fichier est : la transcription du cahier des charges **d'origine**. Si rien n'y devient faux,
  il ne bouge pas ;
- **on écrit une décision neuve** (D39), et **on annote l'ancienne** d'un renvoi vers elle. On ne
  réécrit pas D1 : ce qu'on a cru un jour fait partie de l'histoire, et c'est souvent le
  raisonnement périmé qui explique le mieux pourquoi on a changé d'avis ;
- **on corrige tous les endroits qui affirment l'ancienne version, dans le même commit** — y
  compris les commentaires de code. Le tableau ci-dessus gagne une ligne seulement si le
  changement se voit par la famille.

La règle qui décide : **une section `bis` répond à « qu'est-ce qui manquait ? », une décision neuve
répond à « pourquoi a-t-on changé d'avis ? ».** Ce ne sont pas les mêmes questions, et elles ne
sont pas lues par la même personne.

# Ce qui a attrapé le plus de défauts sur ce projet

**Exécuter le vrai chemin, et casser ses propres contrôles.**

Les défauts qui coûtent ici ne produisent aucune erreur : ils rendent une réponse d'apparence
normale, et fausse. Un briefing qui ouvre sur « lundi, rien du tout » un mardi matin. Un modèle
qui refuse un paramètre et fait retomber chaque appel sur le repli — le fichier arrive, il est
juste, il a seulement coûté deux fois. Aucun n'a été trouvé en relisant.

Deux habitudes, et elles ne se remplacent pas l'une l'autre :

- **un banc jetable qui charge le vrai module** (via `jiti`, en n'échangeant que la lecture en
  base) prouve en trente secondes ce qu'un clic dans le navigateur laisse deviner ;
- **après avoir écrit un contrôle, le casser exprès** et vérifier qu'il échoue. Trois fois payé le
  24 août : un contrôle de balayage de jours réglé sur midi était vert **avant comme après** (il
  fallait la fin de soirée) ; un contrôle de rangement testait un nom qu'un bloc `exception`
  PL/pgSQL avait défait ; et un contrôle par comptage laissait passer un jour sauté, parce que
  sauter le 29 mars laisse quand même sept clés distinctes.
  Le premier jet du contrôle qui garde la transcription ne bronchait pas quand la route appelait
  l'API en direct : il a fallu le couper en deux.

Et en production, se méfier d'un succès servi par un cache — il ne prouve que le cache. Provoquer
un manque avant de conclure quoi que ce soit sur une clé.
