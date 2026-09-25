"use client";

import { useState, useTransition } from "react";
import { Check, MapPin, Plus, X } from "lucide-react";
import type { Catalogue, FamilyMember } from "@/types";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { saveCategory, savePlace } from "@/actions/catalogue";
import { fold, resolvePlace, titleAfterTap, visibleCategories } from "@/lib/catalogue";
import { casaDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { OPTIONS_RAPPEL, RAPPEL_DEFAUT_MINUTES } from "@/lib/rappels";

/* ═══════════════════════════════════════════════════════════════
   Les champs d'un événement — un seul jeu, trois écrans.

   **Sorti de `CreateEventSheet` pour la phase 9.** « Corriger » un
   aperçu, c'est ouvrir les champs déjà remplis (D41) — et surtout
   **sans rappeler le modèle** : `loadHistory()` jette les allers-retours
   d'outils, donc au tour suivant il ne verrait ni l'appel ni son
   résultat. Il ne corrigerait pas l'événement, il le **réinventerait**.

   Trois consommateurs, un seul formulaire : la création depuis la
   grille, la correction d'un aperçu, et « ✨ Opportunité Casa »
   (JON-65). Deux formulaires auraient divergé au premier champ ajouté,
   et c'est le champ manquant qu'on découvre en production.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Les émojis proposés **quand on crée une catégorie**.
 *
 * Ils ne remplissent plus l'événement directement : la rangée du
 * formulaire montre désormais les catégories de la maison (D29, D45),
 * qui portent chacune son émoji ET son titre. Ceux-ci ne servent donc
 * qu'à en habiller une neuve.
 */
const EMOJIS = ["🍝", "🍷", "⛳", "🎬", "🏖️", "🛒", "⚽", "🎂", "🩺", "✈️", "🎓", "🚗"];

export type EventFormValues = {
  title: string;
  emoji: string | null;
  location: string;
  /** `AAAA-MM-JJ`, dans le fuseau de la maison. */
  date: string;
  /** `HH:MM`. */
  from: string;
  to: string;
  invited: string[];
  /**
   * Minutes avant le début pour prévenir. `null` = pas de rappel.
   *
   * **Choisi ici par l'organisateur, et subi par tous les invités**
   * (D56). Ce n'est pas une entorse à la règle des propriétaires : un
   * délai de rappel est une propriété de l'événement — un train ne se
   * prépare pas comme un cinéma — pas une préférence de qui le reçoit.
   * Ce qui reste à chacun, c'est de couper les notifications.
   */
  rappelMinutes: number | null;
};

/** `2026-08-02` et `18:30`, dans le fuseau de la maison. */
export function splitLocal(ms: number) {
  const d = casaDate(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * Recompose un instant à partir des champs date et heure.
 *
 * On passe par une chaîne ISO **sans** fuseau, réinterprétée dans le
 * fuseau de la maison : `new Date("2026-08-02T18:30")` prendrait
 * l'heure du navigateur, et un membre en voyage créerait ses
 * événements décalés.
 */
export function combine(date: string, time: string, plusADay = false): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const instant = casaDate(Date.now());
  instant.setFullYear(y, m - 1, d + (plusADay ? 1 : 0));
  instant.setHours(hh, mm, 0, 0);
  return instant.toISOString();
}

/**
 * Une fin plus petite que le début veut dire « ça déborde sur le
 * lendemain » — c'est ce que « de 22h à 2h » signifie pour tout le
 * monde, et une soirée est exactement le genre d'événement qu'on cale
 * à la voix. La même règle que dans `create_event`, pour que corriger
 * un aperçu ne change pas la façon dont il est lu.
 */
export function overnight(from: string, to: string): boolean {
  return to <= from;
}

/** Arrondi au quart d'heure — personne ne cale un apéro à 18h07. */
export function roundUp(ms: number): number {
  const d = casaDate(ms);
  d.setSeconds(0, 0);
  d.setMinutes(Math.round(d.getMinutes() / 15) * 15);
  return d.getTime();
}

/** Les valeurs de départ d'une création ordinaire : une heure, à partir de maintenant. */
export function valuesFromSlot(startMs: number, meId: string): EventFormValues {
  const start = splitLocal(roundUp(startMs));
  const end = splitLocal(roundUp(startMs) + 60 * 60_000);
  return {
    title: "",
    emoji: null,
    location: "",
    date: start.date,
    from: start.time,
    to: end.time,
    invited: [meId],
    rappelMinutes: RAPPEL_DEFAUT_MINUTES,
  };
}

/** Les valeurs de départ d'un aperçu déjà résolu — la correction part de là. */
export function valuesFromEvent(event: {
  title: string;
  emoji?: string;
  location?: string;
  startAt: string;
  endAt: string;
  participantIds: string[];
  rappelMinutes?: number | null;
}): EventFormValues {
  const start = splitLocal(new Date(event.startAt).getTime());
  const end = splitLocal(new Date(event.endAt).getTime());
  return {
    title: event.title,
    emoji: event.emoji ?? null,
    location: event.location ?? "",
    date: start.date,
    from: start.time,
    to: end.time,
    invited: event.participantIds,
    /* `undefined` veut dire « on n'en sait rien » — un aperçu d'IA n'en
       parle pas — et c'est alors le défaut qui s'applique. `null` veut
       dire « pas de rappel », et il faut le respecter. */
    rappelMinutes:
      event.rappelMinutes === undefined ? RAPPEL_DEFAUT_MINUTES : event.rappelMinutes,
  };
}

export type EventFormProps = {
  members: FamilyMember[];
  meId: string;
  /** Les raccourcis de la maison — catégories et lieux (D45). */
  catalogue: Catalogue;
  initial: EventFormValues;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  error?: string | null;
  /** Le titre est-il le premier champ à remplir ? Faux quand on corrige. */
  autoFocusTitle?: boolean;
  onSubmit: (values: EventFormValues) => void;
  /** Rendu à côté du bouton principal quand il est fourni. */
  secondary?: React.ReactNode;
};

export function EventForm({
  members,
  meId,
  catalogue,
  initial,
  submitLabel,
  pendingLabel,
  pending,
  error,
  autoFocusTitle = true,
  onSubmit,
  secondary,
}: EventFormProps) {
  const [title, setTitle] = useState(initial.title);
  const [emoji, setEmoji] = useState<string | null>(initial.emoji);
  const [location, setLocation] = useState(initial.location);
  const [rappelMinutes, setRappelMinutes] = useState<number | null>(initial.rappelMinutes);
  const [date, setDate] = useState(initial.date);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [invited, setInvited] = useState<string[]>(initial.invited);

  /* Ce qu'un tap de catégorie a écrit dans le titre, ou `null`.
     C'est ce qui permet de remplacer « Apéro » par « Golf » au tap
     suivant sans jamais écraser ce qu'un humain a tapé (D45). */
  const [autoTitle, setAutoTitle] = useState<string | null>(null);

  const [creerCat, setCreerCat] = useState(false);
  const [catEmoji, setCatEmoji] = useState(EMOJIS[0]);
  const [catNom, setCatNom] = useState("");
  const [creerLieu, setCreerLieu] = useState(false);
  const [lieuAdresse, setLieuAdresse] = useState("");
  const [catalogueErreur, setCatalogueErreur] = useState<string | null>(null);
  const [enregistrement, startCatalogue] = useTransition();

  const categories = visibleCategories(catalogue.categories, initial.title || null);
  const lieuConnu = resolvePlace(location, catalogue.places);
  const lieuxProches = location.trim()
    ? catalogue.places
        .filter((p) => !p.archivedAt && fold(p.label).includes(fold(location)))
        .slice(0, 4)
    : catalogue.places.filter((p) => !p.archivedAt).slice(0, 4);

  const everyone = invited.length === members.length;
  const spillsOver = overnight(from, to);

  function toggle(id: string) {
    // On ne peut pas se retirer d'un événement qu'on crée.
    if (id === meId) return;
    setInvited((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <>
      <label htmlFor="event-title" className="block text-[1.0625rem] font-semibold text-ink">
        Qu’est-ce qu’on fait&nbsp;?
      </label>
      <input
        id="event-title"
        autoFocus={autoFocusTitle}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Apéro samedi soir"
        maxLength={80}
        className="mt-2.5 h-14 w-full rounded-casa-md border border-line bg-surface px-4 text-base text-ink shadow-casa-sm placeholder:text-ink-3"
      />

      {/* La rangée de catégories, qui remplace celle d'émojis en dur
          (D29, D45). Un tap remplit le titre ET l'émoji — c'est tout
          l'intérêt : le champ libre était retapé à chaque fois, et mal
          orthographié une fois sur deux. Trois événements qui sont le
          même rituel n'en avaient l'air nulle part.

          `-mx-5 px-5` : la rangée saigne jusqu'au bord. Une rangée qui
          s'arrête vingt pixels avant se lit comme terminée, et on ne
          fait pas défiler. Et `py-1` plutôt que `pb-1`, sinon l'anneau
          de la puce sélectionnée est rogné en haut. */}
      <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 py-1">
        {categories.map((c) => {
          const on = emoji === c.emoji && title.trim() === c.label;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setEmoji(c.emoji);
                const next = titleAfterTap(title, autoTitle, c);
                setTitle(next);
                setAutoTitle(next === c.label ? next : autoTitle);
              }}
              aria-pressed={on}
              className={cn(
                "flex min-h-12 shrink-0 items-center gap-1.5 rounded-casa-xl border px-3",
                "text-[1rem] font-semibold transition-colors",
                on
                  ? "border-accent bg-accent-soft text-accent-ink"
                  : "border-line bg-surface text-ink-2",
                c.archivedAt && "opacity-70",
              )}
            >
              <span aria-hidden="true" className="text-lg">{c.emoji}</span>
              {c.label}
              {c.archivedAt && (
                <span className="text-[0.8125rem] font-normal">(rangée)</span>
              )}
            </button>
          );
        })}

        {/* Toujours la dernière puce, toujours au même endroit — c'est
            ce qui permet de la retrouver sans la chercher. */}
        <button
          type="button"
          onClick={() => setCreerCat((v) => !v)}
          aria-expanded={creerCat}
          className={cn(
            "flex min-h-12 shrink-0 items-center gap-1.5 rounded-casa-xl border border-dashed px-3",
            "text-[1rem] font-semibold transition-colors",
            creerCat
              ? "border-accent bg-accent-soft text-accent-ink"
              : "border-line-strong bg-surface text-ink-2",
          )}
        >
          {creerCat ? (
            <X size={17} strokeWidth={2.4} aria-hidden="true" />
          ) : (
            <Plus size={17} strokeWidth={2.4} aria-hidden="true" />
          )}
          Nouvelle
        </button>
      </div>

      {/* **En ligne, pas dans une seconde feuille.** `Sheet` écoute
          Échap sur `document` : deux feuilles empilées se fermeraient
          toutes les deux, et on perdrait le formulaire à moitié rempli.
          Et D29 demandait de toute façon que la création reste ici —
          c'est au moment où l'on ne trouve pas sa catégorie que le
          besoin apparaît, et renvoyer vers un écran de réglages à cet
          instant-là fait abandonner avant la fin. */}
      {creerCat && (
        <div className="mt-2 rounded-casa-md border border-line bg-surface-2 p-3">
          <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3 pb-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setCatEmoji(e)}
                aria-pressed={catEmoji === e}
                aria-label={`Émoji ${e}`}
                className={cn(
                  "tap flex shrink-0 items-center justify-center rounded-casa text-xl transition-colors",
                  catEmoji === e ? "bg-accent-soft ring-2 ring-accent" : "bg-surface",
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={catNom}
              onChange={(e) => setCatNom(e.target.value)}
              placeholder="Sortie vélo"
              aria-label="Nom de la catégorie"
              maxLength={40}
              className="h-12 min-w-0 flex-1 rounded-casa-md border border-line bg-surface px-3 text-[1rem] text-ink placeholder:text-ink-2"
            />
            <button
              type="button"
              disabled={!catNom.trim() || enregistrement}
              onClick={() => {
                setCatalogueErreur(null);
                startCatalogue(async () => {
                  const r = await saveCategory({ emoji: catEmoji, label: catNom });
                  if (!r.ok) return setCatalogueErreur(r.error);
                  // On l'applique dans la foulée : on vient de la créer
                  // pour s'en servir, pas pour l'admirer dans la rangée.
                  setEmoji(r.category.emoji);
                  const next = titleAfterTap(title, autoTitle, r.category);
                  setTitle(next);
                  setAutoTitle(next === r.category.label ? next : autoTitle);
                  setCatNom("");
                  setCreerCat(false);
                });
              }}
              className="tap flex shrink-0 items-center gap-1.5 rounded-casa-md bg-accent px-3.5 text-[1rem] font-semibold text-white disabled:opacity-45"
            >
              <Check size={18} strokeWidth={2.6} aria-hidden="true" />
              Créer
            </button>
          </div>
          <p className="mt-2 text-[0.875rem] leading-snug text-ink-2">
            Toute la maison la verra. Elle reste même si tu abandonnes cet événement.
          </p>
        </div>
      )}

      <h3 className="mt-6 text-[1.0625rem] font-semibold text-ink">Quand&nbsp;?</h3>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Date"
        className="mt-2.5 h-14 w-full rounded-casa-md border border-line bg-surface px-4 text-base text-ink shadow-casa-sm"
      />
      <div className="mt-2.5 flex items-center gap-2">
        <input
          type="time"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            // Garder une heure de fin antérieure au début n'aurait
            // aucun sens *quand c'est le début qui bouge* : on la
            // repousse d'une heure. Baisser la fin soi-même, en
            // revanche, veut dire « ça déborde » — et ça, on le garde.
            if (e.target.value >= to) {
              const [h, m] = e.target.value.split(":").map(Number);
              setTo(`${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
            }
          }}
          aria-label="Heure de début"
          className="h-14 flex-1 rounded-casa-md border border-line bg-surface px-4 text-base tabular-nums text-ink shadow-casa-sm"
        />
        <span aria-hidden="true" className="text-ink-3">→</span>
        <input
          type="time"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="Heure de fin"
          className="h-14 flex-1 rounded-casa-md border border-line bg-surface px-4 text-base tabular-nums text-ink shadow-casa-sm"
        />
      </div>

      {/* Dire que ça finit le lendemain plutôt que de le faire en
          silence : « 22:00 → 02:00 » se lit aussi comme une erreur de
          saisie, et c'est la seule façon de savoir laquelle des deux
          on a sous les yeux. */}
      {spillsOver && (
        <p className="mt-2 text-[0.8125rem] text-ink-2">
          Ça se termine <strong className="font-semibold">le lendemain</strong> à {to}.
        </p>
      )}

      {/* Le champ lieu manquait depuis la phase 2 : `CreateEventInput`
          accepte `location` et les événements Google en portent un,
          mais aucun écran ne permettait d'en saisir. On pouvait donc
          voir un lieu, jamais en mettre. */}
      <label htmlFor="event-location" className="mt-6 block text-[1.0625rem] font-semibold text-ink">
        Où&nbsp;? <span className="font-normal text-ink-3">(facultatif)</span>
      </label>
      <input
        id="event-location"
        value={location}
        onChange={(e) => {
          setLocation(e.target.value);
          setCreerLieu(false);
        }}
        placeholder="Chez Mamie, le golf…"
        maxLength={120}
        className="mt-2.5 h-14 w-full rounded-casa-md border border-line bg-surface px-4 text-base text-ink shadow-casa-sm placeholder:text-ink-2"
      />

      {/* **Le champ reste du texte libre, et le lieu cohabite** (D45).
          Aucune clé étrangère : taper une puce RECOPIE le nom. C'est ce
          qui fait qu'un événement importé de Google, qui arrive avec
          une adresse brute ne correspondant à aucun lieu connu, n'a
          rien à résoudre — et que ranger un lieu ne casse pas
          l'historique.

          Proposer coûte moins cher que dédoublonner après : deux
          personnes créeront « Chez Mamie » le même jour. */}
      {lieuxProches.length > 0 && (
        <div className="no-scrollbar -mx-5 mt-2 flex gap-2 overflow-x-auto px-5 py-1">
          {lieuxProches.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setLocation(p.label);
                setCreerLieu(false);
              }}
              aria-pressed={lieuConnu?.id === p.id}
              className={cn(
                "flex min-h-12 shrink-0 items-center gap-1.5 rounded-casa-xl border px-3",
                "text-[1rem] font-semibold transition-colors",
                lieuConnu?.id === p.id
                  ? "border-accent bg-accent-soft text-accent-ink"
                  : "border-line bg-surface text-ink-2",
              )}
            >
              <MapPin size={16} strokeWidth={2.3} aria-hidden="true" className="shrink-0" />
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* **Un lieu ne se crée jamais tout seul.** Enregistrer chaque
          texte tapé remplirait la maison de fautes de frappe, et
          personne ne les nettoierait. C'est un geste explicite, et il
          n'apparaît que quand le texte ne désigne encore rien. */}
      {location.trim() && !lieuConnu && !creerLieu && (
        <button
          type="button"
          onClick={() => setCreerLieu(true)}
          className="mt-2 flex min-h-12 items-center gap-1.5 rounded-casa-xl border border-dashed border-line-strong px-3 text-[1rem] font-semibold text-ink-2"
        >
          <Plus size={17} strokeWidth={2.4} aria-hidden="true" />
          Enregistrer « {location.trim()} » comme lieu
        </button>
      )}

      {creerLieu && (
        <div className="mt-2 rounded-casa-md border border-line bg-surface-2 p-3">
          <label
            htmlFor="lieu-adresse"
            className="block pb-1.5 text-[0.875rem] font-semibold text-ink-2"
          >
            L’adresse&nbsp;? <span className="font-normal">(facultative)</span>
          </label>
          <div className="flex gap-2">
            <input
              id="lieu-adresse"
              value={lieuAdresse}
              onChange={(e) => setLieuAdresse(e.target.value)}
              placeholder="12 rue des Lilas, Toulon"
              maxLength={120}
              className="h-12 min-w-0 flex-1 rounded-casa-md border border-line bg-surface px-3 text-[1rem] text-ink placeholder:text-ink-2"
            />
            <button
              type="button"
              disabled={enregistrement}
              onClick={() => {
                setCatalogueErreur(null);
                startCatalogue(async () => {
                  const r = await savePlace({ label: location, address: lieuAdresse });
                  if (!r.ok) return setCatalogueErreur(r.error);
                  setLocation(r.place.label);
                  setLieuAdresse("");
                  setCreerLieu(false);
                });
              }}
              className="tap flex shrink-0 items-center gap-1.5 rounded-casa-md bg-accent px-3.5 text-[1rem] font-semibold text-white disabled:opacity-45"
            >
              <Check size={18} strokeWidth={2.6} aria-hidden="true" />
              Garder
            </button>
          </div>
          {/* Sans adresse, pas de bouton d'itinéraire : « Chez Mamie »
              lancé dans Maps atterrit n'importe où, et un bouton qui
              donne un mauvais résultat est pire que pas de bouton. */}
          <p className="mt-2 text-[0.875rem] leading-snug text-ink-2">
            Sans adresse, le lieu sert quand même — il n’aura juste pas d’itinéraire.
          </p>
        </div>
      )}

      {catalogueErreur && (
        <p role="alert" className="mt-2 text-[0.875rem] font-medium text-danger">
          {catalogueErreur}
        </p>
      )}

      <div className="mt-6 flex items-baseline justify-between">
        <h3 className="text-[1.0625rem] font-semibold text-ink">Avec qui&nbsp;?</h3>
        {/* `.tap` : ce bouton faisait 103 × 22 px, sous la barre des
            48. Le texte reste à sa taille — c'est la CIBLE qui grandit,
            et `-mr-2` reprend la marge que le padding ajoute pour que
            l'alignement ne bouge pas d'un pixel à l'écran. */}
        <button
          type="button"
          onClick={() => setInvited(everyone ? [meId] : members.map((m) => m.id))}
          className="tap -mr-2 flex items-center justify-end px-2 text-[0.9375rem] font-semibold text-accent"
        >
          {everyone ? "Juste moi" : "Toute la maison"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {members.map((member) => {
          const on = invited.includes(member.id);
          const locked = member.id === meId;
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => toggle(member.id)}
              aria-pressed={on}
              disabled={locked}
              className={cn(
                "flex min-h-12 items-center gap-2 rounded-casa-xl border px-2.5 py-1.5 transition-colors",
                on
                  ? "border-accent bg-accent-soft text-accent-ink"
                  : "border-line bg-surface text-ink-2",
                locked && "opacity-90",
              )}
            >
              <Avatar member={member} size="sm" dimmed={!on} />
              <span className="pr-1 text-[0.9375rem] font-semibold">{member.firstName}</span>
            </button>
          );
        })}
      </div>

      {/* ── Le rappel ────────────────────────────────────────────
          Dernier détail, et à sa place : on décide QUAND et AVEC QUI
          avant de décider quand on veut y penser. */}
      <p className="mt-6 text-[1.0625rem] font-semibold text-ink">Prévenir tout le monde</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {OPTIONS_RAPPEL.map((option) => {
          const on = rappelMinutes === option.minutes;
          return (
            <button
              key={option.libelle}
              type="button"
              onClick={() => setRappelMinutes(option.minutes)}
              aria-pressed={on}
              className={cn(
                "tap rounded-casa-xl border px-3.5 text-[0.9375rem] font-semibold transition-colors",
                on
                  ? "border-accent bg-accent-soft text-accent-ink"
                  : "border-line bg-surface text-ink-2",
              )}
            >
              {option.libelle}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-4 text-[0.875rem] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-2">
        {secondary}
        <Button
          size="lg"
          block
          disabled={pending || !title.trim()}
          onClick={() =>
            onSubmit({ title, emoji, location, date, from, to, invited, rappelMinutes })
          }
        >
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </>
  );
}

/**
 * Les deux instants ISO que les valeurs du formulaire décrivent.
 *
 * Au même endroit que le formulaire, et pas recopié chez chaque
 * appelant : la règle du débordement sur le lendemain doit être la
 * même partout, sans quoi corriger un aperçu de soirée le raccourcirait
 * de vingt-deux heures sans un mot.
 */
export function instantsOf(values: EventFormValues): { startAt: string; endAt: string } {
  return {
    startAt: combine(values.date, values.from),
    endAt: combine(values.date, values.to, overnight(values.from, values.to)),
  };
}
