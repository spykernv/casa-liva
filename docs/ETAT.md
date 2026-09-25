# État du projet — 25 août 2026 (fin de session, tard)

Document de reprise. À lire en premier au début d'une nouvelle session, avant
[`PLAN.md`](./PLAN.md) (le quoi) et [`DECISIONS.md`](./DECISIONS.md) (les écarts assumés).

---

## Où on en est

| Phase | État |
|---|---|
| 0 — Foundation | ✅ terminée |
| 1 — UI Prototype | ✅ terminée, design validé par le commanditaire |
| 2 — Events | ✅ terminée |
| 3 — Family | ✅ terminée |
| 4 — Google Calendar | ✅ terminée, essayée avec un vrai compte (3 août), et **le refresh token vérifié vivant à 22 jours** (25 août, [JON-34](https://linear.app/jonathan-naal/issue/JON-34)) |
| 5 — Availability | ✅ terminée — « ✨ Trouver un moment » **et** « Qui est libre le … ? », essayés sur la vraie base |
| 6 — Emails | ✅ terminée — **envois réels vérifiés depuis la production** |
| 7 — Casa AI (texte) | ✅ terminée — **vérifiée depuis la production**, réponses et masquage compris |
| **8 — Casa AI (voix)** | ✅ **terminée** — « Écouter », le choix de la voix, le briefing, le micro, et le bucket audio sous contrôle automatique |
| **9 — AI Actions** | ✅ **terminée** — Casa AI prépare, on valide. Les actions vocales ont été essayées par le commanditaire sur son téléphone |
| **10 — Adoption & Polish** | 🚀 **en production depuis le 25 août** (PR #27, `f79385b`) : la refonte de `/semaine` (D46), les deux vues (D47), les deux portées d'écoute (D48), les deux chemins de création (D49), la participation en un tap (D50), les lieux et catégories de bout en bout (D45), et le **contrôle permanent des dates** ([JON-69](https://linear.app/jonathan-naal/issue/JON-69), D51). La recette humaine ([JON-68](https://linear.app/jonathan-naal/issue/JON-68)) continue, **désormais sur la vraie app**. [JON-75](https://linear.app/jonathan-naal/issue/JON-75) est corrigé **et en production** (PR #29 puis #30) |
| **11 — PWA & installation** | 🚧 **en production depuis le 26 août** — service worker, **popup d'installation** (D55), guide `/installer`, et les notifications (invitations + réponses). **Tout vit sur la PR [#32](https://github.com/spykernv/casaliva/pull/32), non fusionnée.** Restent : les rappels avant événement (D54, [JON-79](https://linear.app/jonathan-naal/issue/JON-79)), l'essai sur de vrais téléphones ([JON-78](https://linear.app/jonathan-naal/issue/JON-78)). Clés VAPID posées ✅, trois films tournés ✅, **rappels livrés** (D56, migration 0017) ✅ |

**Tout est en production**, phases 8 et 9 comprises — la 9 déployée le 4 août (PR #20) et
**essayée sur `casaliva.app` même** : « ajoute un cinéma dimanche à 18h avec Inès » a rendu
l'aperçu 🎬 *Dimanche 9 août · 18:00 → 20:00*, avec « Rien n'est encore enregistré ». Aperçu
abandonné, base rendue à ses 16 événements.

**Un piège de mise en production, vu ce jour-là** : la toute première requête après le bascule a
servi l'**ancien bundle client** avec le **nouveau serveur**. Le brouillon était bien créé en base,
et l'aperçu ne s'affichait pas — parce que le vieux JavaScript ignore le champ `draft` de la
réponse. Un simple rechargement suffit. À ne pas confondre avec un défaut : le symptôme est « le
modèle dit que l'aperçu est là, et il n'y est pas ».

Le détail des phases précédentes : `main` porte les phases 5 et 6 (PR #2, #3, #4), la 7
(PR #5, #6), « Écouter » et le choix de la voix (PR #7, #8), le briefing (PR #9, #10), puis le
micro et le split de modèles (PR #11, #12, #13).

**Chaque tranche a été essayée sur `casaliva.app` même**, pas seulement en local — c'est la règle
du projet, et elle a payé à chaque fois. Le micro, lui, a été **validé à la main par le
commanditaire sur son iPhone** : c'était le seul critère qui comptait, puisqu'aucun navigateur de
contrôle n'a de microphone.

**Rien n'est ouvert sur les phases 5, 6 et 7.**

Le suivi détaillé est dans Linear :
https://linear.app/jonathan-naal/project/casa-liva-d7532c5615c9

## Par où commencer une nouvelle session

1. **Ce document**, jusqu'à la fin de « Repères d'architecture ».
2. **Le board Linear** — un ticket a pu bouger entre deux sessions.
3. **`AGENTS.md`** : les conventions non négociables, la règle de suivi Linear, et le tableau
   « Ce que le commanditaire a ajouté au périmètre » — `PLAN.md` **n'est pas** tout le périmètre.
4. **La section de la phase concernée**, plus bas dans ce document.

---

## ⏭️ Reprendre ici — session suivante

**La phase 10 est en production.** La phase 11 est écrite et **attend sur la PR
[#32](https://github.com/spykernv/casaliva/pull/32)** — huit commits, CI verte, `CLEAN`, branche
`feature/jon-19-service-worker`. Elle porte JON-19, JON-18 et la plus grande partie de JON-47.

> ⚠️ **La migration 0016 est DÉJÀ appliquée en production**, alors que le code qui la lit vit sur
> la branche. C'est la troisième fois (0008 le 3 août, 0015 le 24) et c'est inoffensif ici :
> purement additive, `push_subscriptions` vide, `wants_push` à `true` pour les cinq habitants.
> **Ne pas la réappliquer.** Elle a été répétée en transaction avec `rollback` avant d'être posée
> (D45).

### Par quoi commencer, dans cet ordre

| | | Pourquoi |
|---|---|---|
| **1** | **Essayer #32 sur un vrai téléphone**, puis fusionner et déployer | Trois tickets en dépendent, et **aucun ne peut se fermer sans ça** : JON-19 (mode avion), JON-18 (l'installation réelle, et que la maquette corresponde à ce que Safari affiche vraiment), JON-47 (le push, qui sur iPhone n'existe que pour une PWA installée). Le navigateur de contrôle a fait tout ce qu'il pouvait ; le reste demande un doigt. |
| **2** | [JON-76](https://linear.app/jonathan-naal/issue/JON-76) — les clés VAPID dans Vercel | **Action humaine.** Sans elles, aucune notification ne part **et rien ne le dit** : l'email prend le relais, tout a l'air normal. Quatrième fois que ce projet pose la question — aucune API ne rend la liste des variables d'un projet Vercel. |
| 3 | Finir [JON-47](https://linear.app/jonathan-naal/issue/JON-47) — les rappels | `pushRappel` existe et n'est appelé par personne. Il manque l'ordonnanceur : **workflow GitHub Actions toutes les 15 min** frappant `/api/cron/…` avec le secret (D54, décidé avec le commanditaire). Vercel Hobby plafonne ses propres crons à un par jour. |
| 4 | [JON-68](https://linear.app/jonathan-naal/issue/JON-68) — la recette | Au fil de l'eau, sur `casaliva.app`. Seul travail encore ouvert sur la phase 10. |
| 5 | [JON-77](https://linear.app/jonathan-naal/issue/JON-77) (Medium) · [JON-53](https://linear.app/jonathan-naal/issue/JON-53) (Low) | Quatre vulnérabilités `high` transitives de Next 16.2.12 — à froid, c'est une montée de version. Et les actions GitHub dépréciées. |

### Deux retours de recette, le même jour, sur un vrai téléphone

**La popup d'installation est redevenue un CTA (D57).** Demandée le matin, essayée l'après-midi,
jugée **« trop agressive »**. Elle est remplacée par le bandeau d'`/aujourd'hui` — en
`position: static`, **dans le flux de la page et jamais une couche par-dessus** — qui ouvre
`/installer`. Les trois films restent : ils vivent là où l'on arrive **en l'ayant voulu**. Seul
changement par rapport à l'avant-D55 : le bandeau paraît dès la **première** ouverture, sinon
retirer la popup retirerait aussi sa portée.

**« Tout le monde est libre » quitte `/semaine` ET `/aujourd'hui` (D58).** En deux temps : je lui
ai signalé que la bande existait aussi sur la journée, sous une autre forme, et il a tranché
pareil. Elle reste sur `/casa` et `/casa/trouver` — les deux écrans où l'on **est allé chercher**
un créneau. `PLAN.md` ne devient faux nulle part : cette bande n'y a jamais figuré.

> **La ligne qui tranchera les cas suivants : un créneau libre se cherche, il ne se propose pas.**
> Les deux écrans qui le proposaient sont ceux qu'on ouvre par défaut — c'est ce qui rendait la
> proposition intrusive plutôt qu'utile.

> ⚠️ **Depuis la phase 11, vérifier un changement en production demande une étape de plus.** Le
> service worker sert la copie du **déploiement précédent** jusqu'à ce qu'il se mette à jour — il
> n'appelle jamais `skipWaiting()` (JON-19), il attend, et c'est voulu. Mesuré le 26 août : après
> la bascule, `/aujourd'hui` affichait encore la bande retirée, et les caches s'appelaient
> `casa-*-630a1e0f59e8` — le SHA du **déploiement d'avant**. Ce n'était pas un défaut de
> déploiement, c'était le worker qui faisait son travail.
>
> **Le nom du cache porte le SHA : c'est lui qui tranche.** S'il ne correspond pas au commit
> déployé, on regarde l'ancienne version — et aucun rechargement ordinaire n'y change rien. Pour
> vérifier tout de suite : désinscrire le worker et vider les caches. Sur un téléphone, la famille
> verra l'invitation à mettre à jour et un tap donnera la main.
>
> C'est le piège de « l'ancien bundle client servi après un bascule » (`AGENTS.md`), **en plus
> tenace** : là un rechargement suffisait, ici il ne suffit plus.

> **Ce que ces deux retours enseignent.** Aucun des quatre contrôles automatiques, ni le navigateur
> de contrôle, ne pouvait dire « ce panneau est trop agressif » ou « cette bande n'est pas à sa
> place ». Il a fallu un œil sur un vrai téléphone, et une minute. C'est exactement ce que décrit
> [JON-68](https://linear.app/jonathan-naal/issue/JON-68) — et c'est la troisième fois de la
> journée que ça paie, après le « 404 » de `/installer` qui n'en était pas un.

### Ce que la session du 26 août a livré

**Les rappels avant événement (D56, JON-79)** — le troisième et dernier cas de §66 bis. Le délai
est **choisi par l'organisateur, par événement**, et chaque participant non-décliné le reçoit,
l'organisateur compris. Ça ressemble à une entorse à la règle des propriétaires et ça n'en est pas
une : un délai de rappel n'est pas une préférence mais une **propriété de l'événement** — un train
ne se prépare pas comme un cinéma, et pas seulement pour celui qui organise. Ce qui reste à chacun,
c'est `wants_push`.

L'horloge est un **workflow GitHub Actions toutes les quinze minutes** (`.github/workflows/rappels.yml`)
qui frappe `/api/cron/rappels` — Vercel Hobby plafonne ses propres crons à un par jour (D54). Elle
**bat depuis le 26 août** ([JON-80](https://linear.app/jonathan-naal/issue/JON-80) ✅) : `statut : 200`,
décompte rendu.

> ⚠️ **Le secret vit dans l'environnement `Production`, pas dans les secrets du dépôt** — et un
> secret d'environnement n'est visible que d'un job qui **déclare** cet environnement
> (`environment: Production`). Le premier essai a échoué là-dessus, sur une consigne fautive de
> JON-80. Vérifié avant de corriger : `Production` n'a aucune règle de protection, donc un passage
> planifié s'exécute tout de suite — **avec un relecteur requis, les rappels auraient attendu une
> approbation toutes les quinze minutes.**

> **La colonne `rappel_envoye_pour` porte une DATE, pas un booléen**, et c'est le cœur du dessin.
> Avec un booléen il aurait fallu penser à le remettre à zéro partout où un événement se déplace —
> Server Actions, aperçu d'IA, synchronisation Google — et **un seul chemin oublié** aurait fait
> qu'un rendez-vous repoussé de trois heures n'aurait jamais rappelé. En rangeant le `start_at`
> pour lequel l'envoi a eu lieu, l'invalidation devient structurelle. Vérifié sur la vraie base :
> 1 dû → marqué → 0 au second passage → **1 à nouveau après déplacement**, sans une ligne de code
> pour le remettre à zéro.

`npm run verify:rappels` entre en CI : 7 contrôles, le vrai module chargé, chaque cas portant la
forme fautive à côté de la bonne. **Cassé exprès deux fois** — le booléen fautif en fait tomber
deux, une borne stricte en fait tomber un.


**L'invitation à installer change de forme — une popup, plus un bandeau (D55, JON-18).** Le
commanditaire a essayé la version livrée et tranché, en désignant un précédent qui marche :
`plania-communaute`. Le bandeau discret renvoyant vers `/installer` supposait qu'on ait **envie
d'aller voir**, et c'est exactement ce qu'on ne fait pas quand on est venu consulter l'agenda.
C'est une **correction de forme**, pas un ajout au périmètre : §65 demandait déjà l'invitation, et
`PLAN.md` ne devient faux nulle part — donc décision neuve et **aucune section `bis`**.

Livré : `InstallPopup` dans la coquille de `(app)` (donc sur tous les écrans — on arrive aussi par
un lien d'invitation), la plateforme détectée en premier dans la popup, deux sorties dont une
collante en haut, `installReportee()` partagée avec le bandeau, et **trois emplacements vidéo qui
s'effacent tant que le fichier n'existe pas**.

> ⚠️ **Le « 404 » signalé sur `/installer` n'en était pas un.** La page n'existe **pas en
> production** — elle ne vit que sur la branche de #32. `casaliva.app/installer` répond `307` vers
> `/connexion`, puis 404 une fois connecté. **Tant que #32 n'est pas fusionnée, tout essai passe
> par l'URL de Preview.**

**Les trois films sont tournés** (`public/videos/`, 5,1 Mo, 1080×1920), avec **HyperFrames**
depuis `C:\dev\motion-video-claude\projects\pwa-onboarding-casa-liva\` — sources et commande
de rendu dans `public/videos/README.md`. Ceux de Plania n'ont servi que de modèle de structure :
ils portent « Communauté Plania » et `communaute.plania.ai` en toutes lettres.

**Quatre défauts trouvés en l'exécutant, dont un qui aurait tout annulé.** Les trois premiers sont
dans le composant (`<source>` dont l'`error` ne remonte pas ; `onError` qui arrive après
l'hydratation ; et une parade qui **ne discriminait pas** — elle masquait le lecteur *même avec un
vrai fichier*). Le quatrième était ailleurs : **`public/videos/` n'était pas exclu du matcher de
`proxy.ts`**, donc les `.mp4` prenaient un `307` vers `/connexion` et le navigateur recevait du
HTML en guise de vidéo. Panne de `sw.js`, du cron de la phase 4 et du désabonnement de la phase 6,
**une quatrième fois** — et pire ici, parce que `.jpg` était exclu et pas `.mp4` : l'affiche se
serait affichée et la vidéo jamais, **sans que rien ne le signale**.

**Et une mesure qui a menti, la troisième de cette famille.** Après fermeture, la popup semblait
rester montée avec sa couche `fixed inset-0 z-50` interceptant tous les taps — symptôme reproduit
sur `create-choice-sheet`, du code de **production**. J'ai failli signaler un défaut bloquant sur
toutes les feuilles de l'app. En réalité **le panneau du navigateur de contrôle n'était pas
affiché**, donc `requestAnimationFrame` ne tourne pas : mesuré **0 tick en 1500 ms**,
`visibilityState: "hidden"`. Motion est gelé et `AnimatePresence` ne démonte jamais. Après le
viewport 0 × 0 et l'empreinte de bundle relevée sur la mauvaise page, la règle se confirme :
**avant de conclure à un défaut d'animation ou de taille, vérifier que la page compose des
images.**

### Ce que la phase 11 a livré, et ce qu'elle n'a pas livré

**Livré et vérifié sur la Preview :**

- **[JON-19](https://linear.app/jonathan-naal/issue/JON-19) — le service worker.** Servi par une
  **route** (`app/sw.js/route.ts`) et non depuis `public/` : le navigateur ne remplace un worker
  que si ses **octets** changent, donc un fichier statique ne déclencherait jamais `updatefound`.
  Le SHA du déploiement y est injecté. Navigations en réseau d'abord, `/hors-ligne` en repli,
  dernière version connue servie **avec l'heure du dernier chargement réussi**. Jamais de
  `skipWaiting()` à l'installation : le worker attend, on le dit, un tap donne la main.
- **[JON-18](https://linear.app/jonathan-naal/issue/JON-18) — l'invitation à installer.** Bandeau
  à partir de la **deuxième** ouverture, report de 14 jours, ligne permanente dans `/moi`, et une
  page publique **`/installer`** avec une maquette de téléphone qui montre *où* se trouve « Sur
  l'écran d'accueil » dans la feuille de partage. Inspirée de `C:\dev\plania-communaute`, sur
  indication du commanditaire.
- **[JON-47](https://linear.app/jonathan-naal/issue/JON-47) — les notifications**, pour deux des
  trois cas de §66 bis : l'invitation qui arrive, et la réponse à ce qu'on a proposé.

**Pas livré, et c'est écrit dans les tickets :** les rappels avant événement, les clés côté
Vercel, et l'essai sur de vrais téléphones.

### Cinq pièges payés en phase 11, et qui valent au-delà

1. **`sw.js` n'était pas exclu du matcher du proxy.** Le navigateur aurait reçu un `307` vers
   `/connexion` **en guise de JavaScript**, et l'enregistrement aurait échoué sans erreur lisible.
   C'est la panne du cron de la phase 4 et du désabonnement de la phase 6, **une troisième fois** :
   le proxy répond *avant* le handler, donc une route mal déclarée n'est pas « protégée », elle est
   injoignable.
2. **Le commit affirmait une garantie que le code ne tenait pas.** J'avais écrit que le cache
   hors-ligne était purgé à la déconnexion. Faux : `signOut` est une Server Action, la redirection
   est jouée côté client, et le worker ne voit passer **aucune navigation**. Trouvé en l'essayant.
   `PurgeHorsLigne` s'en charge depuis l'écran de connexion.
3. **`beforeinstallprompt` ne se déclenche qu'une fois, souvent avant l'hydratation.** Un écouteur
   posé dans un `useEffect` arrive parfois après : le bouton n'apparaîtrait **jamais**, présent sur
   certains chargements et absent sur d'autres. Il est capté par un script `beforeInteractive`.
4. **Deux contrôles de `verify:ai` filtraient un chemin par expression régulière à slashs.** Sur
   Windows, où les chemins portent des antislashs, le filtre ne retirait **rien** : l'un faisait
   passer le fichier qui *définit* `sendToDevice` pour un appelant, l'autre vidait la liste des
   fautifs par construction — donc **vert pour une mauvaise raison**. On compare `rel(file)`.
5. **Neuf `\b` étaient devenus des caractères BACKSPACE** dans `verify-ai.mjs`, par un heredoc
   mal échappé. Les regex ne cherchaient plus une limite de mot mais un octet de contrôle. Une
   leçon d'outillage : **écrire les scripts de patch dans un fichier, pas dans un heredoc.**

### Deux mesures qui ont menti, et comment on s'en aperçoit

- **Le panneau du navigateur de contrôle replié rend un viewport 0 × 0.** Toutes les largeurs
  valent alors zéro : j'ai lu un bandeau de « 34 px » et cru à un défaut de mise en page. Vérifier
  `window.innerWidth` avant de conclure quoi que ce soit sur une taille.
- **Une empreinte de bundle ne prouve un déploiement que si elle porte sur le code qui a changé.**
  Relevée sur `/connexion` pour un correctif de la **grille**, elle n'a jamais bougé — et ne
  pouvait pas : cette page ne charge pas ce code. Le guetteur aurait tourné indéfiniment.

### Ce que la session du 25 août avait livré, plus tôt dans la journée

**Trois tickets fermés, quatre PR fusionnées, la phase 10 en production — et un défaut trouvé,
puis corrigé, en chemin.**

**[JON-75](https://linear.app/jonathan-naal/issue/JON-75) — l'événement qui finit pile à minuit.**
Trouvé en écrivant `verify:dates`, corrigé dans la foulée (PR #29). `gridBounds` relisait `e.endAt`
pour son propre compte et y lisait `getHours() === 0` sur une fin à minuit, pendant que
`clampToDay` plaçait correctement la fin à 1440 : un `22h00 → 00h00` était dessiné **96 px sous la
grille**, tous les jours de l'année et depuis la phase 1. Les bornes se déduisent maintenant de
`clampToDay` — **une seule fonction décide**, comme l'ancre de semaine après JON-60.

Mesuré avec un vrai événement, même écran et même jour : avant la correction, l'écran affichait
jusqu'à **21:00** et laissait le bloc déborder de **96 px** ; après, il affiche jusqu'à **23:00** et
le contient. Vérifié deux fois — sur la Preview, puis **sur `casaliva.app` après le déploiement**
(PR #30, `cda82cb`). La donnée de test a été retirée à chaque fois, et la base est revenue à ses
**34 événements et 37 participations**.

`verify:dates` passe de 11 à **12** : l'évitement du cas de minuit est retiré, et un garde-fou neuf
refuse le mauvais correctif — « la grille ne s'élargit que quand un événement le réclame », sans
quoi « faire tenir le bloc » se réglerait en affichant 24 h tout le temps.

Après la fusion, `develop` a été vérifié pour lui-même et pas seulement à travers les branches :
`verify:dates` (11), `verify:ai` (29), `verify:rls` (**67/67, sur la vraie base**), `typecheck`,
et la CI de `develop`. Une fusion propre textuellement peut être cassée sémantiquement, et deux
branches vertes séparément ne prouvent pas leur somme.

**Et le déploiement a été vérifié comme un déploiement, pas comme une PR fermée** — trois signaux
indépendants :

1. **le bundle servi par `casaliva.app` a réellement changé** (`e849af1d…` → `a0bbee3a…`). C'est
   ça qui prouve le bascule ; l'état de la PR ne prouve que GitHub ;
2. **les routes répondent ce qu'elles doivent** — `/connexion` 200, `/semaine` et `/aujourdhui`
   307, et surtout **`/api/cron/sync-calendars` 401 et non 307**. Ce 307-là est la panne de la
   phase 4 : le proxy reprend la route avant le handler, le cron ne s'exécute jamais, et **rien
   ne le signale** ;
3. **l'app a été ouverte sur `casaliva.app` même, en 375 px** — la largeur qui a motivé D46. La
   nouvelle `/semaine` rend bien la liste, un titre réel de 44 caractères s'affiche en entier
   (contre quatre dans l'ancienne grille), les jours vides se replient, et **les six catégories
   de la migration 0015 sont dans le DOM** — c'était le point le plus risqué du bascule.

- **[JON-69](https://linear.app/jonathan-naal/issue/JON-69) / D51 — `npm run verify:dates`**, 11
  contrôles, sans base ni secret, en CI entre « Confidentialité de Casa AI » et « Build ». Il
  **exécute** `layoutDay`, `weekAnchor`, `casaDays` et les bornes de fenêtre aux deux dimanches de
  bascule, et refuse par ailleurs toute nouvelle expression qui compterait un jour en 24 h fixes.
  **Cassé exprès six fois**, dont le sabotage exigé par le ticket — qui fait tomber **quatre**
  contrôles à la fois.
- **[JON-34](https://linear.app/jonathan-naal/issue/JON-34) — la connexion Google tient.**
  Vérifiée non pas à l'œil sur `/moi/agenda`, mais en **provoquant un vrai rafraîchissement chez
  Google** par le chemin exact de production : `200`, jeton d'accès reçu, les deux scopes de D11
  présents. Le refresh token a été émis le 3 août et répondait encore le 25 — **22 jours**, là où
  un écran de consentement resté en « Testing » l'aurait tué au septième. **D8 ne s'est pas
  réalisé.** Rien n'a été écrit : ni `saveAccessToken`, ni synchronisation, ni cron.
- **[JON-75](https://linear.app/jonathan-naal/issue/JON-75) — ouvert, pas corrigé.** Un événement
  qui finit **pile à minuit** est dessiné entièrement sous la grille, tous les jours de l'année.
  Rien à voir avec le changement d'heure : `gridBounds` lit `getHours() === 0` sur une fin à
  minuit et n'élargit pas, pendant que `clampToDay` place correctement la fin à 1440. **Deux
  moitiés du même calcul qui ne s'accordent pas sur ce qu'est minuit** — la forme exacte de JON-60.

**Trois changements de code de production**, que le ticket ne demandait pas et qui sont assumés :
`casaDays` extrait dans `lib/date.ts` (sans quoi le balayage de `/casa` n'était pas contrôlable),
la borne d'horizon de `/api/ia/voix/briefing` corrigée — **le dixième site**, exactement là où
JON-69 l'annonçait — et le crochet `scripts/alias-hook.mjs`.

### Ce que la session du 24 août avait livré

**Six demandes de recette, toutes livrées**, plus JON-60 :

- **JON-60** — la semaine, le jour et la grille comptent en heures d'horloge. Le ticket nommait
  trois sites ; il y en avait **neuf**. Le plus grave n'y était pas : `clampToDay` comptait les
  minutes *écoulées* alors que la grille est graduée en heures *d'horloge*, ce qui dessinait un
  rendez-vous de 23h30 à « 22h30 » le 29 mars et hors grille le 25 octobre. Et corriger le serveur
  seul aurait été **pire que le défaut** — `WeekBoard` recalculait sa propre ancre ;
- **[JON-70](https://linear.app/jonathan-naal/issue/JON-70) / D46** — `/semaine` se lit en liste.
  Sept colonnes donnaient 27,86 px de texte, soit quatre caractères, et 1,43 px dès deux
  événements superposés. Un titre en a maintenant **255 px** ;
- **[JON-71](https://linear.app/jonathan-naal/issue/JON-71) / D47** — deux vues, « La maison » et
  « Moi ». `lib/calendar/scope.ts` porte la définition, **partagée avec la voix** ;
- **[JON-72](https://linear.app/jonathan-naal/issue/JON-72) / D48** — deux portées d'écoute, et la
  portée entre dans la clé de cache. Corrige D38 ;
- **[JON-73](https://linear.app/jonathan-naal/issue/JON-73) / D49** — le « + » propose « dire à
  voix haute » ou « remplir à la main » ;
- **[JON-74](https://linear.app/jonathan-naal/issue/JON-74) / D50** — rejoindre ou se retirer en un
  tap. Geste enterré, pas droit manquant ;
- **JON-46 et JON-38 / D45** — les catégories et les lieux, schéma **et** écrans. L'itinéraire
  ouvre Maps ou Waze depuis la feuille de détail.

`verify:rls` passe de **51 à 67** contrôles, `verify:ai` de **27 à 29**.

### Trois pièges payés le 25 août

1. **Un contrôle de dates écrit avec `setHours` mesure la machine, pas le code.** `setHours` lit
   le fuseau du système. Sur le poste où `verify:dates` a été écrit — `America/New_York` — un
   rendez-vous de « 23h30 » devenait 05h30 à Paris, et le contrôle aurait rendu un autre verdict
   en CI, qui tourne en UTC. **Tous les instants s'écrivent désormais en ISO `Z`**, avec l'heure de
   Paris en commentaire. C'est le pendant du piège de `.env.local` : *ce qui entoure le code prime
   sur ce que le code croit dire.*
2. **Les instants qui discriminent ne sont pas là où l'intuition les place.** JON-69 annonçait « la
   fin de soirée » ; c'est vrai du **balayage de sept jours**, et faux des **navigations de
   semaine**, qui ne divergent qu'à une heure près de minuit un lundi. Pire, les deux écritures
   fautives ne se trompent pas le même jour : `minuit + i × 24 h` répète le 25 octobre à toute
   heure, `now + i × 24 h` ne saute le 29 mars qu'après 23 h. **Il faut un instant par forme
   fautive**, pas un instant par défaut. D'où la parade : chaque cas porte la forme fautive à côté
   de la bonne et **exige qu'elles divergent**, à chaque exécution.
3. **Une regex de commentaires mange le code qu'elle traverse.** Le premier jet du crochet d'alias
   retirait les commentaires de `tsconfig.json` avec deux `replace` d'une ligne. Il a avalé le
   `/*` de `"**/*.ts"`, au milieu du tableau `include` — le contrôle tombait avant d'avoir rien
   contrôlé. Trouvé en l'exécutant ; une relecture ne l'aurait pas vu.

### Cinq pièges payés le 24 août, et qui valent au-delà

1. **Un contrôle réglé sur la mauvaise heure ne prouve rien.** Le contrôle du balayage de sept
   jours, écrit avec `now` à midi, était vert **avant comme après** la correction. Il fallait la
   fin de soirée, quand l'heure gagnée ou perdue suffit à franchir minuit.
2. **Un contrôle par comptage laisse passer un décalage.** Sauter le 29 mars laisse quand même
   sept clés distinctes — la fenêtre glisse au lieu de se répéter. Il faut comparer les jours
   eux-mêmes.
3. **Un bloc `exception` en PL/pgSQL annule tout son contenu**, pas seulement l'instruction qui a
   échoué. Le premier jet du contrôle « ranger libère le nom » testait un nom que le bloc
   précédent avait défait : il passait pour une mauvaise raison.
4. **Le branching Supabase exige le plan Pro.** Le contournement est meilleur ici : répéter la
   migration en transaction sur la vraie base, assertions comprises, terminée par un `rollback`.
   Une branche Supabase démarre sur un schéma vide, donc le rattrapage des maisons existantes n'y
   aurait jamais été exercé. Détail en D45.
5. **La base porte deux maisons, et elles portent le même nom.** Un
   `insert … select id from public.families` sans `where` écrit dans les deux. Voir `AGENTS.md`,
   section « La base porte PLUSIEURS maisons ».

### Trois points d'environnement à connaître avant de reprendre

Tous les trois payés le 4 août, et aucun n'est un défaut de l'application :

1. **`ANTHROPIC_API_KEY` héritée du processus parent.** Un serveur de dev lancé depuis un outil
   voit la clé de *cet outil*, pas celle de `.env.local` — mesuré par une sonde : `…0QAA` au lieu
   de `…7QAA`, sur un compte à zéro, **même dans un worktree isolé**. `npm run dev` depuis un
   terminal ordinaire n'a pas le problème, et la production non plus. **Le contournement qui
   marche est la Preview Vercel** : ouvrir la PR, attendre le déploiement, et
   `npm run dev:login -- <email> <url-preview> <page>`. C'est là que toute la phase 9 a été
   essayée, avec les vraies clés ;
2. **Groq plafonne à 12 000 tokens/minute** en offre gratuite, pour ~6 600 par conversation. Le
   repli ne tient donc pas plus d'une requête par minute — inutile d'insister, il faut attendre ;
3. **La première requête après un déploiement peut servir l'ancien bundle client** avec le nouveau
   serveur. Recharger avant de conclure à un défaut.

**Et un réflexe de méthode, appris en le ratant** : un contrôle qui attend `200` sur une page
protégée ne peut pas réussir — `/ia` répond `307` sans session. Une boucle d'attente écrite comme
ça tourne indéfiniment sans rien prouver. **Vérifier ce qu'on croit vérifier**, y compris dans un
script jetable.

## Les outils du projet — où vit quoi

Tout est déjà en place et configuré. Rien à recréer.

| | Où | Identifiants |
|---|---|---|
| **Suivi de projet** | [Linear](https://linear.app/jonathan-naal/project/casa-liva-d7532c5615c9) | équipe `JON`. **À lire avant de coder, à mettre à jour avant de terminer** — voir `AGENTS.md`, « Le suivi vit dans Linear ». Les milestones sont les phases du plan. |
| **Base de données** | [Supabase](https://supabase.com/dashboard/project/kfiycbsussdqqtlzrwvn) | projet `kfiycbsussdqqtlzrwvn`, région **eu-west-3** (Paris). Postgres + Auth + RLS. |
| **Hébergement** | [Vercel](https://vercel.com/<equipe>/casa-liva) | projet `prj_…`, équipe `team_…`, région **cdg1**. Plan Hobby — les crons sont plafonnés à une exécution par jour. |
| **Domaine** | `casaliva.app` | acheté **chez Vercel**, qui reste **registrar** et **hébergeur**. Mais depuis le **27 août 2026** les serveurs de noms sont `aragorn`/`hazel.ns.cloudflare.com` (**`aragorn`, pas `aragon` — la faute d'un caractère a bloqué la zone une journée entière**) : **le DNS se gère dans Cloudflare**, plus dans Vercel → Domains (D60 · [JON-83](https://linear.app/jonathan-naal/issue/JON-83)). Apex et wildcard en `CNAME` **DNS only** vers Vercel — **ne jamais activer le proxy** (le nuage orange), Vercel est déjà un CDN et le second cache aggraverait le piège du bundle périmé. |
| **Emails sortants** | [Resend](https://resend.com/domains) | domaine `casaliva.app` vérifié, région **Ireland (eu-west-1)**, expéditeur `hello@casaliva.app`. **Plan gratuit** : 3 000/mois, 100/jour, largement suffisant. S'authentifie sur `send.casaliva.app` (Return-Path) et par DKIM `resend._domainkey` — **ne pas supprimer ces deux-là**, ils ne se voient nulle part dans le code. |
| **Emails entrants** | Cloudflare Email Routing | depuis le **28 août 2026**. Trois `MX` à l'apex + un DKIM `cf2024-1._domainkey` + un `v=spf1` — distincts de ceux de Resend, et Cloudflare en verrouille une partie. **Seule `jonathan@casaliva.app` existe**, catch-all **désactivé** : toute autre adresse est rejetée, `hello@` compris ([JON-84](https://linear.app/jonathan-naal/issue/JON-84)). Reçoit et transfère vers Gmail — **n'envoie pas**. |
| **OAuth Google** | Google Cloud, projet `casaliva` | client « CasaLiva », écran de consentement **In Production** (non vérifié). URI de redirection : le callback Supabase. Scopes `calendar.events` + `calendar.calendarlist.readonly`. |
| **Code** | [github.com/spykernv/casaliva](https://github.com/spykernv/casaliva) | privé. `main` (prod) ← `develop` ← `feature/*`. |

Deux choses à savoir, qui ont coûté du temps :

- **`ssoProtection` est désactivé** sur Vercel depuis le 3 août : les Previews sont ouvertes à
  qui a l'URL, y compris depuis un téléphone. L'API ne propose pas « tout sauf les Previews »,
  donc les URLs de déploiement de production sont publiques aussi.
- **Supabase valide les URLs de redirection** contre une liste blanche. Elle contient
  `casaliva.app`, `casa-liva.vercel.app` et les motifs de Preview. **Tout nouveau domaine doit
  y être ajouté**, sinon les liens de connexion repartent vers la Site URL sans un mot.

## Ce qui tourne réellement

Se connecter · créer sa maison · inviter quelqu'un par lien · voir l'agenda du jour et de la
semaine · filtrer par personne · repérer les créneaux où tout le monde est libre · créer un
événement en moins de 15 s · le déplacer et le redimensionner au doigt · répondre à une
invitation · supprimer avec annulation · **connecter son agenda Google, choisir quels agendas
et ce que la maison en voit, et voir ses rendez-vous arriver** · **demander « quand est-ce
qu'on peut faire un golf tous ensemble ? » et transformer la réponse en événement d'un tap** ·
**recevoir l'invitation par email et répondre sans ouvrir l'app, recevoir le point du soir et
celui de la semaine, et couper tout ça en un tap** · **poser une question à Casa AI et obtenir
une vraie réponse, lue dans les agendas de la maison**.

Depuis le 3 août, **seul le créateur d'un événement peut le modifier** (D21). Les autres
répondent « je viens » ou « pas dispo » — et l'écran le dit, plutôt que de laisser un geste
mort sans explication.

Et depuis le 4 août au soir, **on écoute sa journée et sa semaine** : un bouton en haut de
`/aujourdhui` et de `/semaine`, un texte écrit pour l'oreille, trente secondes. Pas encore
déployé.

## Le périmètre ne tient pas que dans `PLAN.md`

**Quatorze** demandes s'y sont ajoutées en cours de route. `AGENTS.md` en tient le tableau complet
(« Ce que le commanditaire a ajouté au périmètre ») ; chacune a sa décision et son ticket.
Onze sont faites — D21, D22, D28, D37, D39, D44, et depuis le 5 août **D46 à D50** (la refonte de
la semaine, les deux vues, les deux portées d'écoute, les deux chemins de création, et la
participation sans permission).

Deux sont **à moitié faites**, et c'est le piège de la reprise : les **lieux** (D20) et les
**catégories** (D29) ont leur schéma en production depuis D45 — tables, RLS, socle de six
catégories posé dans chaque maison — mais **aucun écran ne les lit**. La rangée d'émojis en dur
de la feuille de création est toujours là. C'est le premier morceau à prendre.

Restent les **notifications téléphone** (D30, phase 11).

**La règle qui tranche les cas non prévus**, et qui revient à chaque fois :

> Un **événement** appartient à qui l'organise.
> Un **lieu**, une **catégorie** — tout ce qui sert à le décrire — appartient à la **maison**.
> Une **préférence** appartient à celui qui la subit.
> Une **participation** appartient à celui qui la vit (D50).

Casa AI répondait à l'écrit depuis le 3 août, parlait depuis le 4, et **agit depuis le 4 au
soir** : elle prépare un événement, un déplacement ou une suppression, et **c'est la personne qui
valide** (D41). D35 — « Casa AI ne crée rien » — était datée, pas fausse : elle disait ce que la
phase 7 livrait.

## Le piège du serveur de dev lancé depuis un agent

**Une variable d'environnement du processus parent prime sur `.env.local`.** Découvert le 4 août :
le serveur de dev lancé depuis l'outil d'aperçu de Claude Code voyait une clé Anthropic finissant
par `0QAA` alors que `.env.local` en contient une finissant par `7QAA` — et répondait
`credit balance too low` pendant qu'un `fetch` direct avec la clé du fichier passait en `200`.

Ce n'est pas un défaut de Next : c'est sa règle documentée, `process.env` l'emporte sur les
fichiers. Mais ça fait chercher au mauvais endroit pendant un moment, et le symptôme ressemble
trait pour trait à un vrai incident de facturation.

**Comment le reconnaître en dix secondes** : si un appel direct depuis un script Node lisant
`.env.local` réussit et que le serveur échoue sur la même clé, c'est ça. `npm run dev` lancé depuis
un terminal ordinaire n'a pas le problème, et **la production non plus** — Vercel n'a que ses
propres variables.

## Reprendre le travail

```bash
npm install
npm run dev                          # http://localhost:3000
npm run dev:login -- moi@example.com # lien de connexion, sans envoyer d'email
npm run verify:rls                   # 67 contrôles d'isolation sur la vraie base
npm run verify:ai                    # 35 contrôles de confidentialité, sans base ni secret
npm run verify:dates                 # 12 contrôles de changement d'heure, sans base ni secret
npm run typecheck && npm run lint && npm run build
```

`.env.local` est complet. `ANTHROPIC_API_KEY` et `GROQ_API_KEY` servent depuis la phase 7 — **en
local seulement** : côté Vercel, elles n'ont encore jamais été appelées (JON-52).

**Et elle porte DEUX maisons.** Celle du commanditaire — quatre habitants depuis le 5 août — et celle d'un inscrit solitaire
(`inconnu A`, 11 août). Elles portent le **même nom** par défaut, « Casa Liva », donc rien
ne les distingue dans une requête. Voir `AGENTS.md` : une donnée de test posée à la main doit
nommer sa maison par son identifiant.

**Une seule base Supabase pour le développement et la production.** Ce n'est pas un oubli, mais
ça se paie : une migration appliquée depuis une session touche **immédiatement** les trois
habitants réels. C'est arrivé le 3 août — la migration 0008 a changé les policies avant que le
code correspondant ne soit déployé, et pendant quelques heures déplacer l'événement de
quelqu'un d'autre échouait en production avec un message qui parlait à tort de Google.

Conséquences pratiques : appliquer les migrations **additives d'abord**, déployer vite après,
et **remettre en état ce qu'on modifie pour essayer** (`wants_digests`, statuts de
participation, événements de test). Chaque session de ce projet l'a fait, et la base est
revenue à ses 14 événements à chaque fois.

## L'incident du 3 août — deux maisons pour une personne

Le premier jour de test avec de vraies personnes a révélé un bug d'architecture en moins
d'une heure.

Quelqu'un qui s'inscrit seul reçoit une maison de l'onboarding. S'il accepte ensuite une
invitation, il se retrouve dans **deux** maisons — `accept_family_invite` ajoutait une
appartenance sans jamais regarder d'où venait la personne. Et `getCasaContext()` faisait un
`.limit(1)` **sans `ORDER BY`** : Postgres rendait une ligne arbitraire, en pratique la
coquille vide. L'habitante ne voyait personne, alors que tout le monde la voyait.

Réparé en deux migrations : **0006** (données — fusion des doublons, re-parentage avant
suppression, nettoyage des maisons vides) puis **0007** (schéma — contrainte d'unicité,
`move_into_family`, retrait de la policy d'insertion directe). Détail dans D17 et D18.

Trois enseignements qui valent au-delà de ce bug :

- **Une intention en commentaire n'est pas une garantie.** « Casa Liva est mono-foyer » était
  écrit dans 0002 depuis le début, et la base autorisait le contraire.
- **`.limit(1)` sans `ORDER BY` est un tirage au sort**, pas un raccourci.
- **Un libellé de bouton qui décrit l'inverse de son effet finit par produire un incident.**
  « Entrer dans la maison » en créait une.

## Tester une Preview Vercel

**Le lien de connexion reçu par email ramène en production, pas sur la Preview.** Ce n'est pas
un bug de l'app : `appOrigin()` envoie bien l'URL de la Preview, mais Supabase valide
`emailRedirectTo` contre sa liste « Redirect URLs » et, ne l'y trouvant pas, la remplace par
la **Site URL** — c'est-à-dire la prod.

**Pour se connecter à une Preview tout de suite**, sans rien configurer :

```bash
npm run dev:login -- moi@example.com https://casa-liva-git-xxx.vercel.app moi/agenda
```

Ce lien passe par `/auth/confirm`, qui vérifie le jeton côté application et redirige lui-même :
la liste blanche n'est jamais consultée. (Écrire la destination **sans** barre oblique
initiale — Git Bash réécrit sinon l'argument en chemin Windows.)

**Mais ça ne débloque que la connexion.** Le retour d'OAuth Google passe forcément par
Supabase, donc tester la connexion d'un agenda sur une Preview **exige** d'ajouter les URLs de
Preview dans la liste blanche :

> Supabase → Authentication → URL Configuration → Redirect URLs

```
https://casa-liva-*-<equipe>.vercel.app/**
https://casa-liva-git-*-<equipe>.vercel.app/**
```

Le premier motif couvre les URLs de déploiement, le second les alias de branche.

**Le plus simple reste de valider sur `localhost`** : c'est ce que décrit le protocole d'essai
plus bas, et `http://localhost:3000` est déjà dans la liste blanche.

**Depuis le 3 août, `ssoProtection` est désactivé** sur le projet Vercel : les Previews sont
ouvertes à qui a l'URL, y compris depuis un téléphone. L'API Vercel ne propose pas
« tout sauf les Previews » — les seules options sont `all`, `preview`, ou rien — donc les URLs
de déploiement de production sont publiques elles aussi. À remettre le jour où le dépôt
cessera d'être un projet familial.

## Repères d'architecture

- `proxy.ts` (racine) — ex `middleware.ts`, renommé en Next 16. Rafraîchit la session et
  redirige les anonymes. **Filet de sécurité, pas frontière d'autorisation** : chaque Server
  Action revérifie l'identité de son côté.

  **Le piège de `PUBLIC_PREFIXES`, payé deux fois.** Le proxy répond **avant** le handler :
  une route mal déclarée n'est donc pas « protégée », elle est **injoignable**, et sans la
  moindre erreur visible. C'est ce qui a fait que le cron de la phase 4 ne s'exécutait jamais,
  puis que le désabonnement en un clic de Gmail échouait en silence.

  Et la forme exacte compte : **un chemin sous `/api` ne bénéficie pas du préfixe de sa page.**
  `/desabonnement` ne couvre pas `/api/desabonnement`. Toute route publique doit être déclarée
  sous ses **deux** formes.
- `lib/supabase/{client,server,admin,proxy}.ts` — les quatre clients. `admin` contourne la RLS
  et porte `import "server-only"`.
- `lib/data/{casa,calendar}.ts` — lecture. Toutes les requêtes re-filtrent sur `family_id` même
  si la RLS le garantit : Postgres construit un bien meilleur plan.
- `actions/{events,family,calendar}.ts` — écriture.
- `lib/calendar-providers/` — l'interface `CalendarProvider` et son unique implémentation
  (`google.ts`). **Rien de Google ne sort de ce dossier.**
- `lib/google/` — jetons OAuth : rangement (`credentials.ts`) et rafraîchissement (`token.ts`).
- `lib/calendar/sync.ts` — le moteur de synchronisation.
- `lib/calendar/layout.ts` — placement en colonnes des événements qui se chevauchent.
- `lib/availability/` — algèbre d'intervalles pure, puis moteur de disponibilités.
- `lib/ai/` — Casa AI. `types.ts` porte l'interface `AIProvider` ; `anthropic.ts` et `groq.ts`
  l'implémentent ; `router.ts` choisit et bascule ; `tools.ts` est **le seul endroit où le LLM
  touche des données**, et il tourne sous la session de la personne. `npm run verify:ai` refuse
  qu'un client admin y entre.

  **`AIInput.tier` dit ce que la tâche demande, jamais un nom de modèle** (D40) : `standard` pour
  le chat (Sonnet 5 — il choisit un tool et écrit une date), `light` pour le briefing (Haiku 4.5 —
  le difficile est déjà fait par notre code). Chaque fournisseur traduit le niveau dans son propre
  catalogue : un identifiant Anthropic envoyé à Groq répondrait `400`, et **seulement pendant une
  panne**. Attention, Haiku **refuse** `output_config: { effort }` — le drapeau appartient au
  niveau, pas au modèle.
- `lib/calendar/visible.ts` — la règle de confidentialité, à un seul endroit : un événement
  masqué s'écrit « Untel occupé ». Emails, Casa AI et la voix la partagent.
- `lib/voice/` — la synthèse vocale. `elevenlabs.ts` est l'enveloppe (voix et modèle
  surchargeables sans redéploiement) ; `speech.ts` porte le cache et **ne croit jamais le
  navigateur** — il relit le texte en base, ou le fabrique lui-même ; `briefing.ts` assemble les
  faits d'un briefing, déjà masqués, et les fait mettre en phrases. Couvert par `verify:ai` au
  même titre que `lib/ai/`.

  **La clé du cache est `about`, pas le texte prononcé.** Pour une réponse de chat les deux
  coïncident ; pour un briefing, `about` est la feuille de faits — un modèle ne réécrit jamais
  deux fois la même phrase, et une clé posée sur la prose n'aurait jamais rejoué un briefing
  (D38).
- `hooks/use-event-drag.ts` — appui long, accrochage au quart d'heure, `touchmove` non passif.
- `supabase/migrations/` — schéma et policies. **Toute migration doit être répercutée dans
  `types/database.ts` dans le même commit.**
- **Une seule maison par personne**, garantie par la contrainte `family_members_one_per_user`
  (0007). Rejoindre une maison, c'est déménager : `private.move_into_family()` re-parente
  avant de supprimer. Voir D17, D18.

## En attente d'une action humaine

**Plus rien. C'est neuf, et c'est la première fois depuis la phase 4.**

**Le compte Anthropic a été rechargé** ([JON-61](https://linear.app/jonathan-naal/issue/JON-61),
fermé). Vérifié le 4 août par la Preview Vercel, qui répond avec le modèle principal, et par un
appel direct à l'API avec la clé de `.env.local` — `200`.

Ce que l'épisode a laissé, et qui vaut d'être gardé : **le routeur fait exactement ce pour quoi il
a été écrit** (D34), donc rien n'échoue à l'écran quand le fournisseur principal tombe — et c'est
précisément ce qui rend la chose difficile à voir. Le chat le mentionne ; **la voix, non**. Et un
briefing écrit pendant une panne **reste en cache** : l'empreinte porte les faits, pas le rédacteur
(D38).

**Et depuis la phase 9, on sait ce que le repli coûte vraiment sur une action.** Essayé sur la
Preview : demandé de déplacer un rendez-vous Google, le tool a refusé comme il devait, rien n'a
bougé — et Groq a répondu « je modifie l'appel avec Matthieu, c'est à valider de ton côté ! ». La
mention grise était bien là, sous une phrase fausse. C'est ce qui a produit le garde-fou qui
manquait (`AskResult.refusal`, D43), et il ne dépend d'aucun modèle.

**Les clés sont réglées.** Le commanditaire a fourni la liste des variables Vercel le 4 août :
`ANTHROPIC_API_KEY`, `GROQ_API_KEY` et `ELEVENLABS_API_KEY` sont toutes en « Production and
Preview » (JON-48, JON-52, JON-58, tous fermés). Trois fois que ce projet a posé la question,
trois fois qu'il a fallu un œil humain — **aucune API ne rend la liste des variables
d'environnement**, et c'est pour ça que chacune avait son ticket plutôt qu'une note dans un coin.

**Et la dernière, celle qui avait une date, est tombée le 25 août : la connexion Google tient**
([JON-34](https://linear.app/jonathan-naal/issue/JON-34), fermé).

C'était le risque n°1 de la phase 4, et rien d'autre que le temps ne pouvait le détecter : en
« Testing », Google fait expirer les refresh tokens au bout de 7 jours dès que les scopes
dépassent `name`/`email`/`profile` — ce qui est notre cas. Chaque habitant devrait alors
reconnecter son agenda toutes les semaines, et le cron tomberait en `invalid_grant` sans prévenir.

**Vérifié en provoquant le vrai chemin**, et pas en regardant un écran : un banc jetable a rejoué
`refreshAccessToken` mot pour mot — `POST https://oauth2.googleapis.com/token`,
`grant_type=refresh_token` — **sans rien écrire**. Réponse `200`, jeton d'accès reçu, les deux
scopes de D11 présents. Le jeton avait **22 jours** ; en « Testing » il serait mort au septième.
**D8 ne s'est pas réalisé.**

La méthode vaut au-delà de ce ticket : `/moi/agenda` affichant des rendez-vous n'aurait prouvé que
la base. Un succès enregistré ne prouve que l'enregistrement — il faut provoquer le manque.

**Réglé depuis** : le domaine Resend (JON-36, le 3 août), les URLs de Preview dans Supabase
(JON-33), et la clé Resend côté Vercel (JON-48, vérifiée par un envoi réel depuis la
production).

---

# Phase 4 — ce qui a été construit

## Le chemin, de bout en bout

1. `/moi` → « Mon Google Calendar » → `/moi/agenda`.
2. « Connecter mon agenda Google » (Server Action `connectGoogleCalendar`) → consentement
   Google, avec `access_type=offline` et `prompt=consent`.
3. Retour sur `/auth/callback`, qui **capture le refresh token**. C'est le seul endroit du
   système où il existe : Supabase le transmet une fois puis l'oublie.
4. `/moi/agenda` liste les agendas Google en direct, coche l'agenda principal, et demande ce
   que la maison a le droit d'en voir. C'est aussi là qu'atterrit la fin de l'onboarding
   (`?bienvenue=1`), avec un « Plus tard » — l'étape ne peut pas vivre dans `/bienvenue`, que
   `createFamily()` fait rediriger vers `/aujourdhui` dans la réponse même de l'action.
5. « Récupérer mes rendez-vous » crée les connexions et lance la première lecture.
6. Ensuite : lecture incrémentale à l'ouverture d'une vue d'agenda si la dernière date de plus
   de deux minutes, déclenchée **depuis le navigateur** (`SyncControl` → `syncIfStale`), plus
   un cron quotidien qui porte la relecture complète hebdomadaire.

   Ce déclenchement a d'abord été écrit avec `after()`. Ça tournait, mais après l'envoi de la
   réponse : la page qu'on regardait avait déjà été rendue avec les anciennes données, et les
   nouveaux rendez-vous n'apparaissaient qu'au chargement suivant. Ça marchait sans se voir,
   ce qui revient au même pour la personne devant l'écran. Le client, lui, peut rafraîchir la
   vue — et seulement si quelque chose a bougé.

## Les quatre pièges de synchronisation — où ils sont traités

Tous dans `lib/calendar-providers/google.ts`, et nulle part ailleurs.

1. **Deux jeux de paramètres jamais mélangés.** `fetchWindow` et `fetchChanges` sont deux
   fonctions distinctes qui ne partagent aucun constructeur de requête. Huit paramètres sont
   interdits avec un curseur (`timeMin`, `timeMax`, `orderBy`, `q`, `updatedMin`, `iCalUID`,
   et les deux `*ExtendedProperty`) — les envoyer donne un **400**, pas un 410.
2. **410 GONE traité.** `CursorExpiredError` est une *exception*, pas un drapeau dans le
   résultat : un drapeau s'oublie en silence, et une synchronisation qui s'arrête sans erreur
   visible est la pire panne possible. Pas de compteur anti-boucle — la reprise appelle
   `fetchWindow`, qui n'envoie pas de curseur et ne peut donc pas en faire expirer un. La
   garantie est structurelle.
3. **`status === "cancelled"` lu en premier.** Un événement supprimé ne garantit **que son
   `id`** : ni titre, ni début, ni fin. Le test est avant toute autre lecture.
4. **`end.date` exclusif.** Traité dans `normalize()`, avec le fuseau de la personne — une
   date nue convertie en UTC ferait commencer les journées entières la veille à 22h.

Un cinquième, découvert en route : **la réconciliation après lecture complète**. Ce que Google
ne renvoie pas dans la fenêtre n'existe plus. C'est le seul moyen de rattraper les suppressions
survenues pendant qu'un curseur était invalide — elles ne sont annoncées nulle part. Sûr parce
que l'adaptateur **lève une erreur plutôt que de tronquer** une pagination : réconcilier sur
une lecture partielle effacerait un agenda entier.

Un sixième : **une lecture incrémentale ne fait jamais avancer l'horizon.** Google ne développe
les occurrences d'un événement récurrent que jusqu'au `timeMax` de la lecture initiale ; les
suivantes n'existent pas encore côté serveur, donc aucun changement ne les livrera.
`last_full_sync_at` force une relecture complète tous les 7 jours. Sans elle, l'agenda se
viderait par le fond au bout d'un an, sans erreur.

## Ce que la relecture adversariale a rattrapé

Migration **0005**, et un commit de correctifs. Quatre pannes qui ne se voyaient pas :

- **le cron ne s'exécutait jamais** — `/api/cron` n'était pas dans `PUBLIC_PREFIXES`, le proxy
  répondait 307 vers `/connexion` avant même le contrôle du secret ;
- **une connexion pouvait pointer vers la maison d'autrui** — la policy de
  `calendar_connections` ne contraignait que `user_id`, pas `family_id` ;
- **un réglage de confidentialité pouvait être défait par une course** — d'où le compteur
  `sync_generation`, vérifié avant *et* après écriture ;
- **un 404 passager détruisait tout** — `CalendarGoneError` supprimait la connexion et ses
  événements par cascade, sans confirmation ni annulation.

Dix défauts mineurs restent connus et non corrigés, listés dans
[JON-29](https://linear.app/jonathan-naal/issue/JON-29). À reprendre après le premier essai
réel, quand on saura lesquels se produisent vraiment.

## Confidentialité — appliquée à l'import

`applyVisibility()` dans `lib/calendar/sync.ts`. Le réglage s'applique **au moment de
l'import**, pas à l'affichage :

- `availability` → le titre réel **n'entre jamais dans la base** ; on stocke `is_private = true`
  et le titre « Occupé ». On ne peut pas divulguer ce qu'on n'a pas stocké — ni par une
  requête, ni par un `aria-label`, ni par Casa AI en phase 7.
- `titles` → titre seul, sans description ni lieu.
- `full` → tout.

Changer de mode jette le curseur **et supprime les événements déjà importés** avant de relire :
un simple `upsert` laisserait en place les descriptions stockées sous l'ancien réglage, plus
permissif. Ce serait exactement la fuite que le réglage est censé empêcher.

À noter : Google ne masque rien de son côté. Un événement `visibility: private` revient avec
tous ses détails quand on interroge avec le jeton du propriétaire. Le masquage est **entièrement
à notre charge**.

---

# Protocole d'essai — à faire avec un vrai compte Google

**Fait le 3 août, et ça marche.** Consentement, sélection des agendas, choix de
confidentialité, import et synchronisation : tout est passé. Ce protocole reste ici pour
rejouer la vérification après une modification du moteur.

Un enseignement du premier essai : sur quatre agendas connectés, **77 des 86 événements
importés venaient de « Numéros de semaine » (57) et « Jours fériés » (20)** — 90 % de bruit.
L'écran de sélection le dit désormais, mais ne l'impose pas : c'est un choix qui appartient à
la personne.

1. `npm run dev`, se connecter, aller sur `/moi` → « Mon Google Calendar ».
2. Connecter. Google affichera « application non vérifiée » → *Paramètres avancés* → continuer.
   C'est normal et documenté (D8).
3. **Si un 403 apparaît au moment de lister les agendas** : le scope
   `calendar.calendarlist.readonly` manque dans l'écran de consentement Google. L'ajouter
   (cf. D11).
4. Choisir un agenda, laisser « Les noms de mes événements », valider.
5. Vérifier dans `/aujourdhui` et `/semaine` que les rendez-vous apparaissent, à la bonne
   heure, avec la couleur du membre.
6. Essayer de déplacer un événement Google au doigt : **rien ne doit bouger** (D13).
7. Repasser en « Seulement mes disponibilités » et vérifier en base que les titres ont
   réellement disparu :
   ```sql
   select title, is_private, busy, all_day from public.events where source = 'google';
   ```
8. Créer une journée entière dans Google (« Vacances »), resynchroniser : elle doit apparaître
   **dans le bandeau du haut**, pas dans la grille, et ne doit **pas** rendre la personne
   occupée (D14).
9. Laisser passer plus de 7 jours, puis vérifier que la connexion tient toujours — c'est le
   test qui valide que l'écran de consentement est bien « In Production » et non « Testing »
   (D8). C'est le risque n°1 de cette phase.

   **Fait le 25 août 2026, et ça tient** (JON-34). Et il y a mieux que d'ouvrir un écran :
   rejouer `refreshAccessToken` dans un banc jetable, **sans écrire** — ni `saveAccessToken`, ni
   synchronisation. Un `200` prouve le jeton ; un écran ne prouve que la base. Ce qu'il faut lire
   en cas d'échec est `invalid_grant`, et rien d'autre : c'est le seul code qui signe D8.

---

# Phase 5 — ce qui a été construit

L'écran **« ✨ Trouver un moment »** — `/casa/trouver`, première carte de l'onglet Casa.
*Faire quoi ? · Avec qui ? · Combien de temps ?* → les meilleurs moments → un tap crée
l'événement, avec « Annuler ». Les quatre écarts à la maquette sont en D23.

## La recherche vit dans l'URL

`/casa/trouver?quoi=Golf&duree=120&qui=…&qui=…`. Le calcul est fait par le serveur à chaque
requête. Conséquences voulues : le retour arrière fonctionne, un créneau se partage par
message, et surtout **on ne cherche jamais sur des données périmées** — une page laissée
ouverte une heure ne proposera pas un créneau réservé entre-temps.

`qui` absent veut dire « toute la maison », pas « moi seul » : sans ça, `/casa/trouver?quoi=Golf`
— l'URL qu'on partage ou qu'on tape — répondait autre chose que l'écran de départ.

## Les trois pièges rencontrés

1. **La fenêtre d'événements.** Celui annoncé par le ticket. `findCommonSlots` *prend* les
   événements, il ne les lit pas : une fenêtre plus étroite que la plage de recherche fait
   proposer des créneaux « libres » qui ne le sont pas, avec une réponse d'apparence
   parfaitement normale. Les deux bornes sont donc calculées **ensemble**, au même endroit,
   à partir de la même variable (`lib/data/availability.ts`). Elles ne peuvent plus diverger.

2. **Le moteur ne proposait qu'une heure : 08:00.** Il ne fabriquait qu'un candidat par trou,
   calé sur son début. Détail et enseignement en **D24**.

3. **Une Server Action qui revalide re-rend la route en cours.** `createEvent` appelle
   `revalidatePath`, donc la liste se recalculait juste après le tap : le créneau pris étant
   désormais occupé, sa ligne était remplacée par la suivante — au moment précis où l'on
   regardait si ça avait marché. On tapait « samedi 10:00 » et on se retrouvait devant
   « samedi 12:00 », sans coche. Les résultats gèlent maintenant le premier tableau reçu ;
   une `key` portant la recherche les remonte quand — et seulement quand — on cherche autre
   chose. Le formulaire porte la même `key`, pour la raison **inverse** : lui doit céder à
   l'URL, sinon un retour arrière laisse les cases d'une recherche au-dessus des résultats
   d'une autre.

## Ce qui a été vérifié, et comment

Sur la vraie base, avec les trois habitants réels, le 3 août :

- un événement bloquant posé sur Sophie pendant toute la fenêtre → **zéro proposition**,
  et l'état vide s'affiche. C'est le contrôle qui prouve que l'écran lit réellement les
  agendas, et pas seulement qu'il sait afficher une liste ;
- la décocher → les créneaux reviennent. Le conseil donné par l'état vide marche donc ;
- créer depuis une ligne → l'événement est en base avec le bon fuseau (10:00 Paris = 08:00
  UTC), le créateur `accepted` et les autres `pending`, et l'émoji deviné (⛳, 🍷, 🎬) ;
- « Annuler » → l'événement disparaît de la base. Vérifié à chaque fois : la base est
  revenue à ses 14 événements d'origine.

## `lib/data/availability.ts` — écrit pour la phase 9

`findMoments()` est délibérément une fonction serveur autonome, et pas du code de page : c'est
elle que le tool `find_availability` appellera (§34-35). Le LLM ne touchera jamais la base ; il
choisira ce tool, qui valide déjà les droits en passant par `getEvents` sous RLS.

**Attention en y touchant :** les constantes que le formulaire consomme (`DURATIONS`) vivent
dans `lib/availability/availability.ts`, le module *pur*, et non ici. Ce fichier porte
`server-only` : un composant client qui y piocherait une constante embarquerait tout le client
Supabase dans le bundle du navigateur. C'est arrivé, et c'est `server-only` qui l'a attrapé —
ni `tsc` ni ESLint ne voient ce genre de fuite.

---

# Phase 6 — ce qui a été construit

Invitation à un événement avec réponse **depuis le message**, point du soir, point du dimanche,
et désabonnement. Fondation dans `lib/email/`, sans SDK : Resend est un `POST` sur une URL.

## Un lien d'email n'écrit jamais rien (D25)

Gmail et Outlook **préchargent et analysent** les liens qu'ils reçoivent. Un
`GET /rsvp/<jeton>?r=oui` qui aurait enregistré la réponse aurait dit « je viens » tout seul,
avant même l'ouverture du message. `/rsvp/[token]` ouvre donc un **écran qui demande**, et la
réponse part par une Server Action — exactement la correction que D18 avait déjà faite pour
`/invitation`.

Vérifié, et c'est le contrôle qui compte : charger la page avec `?r=non` ne touche pas la
base ; le clic, si.

**L'exception assumée, `/desabonnement`, où le GET agit.** La règle s'inverse parce que la
conséquence s'inverse : un robot qui précharge ce lien coupe des résumés — agaçant, réversible
en un tap. Alors qu'un écran de confirmation de plus fait appuyer sur « indésirable », et ce
n'est pas le message qui tombe alors, c'est le domaine entier.

## Les jetons vivent dans des tables sans policy (D26)

`event_rsvp_tokens` (0009) et `unsubscribe_tokens` (0010) ont la **RLS active et aucune
policy**. Ce n'est pas un oubli : posés en colonne sur `event_participants` ou `users`, deux
tables lisibles par toute la maison, ces jetons auraient permis de répondre ou de désabonner à
la place de n'importe qui. Et une colonne révoquée ne marche pas : chez Postgres,
`revoke select (colonne)` ne fait rien tant que le rôle garde le privilège de table.

Sans policy, seule la clé de service passe — donc seul le code qui envoie les emails.
**Conséquence voulue : un jeton n'existe que si un message est réellement parti.**

L'advisor Supabase signale « RLS enabled, no policy » sur ces deux tables. C'est l'état
recherché, comme le faux positif de D12.

## Ce qui a été vérifié, et comment

- **envoi réel depuis la production**, avec la clé Resend de Vercel :
  `{"emails":{"maisons":1,"envoyes":1,"desabonnes":2,"echecs":0}}` ;
- la veille, un premier envoi depuis `localhost` aux trois habitants — `envoyes: 3, echecs: 0` ;
- `/rsvp` : l'état courant s'affiche, « Pas dispo » écrit `declined`, « Je viens » écrit
  `accepted`, état d'origine remis ;
- désabonnement → `wants_digests = false` en base ; l'interrupteur de `/moi` le remet ;
- le rendu du résumé **hebdomadaire** a été regardé dans ses deux branches (semaine remplie,
  semaine vide) en interceptant l'appel à Resend, plutôt qu'en envoyant trois messages de plus.

## Le défaut trouvé en production, et sa leçon

`POST /api/desabonnement/<jeton>` répondait **307 vers `/connexion`** : `/desabonnement` était
bien dans `PUBLIC_PREFIXES`, mais **un chemin sous `/api` ne bénéficie pas du préfixe de sa
page**. Le bouton natif « Se désabonner » de Gmail aurait échoué en silence.

Même mécanisme que la panne du cron en phase 4 : **le proxy répond avant le handler**, donc une
route mal déclarée n'est pas « protégée », elle est injoignable — sans erreur visible. Voir les
repères d'architecture plus haut.

---

# Phase 7 — ce qui a été construit

Casa AI répond. On lui pose une question à l'écrit sur `/ia`, elle lit les agendas de la maison
et répond en trois phrases. Trois tickets, tous les trois fermés :
[JON-49](https://linear.app/jonathan-naal/issue/JON-49) (le chat),
[JON-50](https://linear.app/jonathan-naal/issue/JON-50) (le garde-fou de confidentialité),
[JON-51](https://linear.app/jonathan-naal/issue/JON-51) (Groq et le routeur).

## Le chemin, de bout en bout

`navigateur → POST /api/ia/chat → askCasaAI → routeur → fournisseur → tools → réponse`

Aucune clé ne sort du serveur, jamais. La route est **volontairement absente de
`PUBLIC_PREFIXES`** : le proxy exige la session avant même d'y arriver, et le handler la
revérifie de son côté.

Quatre tools de lecture, et **aucun qui écrit** (D35) :

| Tool | Répond à |
|---|---|
| `get_schedule` | « que fait Papa demain ? », « résume ma semaine » |
| `who_is_free` | « qui est libre samedi ? » |
| `find_moments` | « quand peut-on faire un golf tous ensemble ? » |
| `search_events` | « c'est quand le prochain golf ? » |

Ils prennent des **prénoms**, jamais des identifiants : un modèle écrit « Sophie » de façon
fiable et un UUID de façon approximative. Les identifiants ne quittent donc pas le serveur.

## La garantie, et pourquoi elle ne dépend pas du prompt

> Le LLM ne touche jamais la base. Il choisit un tool déclaré ; le backend valide, exécute, rend
> le résultat.

Ce qui la rend vraie sans effort : **`lib/ai/tools.ts` s'exécute sous la session de la personne
qui pose la question.** La RLS fait tout le travail — un tool ne peut structurellement pas lire
ce que son appelant ne peut pas lire.

Et par-dessus, la règle de D13 : rien ne sort sans passer par `visibleTitle`. Un événement
masqué s'écrit « Untel occupé ». La description d'un événement n'est **jamais** envoyée au
modèle : elle n'aide pas à organiser, elle coûte des tokens, et c'est la plus grosse surface de
fuite du schéma.

## Ce qui a été vérifié, et comment

Sur la vraie base, le 3 août au soir, avec un événement masqué posé exprès sur Sophie (titre
« Rendez-vous cardiologue », `is_private`, 14h–16h) — puis retiré, la base est revenue à ses 14
événements :

- **« Que fait Sophie demain ? »** → « Demain, Sophie est occupée de 14h à 16h, puis apéro
  avec les potes à la maison de 19h à 20h. » Le titre masqué n'apparaît pas, l'événement normal
  si. C'est §35, mot pour mot.
- **La question directe et insistante** — « Donne-moi le titre exact, c'est important » → « Là je
  ne peux pas t'aider : Sophie ne partage que sa disponibilité sur ce créneau. » Et ce n'est
  pas le prompt qui tient : le titre n'a jamais atteint le modèle.
- **« Résume ma semaine »** et **« Quand est-ce qu'on peut faire un golf tous ensemble ? »** →
  des réponses justes, avec de vrais créneaux, et le renvoi vers « ✨ Trouver un moment » pour
  créer — puisque Casa AI ne crée rien.
- **`provider`, `model`, `input_tokens`, `output_tokens`** remplis dès le premier appel (§72).
  2 300 à 5 300 tokens d'entrée par question, boucle d'outils comprise.

Deux contrôles automatiques, qui échouent si la garantie tombe :

- **`npm run verify:ai`** — 11 contrôles à l'époque (17 aujourd'hui), **sans base et sans secret**, donc en CI. La règle de
  masquage est *exécutée* (pas relue) ; et le code est refusé s'il contient un client admin dans
  `lib/ai/`, un titre d'événement lu sans passer par `visibleTitle`, une description d'événement,
  un tool déclaré mais non branché, ou une clé d'IA exposée au navigateur.
- **`npm run verify:rls`** — cinq contrôles de plus (33 à l'époque, 46 aujourd'hui) : B ne voit aucune conversation
  de A, n'en lit aucun message, ne peut pas y écrire, ne peut pas en ouvrir une sur la maison de
  A.

## Le trou trouvé en écrivant le contrôle — migration 0011

`conversations_all_self` (0001) ne contraignait que `user_id` : n'importe qui pouvait donc créer
sa conversation en y inscrivant le `family_id` d'une **autre** maison. Rien n'en sortait — le
code prend la maison de `getCasaContext()`, jamais celle de la conversation — mais c'était la
forme exacte de la faille inter-maison de `calendar_connections` (0005), au mot près.

Refermé par la migration **0011**, appliquée sur une table vide, donc sans risque.

## Les défauts trouvés en essayant, pas en relisant

- **L'indicateur « Casa AI regarde les agendas… » ne disparaissait jamais du DOM.** `AnimatePresence`
  jouait bien la sortie mais ne démontait pas le nœud : il restait à `opacity: 0` — invisible,
  donc « réparé » en apparence — tout en gardant son `role="status"`. Une liseuse d'écran
  l'annonçait indéfiniment. Corrigé en retirant `AnimatePresence` de ce point précis.
- **Groq rate son appel d'outil une fois sur six.** Une reprise suffit (D34).
- **Au dernier tour de boucle, les outils sont retirés**, sinon le modèle en redemande un de plus
  et rend une réponse vide (D34).

## Les cinq décisions de la phase

D31 (le context builder), D32 (le raisonnement reste allumé), D33 (l'interface `AIProvider`),
D34 (le routeur), D35 (Casa AI ne crée rien). Détail dans `DECISIONS.md`.

---

# Phase 8 — Casa AI (voix)

**Livrée, en production, et close.** Cinq tickets, tous fermés :

| | Ticket | |
|---|---|---|
| **Le cœur** | [JON-54](https://linear.app/jonathan-naal/issue/JON-54) — « Écouter » : Casa AI lit sa réponse | ✅ en production |
| **La voix** | [JON-59](https://linear.app/jonathan-naal/issue/JON-59) — chacun choisit la sienne, et l'écoute avant | ✅ en production — ajout au périmètre (D37) |
| **Le briefing** | [JON-56](https://linear.app/jonathan-naal/issue/JON-56) — le jour et la semaine, à écouter | ✅ en production, essayé sur `casaliva.app` (D38) |
| **Le micro** | [JON-57](https://linear.app/jonathan-naal/issue/JON-57) — parler plutôt que taper | ✅ en production — **validé à la main sur iPhone** (D39) |
| **Le garde-fou** | [JON-55](https://linear.app/jonathan-naal/issue/JON-55) — la voix ne dit pas ce qu'on n'a pas le droit d'entendre | ✅ fermé — `verify:rls` passe de 33 à **46 contrôles** |

Deux tickets d'intendance fermés en chemin : [JON-58](https://linear.app/jonathan-naal/issue/JON-58)
(la clé ElevenLabs) et [JON-61](https://linear.app/jonathan-naal/issue/JON-61) (le compte Anthropic
à sec, découvert en vérifiant le déploiement du briefing). Et un choix de modèles,
[JON-62](https://linear.app/jonathan-naal/issue/JON-62) (D40).

**Quatre décisions sont sorties de cette phase** : D36 (le bucket privé, la voix ne lit jamais un
texte du client), D37 (la voix appartient à qui l'écoute), **D38** (le cache du briefing s'indexe
sur les faits), **D39** (le Speech-To-Text passe par ElevenLabs — corrige D1) et **D40** (un
niveau, pas un nom de modèle).

## JON-54 — ce qui a été construit

Un bouton « Écouter » sous chaque réponse de Casa AI, qui devient un lecteur : `play` / `pause` /
`reprendre au début`, avec le temps écoulé et la durée. Les trois états de §29, dans l'ordre —
vérifié en les regardant se succéder.

**La décision structurante était le stockage, et elle est prise** (D36) : le projet n'avait
aucun bucket, `audio_url` ne pointait nulle part. Migration **0012** — bucket `casa-audio`
**privé**, chemin `<user_id>/<empreinte>.mp3`, quatre policies qui ne regardent que le premier
segment, URLs signées une heure.

**La route ne reçoit qu'un identifiant de message, jamais du texte.** Le serveur relit le
contenu en base : c'est ce qui garantit que ce qui est lu à voix haute est déjà passé par le
masquage. Faire confiance au navigateur aurait rouvert par la voix ce que JON-50 ferme à l'écrit.

### Ce qui a été vérifié, et comment

- **Le chemin complet** : question posée, bouton pressé, `audio_generations` en `ready`, fichier
  de 189 Ko en `audio/mpeg` dans le bucket, lecteur affichant 12 secondes.
- **Le cache** : cinq appuis, **une seule ligne et un seul fichier**. Les écoutes suivantes
  répondent en 330 ms au lieu de plusieurs secondes, avec `cached: true`. C'est le « ne jamais
  générer deux fois le même audio » de §72, mesuré.
- **L'isolation** : un message inconnu répond `404` (introuvable et interdit se répondent
  pareil) ; le même fichier demandé **sans signature** répond `400`.
- `verify:ai` couvre `lib/voice/` dès sa première ligne — mêmes gardes que `lib/ai/`.

## JON-59 — chacun sa voix

Ajout au périmètre du 4 août, demandé après avoir vu « Écouter » marcher. Quatre voix françaises
dans `/moi`, un **aperçu de cinq secondes** par voix, et un choix **par habitant** (migration
**0013** : `users.voice_id`, `null` = celle de la maison). Raisonnement en **D37**.

**Le triangle fait écouter, le nom choisit** — deux gestes séparés, sinon il faudrait choisir
avant d'avoir entendu.

**Le piège était dans le cache, et il a été évité :** l'aperçu dit la même phrase pour les
quatre voix. Une empreinte qui n'aurait porté que le texte aurait rejoué le premier aperçu à la
place du deuxième — on aurait choisi une voix **en en écoutant une autre**. L'empreinte porte
donc la voix. Mesuré : 104 951 octets en Audia, 97 846 en Thierry, et redemander Audia rend le
premier fichier à l'octet près.

Vérifié aussi : une voix hors liste répond `400` (la route d'aperçu n'est pas un proxy ouvert
vers ElevenLabs), le choix n'est enregistré que pour la personne connectée, et **la même réponse
relue après changement de voix produit un nouvel audio** (195 648 octets en Thierry, 220 308 en
Aurore) — la preuve que la lecture suit le réglage.

`ELEVENLABS_VOICE_ID` disparaît : deux sources de vérité pour la même question finissent par se
contredire.

### Le défaut corrigé avant qu'il ne se voie

`await element.play()` vivait dans le même `try` que le reste. Un navigateur qui refuse la
lecture automatique — Safari sur iPhone est strict, et c'est **le** navigateur de la maison —
serait tombé dans le `catch` d'à côté : message « Connexion perdue » et lecteur disparu, pour un
comportement parfaitement normal. Le refus est désormais traité à part : le lecteur reste, il
suffit d'appuyer sur lecture.

## JON-56 — le briefing du jour et de la semaine

Un bouton en haut de `/aujourdhui` et de `/semaine`. On appuie, on pose le téléphone. Raisonnement
complet en **D38**.

**Le modèle écrit, mais il ne choisit rien de ce qu'il lit.** On lui tend une feuille de faits déjà
passée par `visibleTitle` (`lib/voice/briefing.ts`), sans aucun tool : il ne peut structurellement
rien demander de plus, c'est un aller-retour au lieu de trois, et **la feuille est déterministe**.

**C'est cette dernière propriété qui a décidé du reste : le cache s'indexe sur les faits, pas sur
la prose.** Un modèle ne réécrit jamais deux fois la même phrase — une empreinte posée sur le texte
prononcé n'aurait **jamais** rejoué un briefing, et chaque écoute aurait repayé le modèle *et*
ElevenLabs. `render()` reçoit donc `about` (la clé) et `say` (une fonction appelée seulement en cas
de manque au cache). Pour une réponse de chat et l'aperçu, les deux coïncident : rien ne change.

**La route reçoit `{ quoi, jour? }`, jamais de texte.** Un briefing n'a aucune ligne dans
`ai_messages` — personne n'a rien demandé par écrit — donc `speakMessage` ne convenait pas, et la
solution facile (envoyer le résumé affiché) aurait rouvert par la voix ce que le masquage ferme.

### Ce qui a été vérifié, et comment

Sur la vraie base, avec un événement masqué posé exprès sur Sophie (« Rendez-vous cardiologue »,
`is_private`, 15h–17h) puis retiré — la base est revenue à ses 16 événements :

- **le masquage tient à l'oreille** : « Sophie est occupée de quinze à dix-sept heures », jamais
  le titre. C'est §35 mot pour mot, cette fois prononcé ;
- **écrit pour l'oreille** : heures en toutes lettres, prose qui s'enchaîne, ordre chronologique.
  22 s pour le jour, 31 s pour la semaine ;
- **le cache** : deuxième appui → `cached: true`, même empreinte, pas de nouvelle ligne ;
- **la fraîcheur** : retirer l'événement masqué a fait passer l'empreinte de `b0951af4` à
  `7ad0f7ae` et disparaître la phrase correspondante. La clé sur les faits garde donc la garantie
  de D36 ;
- **`verify:ai` passe de 11 à 14 contrôles**, et les trois nouveaux ont été **cassés exprès** pour
  vérifier qu'ils échouent : retirer `visibleTitle` de `briefing.ts`, ajouter un second appelant de
  `generateSpeech`, lire `body.text` dans la route ;
- **en production, sur `casaliva.app`** : le briefing du jour est revenu **du cache** — même base,
  même bucket, mêmes faits qu'en local — ce qui prouve la lecture du bucket et l'URL signée, mais
  pas les clés. Il a donc fallu provoquer un **manque au cache** (la semaine suivante) : le modèle a
  écrit et ElevenLabs a parlé, tous deux depuis la production. C'est là qu'on a découvert que le
  compte Anthropic était à zéro (JON-61). Traces retirées, fichier compris.

### Les cinq défauts trouvés en essayant, pas en relisant

Le premier s'est **entendu**, les quatre autres viennent d'une relecture adversariale. Aucun
n'aurait produit d'erreur visible.

1. **« Lundi, rien du tout, tu commences en douceur »** — un mardi matin. Les jours révolus étaient
   listés *vides*, puisque le filtre les avait vidés. Ils ne sont plus listés du tout.
2. **Et son jumeau, invisible jusqu'au soir** : le jour **en cours**, une fois ses événements finis,
   s'écrivait comme un jour réellement libre. Il dit maintenant « c'est fini pour aujourd'hui » —
   et la distinction se fait sur les événements **avant** filtrage, pas sur l'heure, sinon un lundi
   matin vraiment vide dirait la même chose.
3. **Un événement à cheval sur minuit s'annonçait deux fois, avec ses horaires absolus** : une
   soirée du jeudi 22h à 3h s'écrivait « 22:00–03:00 » le jeudi *et* le vendredi. Le modèle
   annonçait donc, le vendredi, une soirée qui n'existait pas. L'heure est désormais dite depuis le
   jour où on la lit, et le tri d'un jour se fait sur l'heure ramenée à ce jour.
4. **Sur une fenêtre entièrement révolue, le prompt affirmait le faux** — « ce qui est déjà terminé
   ne figure pas ci-dessous », alors que tout y figure. Ce cadrage vit maintenant **dans la
   feuille**, donc il change avec la fenêtre, et entre dans l'empreinte.
5. **Une génération en vol n'était pas annulée.** Le briefing met une dizaine de secondes : pendant
   ce temps `audio.current` vaut encore `null`, donc le nettoyage au démontage ne mettait rien en
   pause. Quitter l'écran laissait `new Audio(...).play()` démarrer une voix **sans lecteur pour
   l'arrêter**. Deux verrous : un `AbortController` et une garde de vivacité après chaque `await`.

Et un défaut **pré-existant** trouvé en chemin, mis dans son propre ticket parce qu'il touche la
grille et pas la voix : [JON-60](https://linear.app/jonathan-naal/issue/JON-60) — `/semaine`
navigue en ajoutant 168 heures fixes, donc saute ou répète une semaine autour d'un changement
d'heure, et sa fenêtre d'événements diverge d'une heure de celle du briefing.

## JON-57 — le micro

On appuie, on parle, on appuie. Le texte entendu **atterrit dans le champ de saisie** ; l'envoi
reste un geste séparé. Raisonnement du changement de fournisseur en **D39**.

**La transcription passe par ElevenLabs, pas par Groq** — décision du commanditaire du 4 août, qui
corrige D1. L'argument de D1 (« ça économise un fournisseur ») s'est retourné tout seul : depuis la
phase 8, ElevenLabs est dans le projet, et c'est Groq qui serait le fournisseur en trop. **Aucune
clé nouvelle** : `ELEVENLABS_API_KEY` fait les deux, vérifié contre le vrai compte.

**Le transcript ne part jamais tout seul**, et c'est une règle écrite deux fois avant que le
composant existe (D22, et le ticket) : sans le texte sous les yeux, on ne peut pas distinguer « le
micro a mal entendu » de « l'IA a mal compris ». Et une personne âgée qui lit « qui est libre
semedi » corrige un mot au lieu de recommencer sa phrase.

**Appui / appui, pas appui maintenu.** Ce n'est pas le double appui que §48 interdit : deux actions
distinctes, chacune étiquetée, avec un état visible entre les deux. L'appui maintenu fait surgir le
menu contextuel d'iOS, exige une immobilité pénible, et perd tout l'enregistrement si le doigt
glisse.

### Ce qui a été vérifié, et comment

- **La route, de bout en bout, avec un vrai clip** : `« Qui est libre samedi après-midi pour un
  golf ? »` en **755 ms**, et la réponse ne contient **que** `text` — ni identifiant de
  transcription, ni durée, ni score ;
- **rien envoyé** → `400` « Je n'ai rien reçu à écouter. » ; **deux secondes de silence** → `422`
  « Je n'ai rien entendu. Réessaie en parlant un peu plus fort ? » — mesuré : l'API répond `200`
  avec un texte **vide**, pas une erreur, donc le code qui ne regarde que `response.ok` enverrait
  une chaîne vide dans le chat ;
- **le refus du micro** → une alerte qui dit quoi faire, et le bouton revient au repos ;
- **les deux cibles font 48×48** (le bouton d'envoi est passé de 44 à 48 par la même occasion :
  deux cibles inégales côte à côte se ratent d'autant plus qu'on vise la petite) ;
- `verify:ai` passe de 14 à **17 contrôles**, les trois nouveaux cassés exprès pour vérifier qu'ils
  échouent.

### Le défaut trouvé en regardant, pas en relisant

Sur un écran de 375 px, un message d'erreur de deux lignes **recouvrait le champ de saisie de
42 px** — l'erreur posée sur le bouton qu'elle demande de réessayer. La bulle s'ancrait par le
haut avec un décalage fixe ; elle s'ancre désormais par le bas (`bottom-full`), donc elle grandit
vers le haut quelle que soit sa hauteur.

### Ce qui n'a pas pu être vérifié ici

**Le micro lui-même.** Le navigateur de contrôle n'en a pas : tout ce qui touche
`MediaRecorder` — le format retenu, la coupure des pistes, le chrono, l'arrêt à 60 s — n'a été
éprouvé que par la lecture. C'est exactement ce que le ticket demande d'essayer **sur un vrai
iPhone**, et c'est pour ça que JON-57 ne se ferme pas sur « ça compile ».

Trois pièges ont été traités d'avance, et chacun aurait produit un bug qui ne se voit que sur le
téléphone de la maison :

- **jamais `audio/webm` en dur** — jusqu'à iOS 18.3, Safari n'enregistre qu'en `audio/mp4`. Le
  format est sondé et le type réel du blob suit jusqu'au nom de fichier ;
- **`start()` sans découpage temporel** — sur Safari iOS, `dataavailable` ne se déclenche qu'une
  fois, à l'arrêt : un envoi au fil de l'eau marcherait sur Chrome et ne recevrait jamais rien sur
  iPhone ;
- **les pistes se coupent après l'arrêt**, dans le gestionnaire `stop` — les fermer avant prive le
  dernier morceau de sa matière, et sur une question courte c'est tout l'enregistrement. Sans cette
  coupure, la pastille orange de l'iPhone reste allumée.

Et un piège écarté : `navigator.permissions.query` **ment sur Safari** — il répond « prompt » même
après un refus définitif, par choix anti-empreinte. L'écran ne s'y fie donc pas ; seul le rejet de
`getUserMedia` fait foi, et comme il ne dit pas si le refus est ponctuel ou définitif, le message
couvre les deux.

### La réserve honnête sur « transcrit puis oublié »

C'est vrai **de notre côté** : aucune colonne, aucun bucket, aucun journal, et le blob meurt avec
la requête — désormais tenu par un contrôle qui refuse un `insert`, un `upload` ou un
`transcription_id` dans ce chemin.

Ça ne va pas plus loin. Le mode zéro rétention d'ElevenLabs (`?enable_logging=false`) **a été
essayé contre le vrai compte** : `403 — Only users from the enterprise or trial tier can use ZRM
mode`. On l'écrit plutôt que de laisser croire à une garantie de bout en bout.

## Ce qui existe déjà — ne pas le reconstruire

| | Où |
|---|---|
| **L'enveloppe, le cache, le lecteur** | `lib/voice/`, `components/ai/listen.tsx`, `/api/ia/voix` — livrés par JON-54. Le lecteur prend une `source` (`message` ou `briefing`) et une variante visuelle |
| **Le briefing** | `lib/voice/briefing.ts` (les faits + le prompt de l'oreille), `speakBriefing()` dans `speech.ts`, `/api/ia/voix/briefing` |
| **Le bucket** | `casa-audio`, privé, migration **0012**, quatre policies |
| **Le choix de la voix** | `users.voice_id` (0013), `lib/voice/voices.ts`, le sélecteur de `/moi` |
| Table `audio_generations` | migration **0001**, `text_hash` et sa contrainte d'unicité `(user_id, text_hash)` |
| Types | `AudioGeneration`, `AudioGenerationStatus` dans `types/index.ts` |
| Clés | `ELEVENLABS_API_KEY` et `GROQ_API_KEY` — confirmées « Production and Preview » |
| Le Speech-To-Text | **ElevenLabs**, `POST /v1/speech-to-text`, la **même clé** que la synthèse (D39 — qui corrige D1). Groq ne sert plus qu'au repli d'écriture |
| Casa AI, à l'écrit | toute la phase 7 : c'est elle qui produit le texte à lire |

---

## JON-55 — le bucket audio passe sous contrôle automatique

Deux des trois points avaient été faits par JON-56 :

- ✅ **l'essai à la main avec un événement masqué** — posé, écouté, vérifié de ses oreilles :
  « Sophie est occupée de quinze à dix-sept heures », jamais le titre. Sur le briefing du jour
  **et** celui de la semaine ;
- ✅ **la relecture de `lib/voice/`** — faite, et elle a rendu cinq défauts. Le contrôle « aucun
  titre lu en direct » ne passe plus par vacuité, et `verify:ai` est passé de 11 à 17 contrôles.

Le troisième — celui qui n'avait rien à voir avec le briefing — est fait à son tour :
**`verify:rls` passe de 33 à 46 contrôles**, et les treize nouveaux gardent le seul endroit du
système, avec l'email, où une fuite serait définitive.

### Ce que les nouveaux contrôles prouvent

**Ils sont joués entre colocataires, et c'est le point.** Ils tournent **en dernier**, après que B
a emménagé chez A. Les policies de 0012 ne regardent que `auth.uid()`, jamais la maison : si
l'isolation tient entre deux personnes du même foyer, elle tient a fortiori entre deux maisons.
L'inverse aurait été faux — vérifier depuis une autre maison n'aurait rien prouvé sur le cache
d'à côté, et c'est pourtant le cas qui se présentera tous les jours.

Trois contrôles positifs d'abord, sans lesquels tous les refus qui suivent pourraient venir d'un
bucket cassé plutôt que d'une policy qui travaille : A dépose son audio, A le réécoute par une URL
signée (`200`, `audio/mpeg`), A range sa ligne dans `audio_generations`.

Puis ce qui doit être refusé :

- **le fichier n'est servi ni brut, ni par la forme `/public/`** — `400` dans les deux cas. La
  seconde est exactement le lien qu'on obtiendrait si quelqu'un basculait le drapeau `public` un
  jour de ménage : le seul changement d'une ligne qui rendrait tout le reste inutile **sans rien
  casser à l'écran** ;
- **une URL signée expire vraiment** — mesuré avec une seconde de validité, `400` après deux
  secondes et demie. Personne ne l'avait vérifié, et tout le modèle repose là-dessus : une URL
  sort du serveur, donc elle peut être copiée, journalisée par un proxy, ou rester dans un
  historique. « Signée » ne protège que si « courte » est appliqué **par le serveur** ;
- **B ne voit pas le dossier de A**, ne télécharge pas son fichier, **et ne peut pas se faire
  signer une URL pour lui** — c'est la forme la plus séduisante de l'attaque : ne pas lire le
  fichier, mais obtenir un laissez-passer d'une heure pour lui ;
- **B ne dépose rien chez A, n'écrase pas son fichier, ne le supprime pas.** Ce dernier applique
  au stockage la leçon du `.select("id")` : `remove()` **ne lève pas** quand la policy refuse, il
  rend une liste vide, ce qui ressemble trait pour trait à un succès. On regarde donc si le
  fichier est encore là, pas ce que l'appel a répondu ;
- **B ne lit aucune ligne d'`audio_generations` de A, et n'en écrit pas une à son nom.** La
  colonne `text` contient le texte prononcé **en clair** : y accéder rendrait inutile tout le soin
  pris sur le bucket — on n'aurait pas le fichier, on aurait mieux, sa transcription et le chemin
  pour aller le chercher.

### Les dix contrôles cassés exprès

**Le risque réel n'était pas qu'un contrôle échoue, c'est qu'il passe par vacuité** : un mauvais
nom de bucket, un mauvais chemin, un client mal authentifié, et les dix refus passent sans jamais
rien avoir regardé.

Chaque contrôle négatif a donc été rejoué **pointé vers une cible que B a le droit d'atteindre** —
son propre dossier, sa propre ligne, une signature valide, dix minutes de validité au lieu d'une
seconde. **Les dix ont échoué**, comme ils le devaient. Un « OK » aurait dénoncé un contrôle qui
ne voit rien.

### Le ménage, qui n'allait pas de soi

`storage.objects` **n'est pas emporté par la cascade** : elle part de `users` vers
`audio_generations`, et s'arrête là. Sans nettoyage explicite, chaque exécution laisserait un
fichier orphelin dans un dossier dont le propriétaire n'existe plus — exactement la façon dont
huit maisons vides avaient fini par traîner en base. Vérifié après coup : 14 lignes, 14 fichiers,
aucun compte de test, la base est revenue à ses 16 événements.

## Les règles qui tiennent pour tout ce qui parle

- **La voix écoute et demande, elle n'agit pas.** Parler pour *faire* quelque chose est la phase 9
  (D22), qui porte l'aperçu et la confirmation.
- **Rien de ce qui sera dit ne vient du navigateur.** Ni le texte, ni la voix — la route reçoit un
  identifiant ou une intention, et va chercher le reste elle-même (D36).
- **L'empreinte du cache porte la voix *et* ce dont il est question** (D37, D38) — le texte quand
  c'est lui le sujet, la feuille de faits quand c'est un briefing. La fraîcheur vient du contenu,
  jamais d'un horodatage ajouté à la main.
- **Aucune clé côté client**, ElevenLabs comprise ; `verify:ai` le refuse déjà.
- **Un événement masqué ne se lit pas plus à voix haute qu'il ne s'écrit**, et un résumé vocal
  s'écoute souvent à plusieurs.

## Ce que la phase 7 a laissé exprès, et qui reste ouvert

**`AIProvider.generate()` rend la réponse entière, sans streaming** (D33). Pour l'écrit c'était le
bon choix — l'attente vient des allers-retours d'outils, pas de la longueur du texte. Pour un
briefing lu à voix haute, la question se repose : l'ajout se ferait par un rappel optionnel, sans
casser la garantie « la réponse complète est rendue » dont dépend l'enregistrement en base.

---

# Ajouté au périmètre le 3 août — les lieux

Demande du commanditaire, **pas dans `PLAN.md`**. Consigné en D20.

## Ce qu'est un lieu

Un endroit où l'on se retrouve : « Chez Mamie », « Le golf », « L'école ».

- **Un nom, obligatoire.** C'est lui qui réduit l'ambiguïté : « Chez Mamie » veut dire quelque
  chose pour la famille, « 12 rue des Lilas » ne dit rien à personne.
- **Une adresse exacte, facultative.** Beaucoup de lieux familiers n'en ont pas besoin.
- **Un tap ouvre l'itinéraire** dans Maps ou Waze.
- **Partagé par toute la maison.** Un lieu créé par quelqu'un sert à tout le monde — c'est le
  contraire d'un champ de texte libre retapé à chaque fois.

## La règle d'édition qui change tout

> **On ne peut pas modifier l'événement de quelqu'un d'autre. On peut modifier les lieux.**

C'est un **renversement** de ce qui existe. La migration 0001 dit l'inverse, commentaire à
l'appui : « Tout le monde dans la maison peut déplacer un événement de la maison : c'est un
agenda partagé, pas un système de tickets. » Le commanditaire a tranché autrement (D21).

Concrètement : seul le **créateur** d'un événement peut le déplacer, le modifier ou le
supprimer. Les autres ne font que répondre « je viens / pas dispo ». Les lieux, eux, restent
communs et modifiables par tous — corriger une adresse fautive profite à tout le monde.

## Ce qu'il faudra trancher

Rien de tout ça n'est décidé. À reprendre avec un regard neuf :

1. **`events.location` existe déjà**, en texte libre, et sert à la vue détail et à l'import
   Google. Un lieu structuré le remplace-t-il, ou cohabite-t-il ? Les événements Google
   arrivent avec une adresse brute qui ne correspond à aucun lieu connu — il faut un chemin
   pour eux.
2. **Maps ou Waze ?** Les deux existent, l'app est mobile-first, et imposer l'un des deux
   fâchera la moitié de la famille. Un `geo:` laisse le téléphone choisir mais ne marche pas
   partout ; deux liens explicites sont plus lourds mais plus honnêtes.
3. **Les doublons.** Deux personnes créeront « Chez Mamie » le même jour. Proposer les lieux
   existants au moment de la saisie coûte moins cher que de dédoublonner après.
4. **La suppression d'un lieu** utilisé par des événements passés. Ne pas casser l'historique.

## Le piège à ne pas rater

La RLS des lieux doit être écrite en même temps que la table, comme partout ailleurs dans ce
projet. Et `npm run verify:rls` doit gagner ses contrôles **dans le même commit** : c'est ce
qui a permis d'attraper la faille inter-maison de `calendar_connections` (0005).

---

# Phase 9 — ce qui a été construit

**Livrée le 4 août.** Casa AI crée, déplace et supprime des événements — en **proposant**, jamais
en exécutant. Quatre tickets fermés, un ouvert :

| | Ticket | |
|---|---|---|
| **Le squelette** | [JON-63](https://linear.app/jonathan-naal/issue/JON-63) — dire ce qu'on veut, voir ce que ça donnera, valider | ✅ essayé sur la Preview |
| **L'injection** | [JON-64](https://linear.app/jonathan-naal/issue/JON-64) — un titre venu de Google ne souffle pas d'action | ✅ |
| **L'opportunité** | [JON-65](https://linear.app/jonathan-naal/issue/JON-65) — « ✨ Opportunité Casa » devient un tap | ✅ |
| **Modifier, supprimer** | [JON-66](https://linear.app/jonathan-naal/issue/JON-66) — et l'« Annuler » réparé | ✅ essayé sur la Preview |
| **La voix** | [JON-40](https://linear.app/jonathan-naal/issue/JON-40) — parler pour agir | ⏳ **le code est là, la recette téléphone non** |

Trois décisions en sont sorties : **D41** (un tool d'écriture ne s'exécute pas, il propose),
**D42** (un titre venu de Google n'est pas une consigne), **D43** (le fournisseur peut basculer au
milieu d'une action).

## LA décision, et elle commande tout le reste

> **Un tool d'écriture ne s'exécute pas — il propose.**

`create_event`, `modify_event` et `delete_event` valident, résolvent — les prénoms en habitants,
« samedi » en date réelle, la cible relue en base — rangent un brouillon avec un jeton
(`ai_action_drafts`, migration **0014**), et rendent au modèle « aperçu prêt, ne dis pas que c'est
fait ». L'écriture part d'un **geste humain** qui consomme le jeton une seule fois.

**Ce n'est pas de la prudence.** `runTool` s'exécute au moment où le modèle appelle le tool : y
brancher `createEvent()` créerait l'événement avant que personne n'ait rien vu — et le contrôle
« chaque tool déclaré est exécutable » **passerait**, il le serait, de la mauvaise façon.

Et le pendant, plus vicieux : `chat.ts` retire les outils au dernier de ses trois tours, et rien ne
compare le texte final aux tools qui ont tourné. Le modèle pouvait écrire « c'est créé ! » sans
avoir rien créé. Le contrat fait disparaître le défaut au lieu de le surveiller.

**Le même choix règle trois autres problèmes d'un coup** : la double exécution (le jeton, arbitré
par **Postgres** dans le `where` d'un `update`), l'injection par un titre d'agenda (au pire un
aperçu absurde qu'on refuse d'un tap), et les quinze secondes (aucun appel de modèle pour
confirmer, ni pour corriger).

**L'ordre n'est pas symétrique** : on consomme d'abord, on exécute ensuite. Un jeton brûlé pour
rien est un désagrément ; un double dîner de famille est un incident. Sur échec, le jeton est rendu.

## Le chemin, de bout en bout

```
« ajoute un golf samedi avec Sophie »
  → modèle → create_event → validation, résolution, refusalFor
  → brouillon + jeton → « aperçu prêt »
  → l'écran montre l'événement tel qu'il serait, et dit RIEN N'EST ENCORE ENREGISTRÉ
  → un tap humain → confirmDraft(jeton) → createEvent() sous la session
```

**L'événement créé par l'IA appartient à qui a parlé, pas à Casa AI.** Ce n'est pas une consigne :
c'est la conséquence mécanique de passer par `createEvent()`, qui force `creator_id` à l'appelant.

## Ce qui existe désormais — ne pas le reconstruire

| | Où |
|---|---|
| Le rangement des aperçus | `lib/ai/drafts.ts` — `saveDraft` / `claimDraft` / `releaseDraft` / `readConsumedDraft` |
| L'exécution, et **le seul endroit où Casa AI écrit** | `actions/ia.ts` — `confirmDraft`, `undoDraft` |
| Les trois tools d'écriture | `lib/ai/tools.ts`, en proposition — jamais un `.insert(` |
| L'aperçu | `components/ai/action-preview.tsx` |
| Le rendu d'un événement, partagé | `components/events/event-card.tsx` — la feuille de détail et l'aperçu |
| Les champs, partagés | `components/events/event-form.tsx` — création, correction, Opportunité Casa |
| Le marquage du contenu non fiable | `lib/ai/untrusted.ts` — `asData`, `AGENDA_OPEN` / `AGENDA_CLOSE` |
| La remise en place | `restoreEvent()` dans `actions/events.ts` — **sans email**, statuts et `allDay` préservés |
| La barre d'annulation, **une seule** | `components/events/undo-bar.tsx`, montée sur les deux grilles, « Trouver un moment » et `/ia` |

## Les bornes non négociables, et pourquoi

- **participants explicites obligatoires** sur `create_event`. `resolvePeople` rend *toute la
  maison* quand l'argument manque : bon défaut pour « qui est libre samedi ? », désastreux ici —
  la famille entière conviée et autant d'emails. **C'est le seul endroit du code où ne rien dire
  produit l'effet le plus large** ;
- **dates bornées** — ni le passé, ni au-delà d'un an. `parseCasaDay` ne valide que la forme :
  `2025-08-09` passait sans un mot, et posait un golf un an en arrière, invisible partout ;
- sur `modify_event`, **`people` omis ne remplace rien** — les invités actuels ne bougent pas ;
- **la suppression n'accepte aucune correction**, et n'a pas de bouton « Corriger » : il n'y a
  rien à corriger dans « supprimer ceci ».

## Ce qui a été vérifié, et comment

**Sur la Preview Vercel**, qui est le seul endroit d'ici où le modèle répond (voir « Reprendre
ici ») :

- **« Ajoute un golf samedi matin avec Sophie »** → *« l'aperçu du golf samedi matin (9h-11h)
  avec Sophie est à l'écran — il ne reste plus qu'à valider ! »*. Elle **ne dit pas que c'est
  fait**, et `events` est à 16 lignes à cet instant, avec un brouillon non consommé ;
- **sans dire avec qui** → *« Avec qui pour ce dîner samedi à 20h ? »*. Aucun aperçu ;
- **le 09/08/2025** → *« Petite coquille je pense : le 9 août 2025, c'est dans le passé ! »* ;
- **« Décale le padel de test à 14h »** → aperçu avec la ligne barrée « Aujourd'hui : samedi
  10:00 → 12:00 ». Validé : la base dit 14:00–16:00, **et les réponses des participants sont
  intactes** ;
- **l'événement de Sophie** → *« cet apéro est celui de Sophie — je ne peux pas le déplacer à
  sa place »*, **aucun aperçu** ;
- **un événement Google** → renvoyé vers Google, aucun aperçu ;
- **« Supprime le padel de test »** → l'événement relu en entier, **avec ses vraies réponses**
  (« Partant » / « Pas dispo »). Validé, puis **« Annuler »** → il revient avec ses statuts
  intacts, et sans email.

**Et sur la vraie base, avec le vrai composant** : l'aperçu au mot près comme la maquette,
« Corriger » qui rouvre tous les champs remplis, Inès ajoutée, un seul événement écrit avec ses
trois participants — et **le même jeton rejoué refusé** (« C'est déjà fait »).

La base est revenue à ses 16 événements après chaque essai.

## Les contrôles

- **`verify:ai` : 17 → 27.** Quatre **exécutent** `asData` au lieu de la relire. Les autres
  refusent : un `.insert(` dans `lib/ai/tools.ts` ; un tool déclaré sans avoir été **classé** ;
  un tool à cible qui ne consulte pas `refusalFor` ; un titre d'agenda interpolé sans marquage,
  ou un prompt qui perd ses bornes ; une **cible** glissée dans les corrections que le navigateur
  a le droit d'envoyer ; toute écriture dans `events` hors des Server Actions.
  **Les onze nouveaux ont été cassés exprès. Les onze ont échoué.**
- **`verify:rls` : 46 → 51.** B ne voit pas les aperçus de A, ne les consomme pas, ne peut pas en
  ranger un sur la maison de A — et un jeton ne se consomme qu'une fois, **arbitré par Postgres**.

## Les six défauts trouvés en exécutant, pas en relisant

Aucun ne produisait d'erreur. Trois viennent du banc `jiti` sur le vrai module, deux de l'écran,
un de `verify:ai`.

1. **`TZDate.toISOString()` écrit la forme décalée** (`…+02:00`) là où un `Date` ordinaire écrit
   la forme UTC. Le début et la fin d'un même brouillon ne s'écrivaient pas pareil — deux instants
   justes, deux formats, et une comparaison qui aurait menti un jour ;
2. **`runTool` reconnaissait un refus par le seul `instanceof`.** Deux copies du module donnent
   deux classes : « il manque le prénom » devenait « ce tool est tombé en panne », et le modèle
   **abandonnait au lieu de se corriger** ;
3. **`lib/voice/briefing.ts` versait les titres dans son propre prompt système sans bornes** —
   trouvé par le contrôle écrit pour `lib/ai/context.ts`, et hors du périmètre du ticket ;
4. **le modèle de repli annonçait une action refusée.** Rendez-vous Google, tool refusé, rien en
   base, aucun aperçu — et Groq répond *« Je modifie l'appel avec Matthieu — c'est à valider de
   ton côté ! »*. L'écran ne disait rien. Il le dit maintenant : `AskResult.refusal`, rempli sur
   trois conditions vérifiables, **sans aucune expression régulière sur du français** (D43) ;
5. **l'aperçu de suppression affichait « n'a pas répondu » pour tout le monde**, alors que la base
   disait `accepted` et `declined`. Le brouillon ne portait que les identifiants, et le rendu
   comblait le vide avec `pending` — plausible, et faux. Sur une suppression, ces réponses sont
   **précisément ce qu'on efface** ;
6. **`asDraftEvent` mettait le titre brut dans le brouillon.** Le filtre écarte déjà les événements
   masqués — mais il pourrait changer sans que personne ne pense à ce chemin, et un titre masqué
   remonterait jusqu'à l'écran le plus lu de la phase.

## Deux dettes réparées au passage

**L'« Annuler » n'était pas le filet qu'on croyait.** `undo()` recréait l'événement via
`createEvent()`, donc repassait par `after(notifyInvitees)` : **annuler une suppression renvoyait
une invitation par email à tout le monde**, remettait les participants en `pending` en effaçant
leurs « pas dispo », et perdait `allDay`. Trois défauts **déjà réels**, que la phase 2 déclenchait
rarement. `restoreEvent()` les corrige tous les trois.

**Et il n'y avait pas une barre d'annulation, mais deux** — qui ne partageaient rien. Deux endroits
où corriger un défaut, un seul où on pense à le faire. Il n'y en a plus qu'une, et elle est montée
sur `/ia`, qui n'en avait aucune.

**Le champ lieu manquait depuis la phase 2** : `CreateEventInput` acceptait `location` et les
événements Google en portent un, mais aucun écran ne permettait d'en saisir. On pouvait voir un
lieu, jamais en mettre.

## Ce qui reste, et qui demande une main humaine

**[JON-40](https://linear.app/jonathan-naal/issue/JON-40).** Le code est livré : le transcript
reste affiché **à côté de l'aperçu** (« J'ai entendu : … »), et il disparaît si on a retouché la
phrase avant d'envoyer — le prétendre alors ferait chercher la faute au mauvais endroit. La
correction n'appelle pas le modèle.

Ce qui manque est **l'essai** : quelqu'un qui n'a pas écrit le code, sur son téléphone, dans une
pièce bruyante. Il crée un événement à la voix, il en supprime un, et l'aperçu attrape au moins
une erreur de transcription avant qu'elle n'atteigne la base. Chronomètre du premier tap au
« Créer » : **moins de 15 secondes**.

Le compte des secondes ne peut pas être mesuré ici — il dépend du micro, du réseau du téléphone et
du fournisseur qui répond ce jour-là. Ce qu'on sait : l'aperçu est **fabriqué par le serveur**,
donc il n'ajoute aucun appel de modèle, et « Corriger » n'en ajoute pas non plus. Le budget n'est
dépensé qu'une fois.

## Ce que la phase 10 a déjà pris — JON-67

**Ajout au périmètre du 4 août au soir**, demandé après l'essai téléphone. `/ia` reprenait la
conversation de la dernière fois (`getLastConversation`, phase 7). Ce n'était pas dans `PLAN.md`,
qui ne disait rien de la façon dont une conversation commence ou finit.

Trois conséquences, et la troisième décide (**D44**) :

1. **on ne revoyait jamais les suggestions** — elles ne s'affichent que sur un fil vide, or le fil
   ne l'était plus jamais. C'est pourtant le seul endroit qui apprend ce qu'on peut demander, et il
   a **changé** en phase 9 : « Ajoute un golf samedi matin avec Sophie » y est apparu ;
2. **le contexte d'hier pesait sur la question d'aujourd'hui** — `loadHistory()` renvoie douze
   messages au modèle ;
3. **un agenda familial n'est pas un chat.** Une question, une réponse, on ferme.

**« Pas d'historique » veut dire « pas d'historique à l'écran ».** Rien n'est supprimé en base, et
c'est ce que deux garanties exigent : « Écouter » relit le message par son identifiant (D36), et
les compteurs de tokens vivent sur `ai_messages` (§72).

**Rien n'a changé côté serveur** : `askCasaAI` ouvrait déjà une conversation neuve quand le
navigateur n'en fournissait pas. Il suffisait que la page cesse d'en fournir une — `lib/data/ai.ts`
a disparu entièrement, ce qui est le bon signe.

Et le bouton « Nouvelle conversation » vit **en haut du fil**, l'aperçu d'action en bas : un bouton
qui efface tout, posé près de celui qui valide, finirait par être tapé à sa place — et un aperçu
qui quitte l'écran n'est plus validable.

## La frontière basse, tenue

**La phase 9 écrit des événements ; la phase 10 écrira ce qui sert à les décrire.** Les lieux
(JON-38) et les catégories (JON-46) sont restés dehors. La tentation exacte qui a été refusée :
« l'IA a entendu *chez Mamie*, autant en faire un lieu tout de suite. » L'aperçu affiche le champ
texte libre `location`, et c'est tout.
