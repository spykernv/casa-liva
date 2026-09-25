import type { FamilyMember } from "@/types";
import { memberStyle } from "@/lib/design/member-color";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   Avatars Casa Liva
   Minimal · flat · friendly · circulaire · reconnaissable en 32 px.
   Rendus en SVG inline : aucune requête réseau, aucun décalage de
   layout, et ils changent de couleur avec le thème sans JavaScript.
   ═══════════════════════════════════════════════════════════════ */

const SIZES = {
  sm: 32,
  md: 40,
  lg: 48,
  xl: 72,
} as const;

export type AvatarSize = keyof typeof SIZES;

/**
 * Les cinq visages, nommés.
 *
 * Exportés : c'est contre cette liste qu'`updateProfile` valide, et
 * c'est elle qui décide du modulo du hash plutôt qu'un `5` en dur.
 */
export const FACES = ["face-0", "face-1", "face-2", "face-3", "face-4"] as const;
export type FaceKey = (typeof FACES)[number];

export const FACE_LABELS: Record<FaceKey, string> = {
  "face-0": "Tout sourire",
  "face-1": "Yeux plissés",
  "face-2": "Lunettes",
  "face-3": "Clin d’œil",
  "face-4": "Joues roses",
};

export function isKnownFace(value: string): value is FaceKey {
  return (FACES as readonly string[]).includes(value);
}

const CHOSEN = /^face-([0-4])$/;

/**
 * Un choix s'il y en a un, un hash stable sinon.
 *
 * **On ne cherche pas une graine qui donnerait le bon visage.** La
 * bijection existe — `"2"` tombe sur 0, `"3"` sur 1 — et c'est
 * exactement le piège : le modulo est en dur, et le jour où un sixième
 * visage arrive, `% 6` redistribue les cinq. Tout le monde changerait
 * de tête sans qu'une ligne de la table ait bougé, et rien ne le
 * signalerait. Un préfixe explicite se lit en base.
 *
 * Rétrocompatible : `handle_new_user()` écrit `new.id::text` dans
 * `users.avatar`, donc les habitants déjà là portent leur UUID et
 * continuent de hasher. Personne ne change de visage au déploiement.
 */
function faceVariant(seed: string): number {
  const chosen = CHOSEN.exec(seed);
  if (chosen) return Number(chosen[1]);

  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % FACES.length;
}

/**
 * Cinq visages. La couleur reste l'identifiant principal — le visage
 * ajoute juste ce qu'il faut pour qu'on reconnaisse quelqu'un du coin
 * de l'œil, sans que ça devienne un personnage.
 */
function Face({ variant }: { variant: number }) {
  const eye = "currentColor";
  switch (variant) {
    case 1: // yeux plissés, grand sourire
      return (
        <g fill="none" stroke={eye} strokeWidth="2.2" strokeLinecap="round">
          <path d="M12.5 18.5q2.2-2.4 4.4 0" />
          <path d="M23.1 18.5q2.2-2.4 4.4 0" />
          <path d="M14 24.5q6 5 12 0" strokeWidth="2.4" />
        </g>
      );
    case 2: // lunettes
      return (
        <g fill="none" stroke={eye} strokeWidth="1.9" strokeLinecap="round">
          <circle cx="14.8" cy="18.4" r="3.4" />
          <circle cx="25.2" cy="18.4" r="3.4" />
          <path d="M18.2 18.4h3.6" />
          <path d="M15 25.6q5 3.4 10 0" strokeWidth="2.2" />
        </g>
      );
    case 3: // clin d'œil
      return (
        <g fill="none" stroke={eye} strokeWidth="2.2" strokeLinecap="round">
          <path d="M12.6 18.2q2.2-2.3 4.4 0" />
          <circle cx="25.3" cy="18.2" r="1.5" fill={eye} stroke="none" />
          <path d="M14.5 25q5.5 4 11 0" strokeWidth="2.3" />
        </g>
      );
    case 4: // joues roses
      return (
        <g stroke={eye} strokeLinecap="round">
          <circle cx="15" cy="18.2" r="1.6" fill={eye} stroke="none" />
          <circle cx="25" cy="18.2" r="1.6" fill={eye} stroke="none" />
          <circle cx="10.8" cy="23" r="2.1" fill={eye} stroke="none" opacity="0.35" />
          <circle cx="29.2" cy="23" r="2.1" fill={eye} stroke="none" opacity="0.35" />
          <path d="M15.5 25.4q4.5 3.2 9 0" fill="none" strokeWidth="2.2" />
        </g>
      );
    default: // le visage par défaut
      return (
        <g stroke={eye} strokeLinecap="round">
          <circle cx="15" cy="18" r="1.7" fill={eye} stroke="none" />
          <circle cx="25" cy="18" r="1.7" fill={eye} stroke="none" />
          <path d="M14.8 24.6q5.2 4 10.4 0" fill="none" strokeWidth="2.3" />
        </g>
      );
  }
}

export type AvatarProps = {
  member: Pick<FamilyMember, "firstName" | "color" | "avatar">;
  size?: AvatarSize;
  /** Anneau autour de l'avatar — utile quand ils se chevauchent. */
  ring?: boolean;
  /** Estompe l'avatar (membre désélectionné dans un filtre). */
  dimmed?: boolean;
  className?: string;
};

export function Avatar({
  member,
  size = "md",
  ring = false,
  dimmed = false,
  className,
}: AvatarProps) {
  const px = SIZES[size];
  const variant = faceVariant(member.avatar || member.firstName);

  return (
    <span
      style={memberStyle(member.color)}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full transition-opacity",
        ring && "ring-2 ring-bg",
        dimmed && "opacity-35",
        className,
      )}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 40 40"
        role="img"
        aria-label={member.firstName}
        className="rounded-full"
      >
        <circle cx="20" cy="20" r="20" fill="var(--m)" />
        <g color="#fff" opacity="0.94">
          <Face variant={variant} />
        </g>
      </svg>
    </span>
  );
}

export type AvatarStackProps = {
  members: Pick<FamilyMember, "id" | "firstName" | "color" | "avatar">[];
  size?: AvatarSize;
  /** Au-delà, on affiche « +N » plutôt que d'empiler indéfiniment. */
  max?: number;
  className?: string;
};

export function AvatarStack({
  members,
  size = "sm",
  max = 4,
  className,
}: AvatarStackProps) {
  const shown = members.slice(0, max);
  const overflow = members.length - shown.length;
  const px = SIZES[size];

  return (
    <span
      className={cn("inline-flex items-center", className)}
      // Un seul libellé pour tout le groupe : un lecteur d'écran doit
      // entendre « Jonathan, Papa, Mamie », pas trois images séparées.
      role="img"
      aria-label={members.map((m) => m.firstName).join(", ")}
    >
      {shown.map((m, i) => (
        <span key={m.id} className={i > 0 ? "-ml-2" : undefined} aria-hidden="true">
          <Avatar member={m} size={size} ring />
        </span>
      ))}
      {overflow > 0 && (
        <span
          aria-hidden="true"
          style={{ width: px, height: px }}
          className="-ml-2 inline-flex items-center justify-center rounded-full bg-surface-3 text-[0.7em] font-semibold text-ink-2 ring-2 ring-bg"
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}
