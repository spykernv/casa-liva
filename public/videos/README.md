# Les trois films d'installation

Le guide (`components/pwa/install-guide.tsx`) et la popup les cherchent ici. **Ils existent
depuis le 26 août** — avant ça, la structure était livrée et chaque lecteur s'effaçait tout seul
tant que son fichier manquait. Ce mécanisme reste en place : supprimer un `.mp4` retire son
lecteur sans casser le guide.

| Fichier | Ce qu'il montre | Durée |
|---|---|---|
| `casa-pwa-intro.mp4` | Ce qu'on y gagne : l'icône, et que c'est elle qui apporte les invitations | 8 s |
| `casa-pwa-ios.mp4` | Le geste sur iPhone, dans Safari : partager → **défiler** → « Sur l'écran d'accueil » | 10 s |
| `casa-pwa-android.mp4` | Le geste sur Android, dans Chrome : menu ⋮ → « Installer l'application » → confirmer | 10 s |

Chacun a son affiche `.jpg` de même nom, montrée avant lecture. Facultative au même titre.

## D'où ils viennent

Sources : `C:\dev\motion-video-claude\projects\pwa-onboarding-casa-liva\graphics\`, rendues avec
**HyperFrames** (composition HTML + GSAP → MP4). Le modèle de structure est
`pwa-onboarding-plania`, désigné par le commanditaire ; **le contenu, lui, n'a rien de commun** —
les films de Plania portent « Communauté Plania » et `communaute.plania.ai` en toutes lettres.

Pour les refaire ou les retoucher :

```bash
cd C:/dev/motion-video-claude/projects/pwa-onboarding-casa-liva/graphics && npx hyperframes render -c compositions/ios.html --quality standard -o renders/ios.mp4
```

`index.html` porte l'intro ; `compositions/ios.html` et `compositions/android.html` les deux
tutoriels. Lancer `npx hyperframes lint` puis `check` avant de rendre — c'est `check` qui a
attrapé six échecs de contraste AA au premier jet.

## Ce qui a été décidé en les faisant

- **La palette est celle de l'app**, pas celle du modèle : crème `#fbf7f1`, terracotta `#e2653c`,
  encre `#1f1b17`, ombres **chaudes**. Fraunces en display, Plus Jakarta Sans en texte — les deux
  polices de `app/layout.tsx`, en sous-ensemble latin dans `assets/fonts/`.
- **Le texte accentué est `#8f3616`, pas `#e2653c`.** Le terracotta sur crème donne **2,87:1** et
  le seuil du grand texte est 3:1 — recalé par `hyperframes check`, corrigé, 28/28 ensuite.
  `AGENTS.md` : le contraste ne se négocie pas, ici comme dans l'app.
- **Le film iPhone montre le DÉFILEMENT de la feuille de partage**, lentement. C'est l'étape qui
  bloque réellement — « Sur l'écran d'accueil » est plus bas que ce qu'on voit d'abord — et c'est
  ce qu'un dessin fixe ne sait pas raconter. Le modèle ne le montrait pas.
- **Pas de mascotte.** Plania a un robot ; Casa Liva a une icône de maison, et c'est elle qu'on
  cherchera des yeux sur son écran d'accueil. Montrer autre chose serait joli et inutile.
- **L'agenda visible dans les maquettes est plausible et vide de sens** : des titres génériques
  (Cinéma, Marché, Foot de Romane). Aucun vrai événement de la maison n'est filmé.

## Si tu en retournes un

- **Format portrait 9/16**, 1080×1920 — c'est ce que le guide réserve.
- **Muets.** Le lecteur ne démarre pas tout seul, et personne ne monte le son pour un mode
  d'emploi.
- **Filmer `casaliva.app`**, jamais une URL de Preview : une adresse qui ne correspond pas fait
  douter du reste.
- **Léger**, ~1,5 à 2 Mo pièce. Ils se chargent sur un téléphone, souvent en 4G, au moment précis
  où l'on cherche à convaincre.

> ⚠️ **`proxy.ts` doit laisser passer les `.mp4`.** Ils n'étaient pas exclus du matcher : le
> navigateur recevait un `307` vers `/connexion` en guise de vidéo. Et comme `.jpg` était exclu,
> l'affiche s'affichait et la vidéo jamais — pendant que le guide masquait le lecteur exactement
> comme pour un fichier absent. **Rien ne l'aurait signalé.** Voir D55.
