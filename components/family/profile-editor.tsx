"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil } from "lucide-react";
import { MEMBER_COLORS, type FamilyMember, type MemberColor } from "@/types";
import { Avatar, FACES, FACE_LABELS } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MEMBER_COLOR_LABELS, memberStyle } from "@/lib/design/member-color";
import { updateProfile } from "@/actions/family";
import { cn } from "@/lib/utils";

export function ProfileEditor({ me }: { me: FamilyMember }) {
  const [firstName, setFirstName] = useState(me.firstName);
  const [color, setColor] = useState<MemberColor>(me.color);
  const [face, setFace] = useState(me.avatar);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const dirty =
    firstName.trim() !== me.firstName || color !== me.color || face !== me.avatar;

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateProfile({ firstName, color, avatar: face });
      if (!result.ok) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <>
      <section className="flex flex-col items-center px-4 pt-6 text-center">
        {/* L'aperçu suit les trois réglages. Il ne lisait que `me`,
            donc le visage n'y bougeait jamais — on choisissait sans
            voir ce qu'on choisissait. */}
        <Avatar member={{ ...me, color, avatar: face }} size="xl" />
        <p className="mt-3 text-[0.875rem] text-ink-2">{me.email}</p>
      </section>

      {/* Le champ portait `border-transparent bg-transparent
          hover:border-line` : au repos il ressemblait à un titre, et sa
          seule révélation était un survol — que Safari iOS ne déclenche
          qu'après un premier tap, donc l'affordance n'apparaissait qu'à
          ceux qui n'en avaient plus besoin. Il faisait en plus la
          hauteur de sa ligne de texte, sous les 48 px exigés. Il a
          maintenant un intitulé, une bordure et 48 px de haut, comme
          « Ta couleur » juste en dessous. */}
      <section className="px-4 pt-7">
        <label
          htmlFor="profil-prenom"
          className="block pb-2.5 text-[0.8125rem] font-bold uppercase tracking-wide text-ink-2"
        >
          Ton prénom
        </label>
        {/* Le crayon est **décoratif**, et c'est important : il vit
            dans le champ, pas à côté. Un crayon posé à côté se lit
            comme un bouton — on le tape, il ne fait rien, et on
            conclut que le prénom ne se change pas. Ici il annonce ce
            que la bordure dit déjà, sans ajouter une cible morte.

            `pr-11` réserve sa place : sans ça, un prénom long passe
            dessous. */}
        <div className="relative">
          <input
            id="profil-prenom"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              setSaved(false);
            }}
            autoComplete="given-name"
            maxLength={40}
            className="h-12 w-full rounded-casa-md border border-line bg-surface pl-4 pr-11 text-[1.0625rem] font-semibold text-ink shadow-casa-sm placeholder:text-ink-2 focus:border-accent"
          />
          <Pencil
            size={18}
            strokeWidth={2.2}
            aria-hidden="true"
            className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-2"
          />
        </div>
      </section>

      <section className="px-4 pt-7">
        <h3 className="pb-2.5 text-[0.8125rem] font-bold uppercase tracking-wide text-ink-2">
          Ton visage
        </h3>
        <div className="flex flex-wrap gap-2.5">
          {FACES.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFace(f);
                setSaved(false);
              }}
              aria-label={FACE_LABELS[f]}
              aria-pressed={f === face}
              className={cn(
                "tap flex items-center justify-center rounded-full transition-transform",
                f === face
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-bg"
                  : "hover:scale-105",
              )}
            >
              <Avatar member={{ ...me, color, avatar: f }} size="md" />
            </button>
          ))}
        </div>
      </section>

      <section className="px-4 pt-7">
        <h3 className="pb-2.5 text-[0.8125rem] font-bold uppercase tracking-wide text-ink-2">
          Ta couleur
        </h3>
        <div className="flex flex-wrap gap-2.5">
          {MEMBER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setColor(c);
                setSaved(false);
              }}
              style={memberStyle(c)}
              aria-label={MEMBER_COLOR_LABELS[c]}
              aria-pressed={c === color}
              className={cn(
                "tap flex items-center justify-center rounded-full transition-transform",
                c === color
                  ? "ring-2 ring-accent ring-offset-2 ring-offset-bg"
                  : "hover:scale-105",
              )}
            >
              <span className="h-10 w-10 rounded-full bg-[var(--m)]" />
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-[0.875rem] font-medium text-danger">
            {error}
          </p>
        )}

        {(dirty || saved) && (
          <Button block className="mt-4" disabled={pending || !dirty} onClick={save}>
            {saved && !dirty ? (
              <>
                <Check size={18} strokeWidth={2.4} aria-hidden="true" />
                Enregistré
              </>
            ) : pending ? (
              "On enregistre…"
            ) : (
              "Enregistrer"
            )}
          </Button>
        )}
      </section>
    </>
  );
}
