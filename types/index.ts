/* ═══════════════════════════════════════════════════════════════
   CASA LIVA — Modèle de domaine
   Ces types miroitent le schéma Postgres (voir supabase/migrations).
   Toute évolution doit être faite des deux côtés en même temps.
   ═══════════════════════════════════════════════════════════════ */

/** Les 8 teintes attribuables à un membre. Voir app/globals.css. */
export type MemberColor =
  | "blue"
  | "green"
  | "pink"
  | "purple"
  | "orange"
  | "teal"
  | "red"
  | "ochre";

export const MEMBER_COLORS: readonly MemberColor[] = [
  "blue",
  "green",
  "pink",
  "purple",
  "orange",
  "teal",
  "red",
  "ochre",
] as const;

/** Rôle dans la maison. `owner` peut inviter et retirer des membres. */
export type FamilyRole = "owner" | "member";

export type FamilyMember = {
  id: string;
  firstName: string;
  email: string;
  /** Clé de l'avatar généré (visage minimal). Pas de photo dans le MVP. */
  avatar: string;
  color: MemberColor;
  timezone: string;
  role?: FamilyRole;
};

export type Family = {
  id: string;
  name: string;
  createdAt: string;
};

/** D'où vient l'événement : créé dans Casa Liva, ou importé de Google. */
export type EventSource = "casa-liva" | "google";

export type ParticipantStatus = "pending" | "accepted" | "declined";

export type EventParticipant = {
  eventId: string;
  userId: string;
  status: ParticipantStatus;
};

/* ── Les raccourcis de la maison (D20, D29, D45) ─────────────────
   Un lieu et une catégorie **décrivent** un événement sans lui
   appartenir : ils sont à la maison, et n'importe quel habitant les
   corrige. Aucun événement ne les référence — un tap RECOPIE le titre,
   l'émoji et le nom du lieu sur l'événement, qui garde donc sa propre
   copie du texte.
   ─────────────────────────────────────────────────────────────── */

export type EventCategory = {
  id: string;
  familyId: string;
  emoji: string;
  label: string;
  /** Rangée, jamais supprimée : elle quitte la rangée de création et
   *  reste lisible sur les événements qui la portent. */
  archivedAt?: string;
  /** Vraie pour les six posées à la création de la maison. */
  seeded: boolean;
};

export type Place = {
  id: string;
  familyId: string;
  label: string;
  /** Facultative, et c'est elle seule qui fait l'itinéraire. */
  address?: string;
  archivedAt?: string;
};

/** Ce que la maison a écrit une fois, et réutilise. */
export type Catalogue = {
  categories: EventCategory[];
  places: Place[];
};

export type CasaEvent = {
  id: string;
  familyId: string;
  creatorId: string;

  title: string;
  description?: string;

  /** ISO 8601 avec fuseau. Toujours stocké en UTC côté base. */
  startAt: string;
  endAt: string;

  allDay?: boolean;
  location?: string;

  source: EventSource;
  externalEventId?: string;

  /**
   * L'événement mobilise-t-il réellement la personne ?
   *
   * Google sépare « Occupé » de « Disponible ». Un anniversaire ou un
   * jour férié marque la journée sans la remplir : le compter comme
   * occupé ferait disparaître « ✨ tout le monde est libre » les jours
   * où la famille l'est justement le plus.
   *
   * Absent ou `true` = occupe. Seul l'import externe pose `false`.
   */
  busy?: boolean;

  /**
   * L'événement occupe un créneau mais son contenu est masqué :
   * on affiche « 🔒 Jonathan occupé » et rien de plus (§19).
   * Découle du `visibility_mode` de la connexion Google d'origine.
   */
  isPrivate?: boolean;

  /** Émoji facultatif affiché devant le titre (🍝, ⛳, 🎬…). */
  emoji?: string;

  /**
   * Combien de minutes avant le début prévenir tout le monde.
   * `null` ou absent = pas de rappel.
   *
   * **Propriété de l'événement, pas préférence de qui le reçoit** (D56).
   * Un train ne se prépare pas comme un cinéma, et c'est vrai pour tous
   * ceux qui y vont. Il appartient donc à qui organise (D21). Ce qui
   * reste à chacun, c'est `wants_push` : pas *quand*, mais *si*.
   */
  rappelMinutes?: number | null;

  participants: EventParticipant[];

  createdAt: string;
  updatedAt: string;
};

/* ── Google Calendar ─────────────────────────────────────────── */

/**
 * Ce que Casa Liva a le droit de montrer aux autres membres
 * des événements importés d'un agenda personnel (§19).
 */
export type VisibilityMode =
  /** « Jonathan occupé 14:00 → 15:00 » — aucun titre. */
  | "availability"
  /** Le titre, sans description ni lieu ni invités. */
  | "titles"
  /** Tout. */
  | "full";

export type CalendarConnection = {
  id: string;
  userId: string;
  provider: "google";
  externalCalendarId: string;
  syncToken?: string;
  visibilityMode: VisibilityMode;
  lastSyncedAt?: string;
};

/* ── Moteur de disponibilités ────────────────────────────────── */

/** Intervalle demi-ouvert [start, end). Millisecondes epoch. */
export type Interval = {
  start: number;
  end: number;
};

/** Un créneau où tous les participants demandés sont libres. */
export type CommonSlot = Interval & {
  /** Participants libres sur ce créneau. */
  userIds: string[];
  /** Score de confort : heure décente, marge autour, week-end… */
  score: number;
};

/* ── Casa AI ─────────────────────────────────────────────────── */

export type AIProviderName = "anthropic" | "groq";

export type AIRole = "user" | "assistant" | "system";

export type AIMessage = {
  id: string;
  conversationId: string;
  role: AIRole;
  content: string;
  provider?: AIProviderName;
  model?: string;
  createdAt: string;
};

export type AudioGenerationStatus = "pending" | "ready" | "failed";

export type AudioGeneration = {
  id: string;
  userId: string;
  text: string;
  provider: "elevenlabs";
  audioUrl?: string;
  status: AudioGenerationStatus;
  createdAt: string;
};
