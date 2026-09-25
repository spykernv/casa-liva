<div align="center">

# 🏡 Casa Liva

**L'agenda de la maison.**
Qui fait quoi, quand on est libres, et ce qu'on organise ensemble.

</div>

---

> **Un side-project, et une étape.**
>
> Cette version est **fonctionnelle et utilisée aujourd'hui** par une famille, au quotidien, sur
> [casaliva.app](https://casaliva.app) (sur invitation uniquement).
>
> En parallèle, je mène des **entretiens avec les utilisateurs** et des **workshops** pour
> comprendre comment les familles s'organisent vraiment : qui décide, qui oublie, ce qui se dit
> à table et ce qui ne s'écrit jamais nulle part. **Une vraie app sera publiée plus tard**, construite
> à partir de ce qu'ils m'apprennent. Ce dépôt est le terrain d'essai qui permet de poser les
> bonnes questions.

## L'idée

Casa Liva répond à trois questions, et rien d'autre :

1. Qu'est-ce que tout le monde fait ?
2. Quand sommes-nous disponibles ensemble ?
3. Qu'est-ce qu'on pourrait organiser ?

L'objectif n'est pas de refaire Google Calendar. C'est d'être **plus simple que demander
« tu fais quoi samedi ? » à voix haute** : assez simple pour Mamie, assez rapide pour tout
le monde. Créer un événement doit prendre moins de 15 secondes.

## Ce qui marche aujourd'hui

- **Un agenda partagé** par la maison, qui se lit en liste à la semaine et en grille à la
  journée, avec deux vues : « la maison » et « moi ».
- **« Qui est libre samedi ? »** : la question inverse, qui montre ce que font les autres plutôt
  qu'un simple « pas dispo ».
- **Google Calendar importé**, et chacun choisit ce qu'il partage : le détail, ou seulement
  « occupé ».
- **Casa AI** : on lui parle ou on lui écrit, elle prépare l'événement et **on valide avant
  qu'il existe**. Elle ne peut jamais révéler ce que la personne n'a pas le droit de voir.
- **La voix** : dicter plutôt que taper, et écouter le briefing du jour ou de la semaine.
- **Une app sur le téléphone** (PWA) : invitations, réponses et rappels arrivent en notification.
- **Les lieux et les catégories**, partagés par toute la maison.

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis remplir les valeurs
npm run dev
```

L'app tourne sur http://localhost:3000. Il faut un projet Supabase (migrations dans
`supabase/migrations/`) et les clés listées dans `.env.example`.

## Documentation

La documentation a été écrite **pendant** le développement, en français, et se lit comme un
journal de bord.

| Fichier | Contenu |
|---|---|
| [`docs/PLAN.md`](docs/PLAN.md) | Le cahier des charges d'origine |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Les écarts assumés par rapport au plan, et pourquoi |
| [`docs/ETAT.md`](docs/ETAT.md) | Où en est chaque phase, et ce qui a été essayé en vrai |
| [`AGENTS.md`](AGENTS.md) | Conventions de code, règles de confidentialité, ton produit |

Le projet a été développé avec des agents de code : `AGENTS.md` et `CLAUDE.md` sont les
consignes qu'ils suivent. Les liens vers Linear pointent vers un espace privé.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Motion
Supabase (Postgres + Auth + RLS) · Vercel
Anthropic + Groq (IA) · ElevenLabs (voix) · Resend (email) · Web Push (notifications)

## Confidentialité

Aucune clé d'IA n'est exposée au navigateur, et tous les appels externes passent par le backend.
Le modèle de langage n'accède jamais directement à la base : il ne peut appeler que des *tools*
serveur, qui s'exécutent sous la session de la personne. La RLS de Postgres fait donc le tri, et
une action d'écriture n'est qu'une **proposition** tant qu'un humain ne l'a pas validée.

Ces garanties sont vérifiées par des scripts, pas seulement écrites :

```bash
npm run verify:ai      # confidentialité de l'IA, de la voix et des notifications (sans base ni secret)
npm run verify:dates   # changements d'heure
npm run verify:rappels # rappels : une fois, à l'heure, et de nouveau si l'événement bouge
npm run verify:rls     # isolation entre maisons, sur une vraie base (exige .env.local)
```

## À propos de ce dépôt

C'est un **instantané public** du dépôt de développement, publié sans son historique. Les
prénoms et les adresses de la vraie famille ont été remplacés par des exemples.
