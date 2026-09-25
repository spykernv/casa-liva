/* ═══════════════════════════════════════════════════════════════
   Types Postgres de Casa Liva.

   Reflètent `supabase/migrations/`. Vérifiés contre la sortie de
   `generate_typescript_types` du projet `kfiycbsussdqqtlzrwvn`.
   Toute migration doit être répercutée ici dans le même commit.
   ═══════════════════════════════════════════════════════════════ */

export type MemberColorDb =
  | "blue" | "green" | "pink" | "purple"
  | "orange" | "teal" | "red" | "ochre";
export type FamilyRoleDb = "owner" | "member";
export type EventSourceDb = "casa-liva" | "google";
export type ParticipantStatusDb = "pending" | "accepted" | "declined";
export type VisibilityModeDb = "availability" | "titles" | "full";

type UserRow = {
  id: string;
  email: string;
  first_name: string;
  avatar: string;
  color: MemberColorDb;
  timezone: string;
  /**
   * Résumés et rappels automatiques. Ne couvre **pas** les invitations
   * à un événement ni le lien de connexion : ceux-là répondent à une
   * action de quelqu'un, les taire trahirait l'attente.
   */
  wants_digests: boolean;
  /**
   * La voix d'ElevenLabs choisie par la personne (migration 0013).
   *
   * `null` veut dire « je n'ai pas choisi », pas « la voix par
   * défaut » : ceux qui n'ont rien choisi suivront la maison le jour
   * où elle changera d'avis, ceux qui ont choisi garderont la leur.
   * La liste des valeurs acceptées vit dans `lib/voice/voices.ts` —
   * elle bouge au rythme du catalogue d'ElevenLabs, pas du schéma.
   */
  voice_id: string | null;
  /**
   * Le pendant de `wants_digests` pour le téléphone (migration 0016).
   *
   * **Deux interrupteurs et non un**, décidé avec le commanditaire : le
   * push passe en premier, l'email prend le relais faute d'abonnement.
   * Jamais les deux pour le même événement — sinon on finit par couper
   * les deux (§66 bis).
   */
  wants_push: boolean;
  created_at: string;
  updated_at: string;
};

type FamilyRow = {
  id: string;
  name: string;
  created_at: string;
};

type FamilyMemberRow = {
  family_id: string;
  user_id: string;
  role: FamilyRoleDb;
  joined_at: string;
};

type EventRow = {
  id: string;
  family_id: string;
  creator_id: string;
  title: string;
  description: string | null;
  emoji: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  source: EventSourceDb;
  external_event_id: string | null;
  /** La connexion qui a importé l'événement. `null` = créé dans Casa Liva. */
  connection_id: string | null;
  /** L'événement mobilise-t-il la personne ? Un « Disponible » Google vaut `false`. */
  busy: boolean;
  is_private: boolean;
  /** Minutes avant le début pour prévenir. `null` = pas de rappel (0017). */
  rappel_minutes: number | null;
  /**
   * Le `start_at` **pour lequel** le rappel est parti.
   *
   * Une date et non un booléen : si l'heure change, la valeur cesse de
   * correspondre et le rappel repart seul. Aucun chemin de déplacement
   * à tenir à jour — ni les Server Actions, ni l'aperçu d'IA, ni la
   * synchronisation Google.
   */
  rappel_envoye_pour: string | null;
  created_at: string;
  updated_at: string;
};

type EventParticipantRow = {
  event_id: string;
  user_id: string;
  status: ParticipantStatusDb;
};

/**
 * Le secret qui permet de répondre « je viens » depuis l'email, sans
 * être connecté (§16).
 *
 * Table à part, RLS active et **aucune policy** : personne n'y accède
 * depuis une session utilisateur. Seule la clé de service passe, donc
 * seul le code qui envoie les emails. Un jeton n'existe que si un
 * message est réellement parti.
 */
type EventRsvpTokenRow = {
  event_id: string;
  user_id: string;
  token: string;
  created_at: string;
};

/**
 * Le secret qui permet d'éteindre les résumés depuis le pied d'un
 * email. Même protection que ci-dessus, et pour la même raison : la
 * table `users` est lisible par toute la maison.
 */
type UnsubscribeTokenRow = {
  user_id: string;
  token: string;
  created_at: string;
};

type CalendarConnectionRow = {
  id: string;
  user_id: string;
  /** La maison où atterrissent les événements. Figée à la connexion. */
  family_id: string;
  provider: string;
  /**
   * Incrémenté à chaque changement de réglage. Le moteur de
   * synchronisation abandonne s'il a bougé pendant qu'il lisait :
   * sinon une lecture en vol réinstallerait les titres qu'on vient de
   * masquer.
   */
  sync_generation: number;
  external_calendar_id: string;
  /** Le nom de l'agenda chez le fournisseur — « Perso », « Boulot ». */
  name: string;
  visibility_mode: VisibilityModeDb;
  /** Curseur opaque du fournisseur. Ne jamais l'interpréter (D10). */
  sync_cursor: string | null;
  last_synced_at: string | null;
  /** Dernière lecture COMPLÈTE — c'est elle qui fait avancer l'horizon. */
  last_full_sync_at: string | null;
  /** Le jeton est mort : seule une reconnexion humaine s'en sort. */
  needs_reauth: boolean;
  last_error: string | null;
  last_error_at: string | null;
  created_at: string;
  updated_at: string;
};

type FamilyInviteRow = {
  id: string;
  family_id: string;
  email: string;
  invited_by: string;
  token: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
};

type AiConversationRow = {
  id: string;
  user_id: string;
  family_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

type AiMessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
};

type AudioGenerationRow = {
  id: string;
  user_id: string;
  text_hash: string;
  text: string;
  provider: string;
  voice_id: string | null;
  audio_url: string | null;
  status: "pending" | "ready" | "failed";
  created_at: string;
};

/**
 * Un brouillon d'action de Casa AI (migration 0014).
 *
 * `payload` porte les arguments **déjà résolus** — dates réelles,
 * identifiants d'habitants — et non ce que le modèle a écrit. Il est
 * typé lâche ici parce que sa forme dépend du tool ; `lib/ai/drafts.ts`
 * la resserre à la lecture, et c'est le bon endroit : une forme fausse
 * en base doit être refusée à la relecture, pas crue sur parole.
 */
type AiActionDraftRow = {
  id: string;
  user_id: string;
  family_id: string;
  conversation_id: string | null;
  tool: "create_event" | "modify_event" | "delete_event";
  payload: Record<string, unknown>;
  consumed_at: string | null;
  result_event_id: string | null;
  expires_at: string;
  created_at: string;
};

/* ── Les raccourcis de la maison (migration 0015) ─────────────────
   Deux tables jumelles, et l'absence de `creator_id` dans les deux EST
   la règle produit : un événement appartient à qui l'organise (D21),
   un descripteur appartient à la maison et se corrige par n'importe qui
   (D20, D29, D45).

   **La colonne s'appelle `label` et non `name`, et c'est structurel.**
   `Defaulted`, plus bas, est une union GLOBALE qui contient déjà
   `"name"` — pour `families.name`. Une colonne ainsi nommée deviendrait
   optionnelle à l'insertion alors qu'elle est `not null` sans défaut :
   le trou serait silencieux à la compilation, et ne se verrait qu'en
   base, en production.

   Aucune de ces deux tables n'apparaît dans `EventRow` : rien ne les
   référence. Un tap RECOPIE le titre, l'émoji et le nom du lieu sur
   l'événement, qui garde donc sa propre copie du texte. C'est ce qui
   rend la suppression inoffensive et l'import Google indifférent.
   ─────────────────────────────────────────────────────────────── */

type EventCategoryRow = {
  id: string;
  family_id: string;
  emoji: string;
  label: string;
  /** Rangée, jamais supprimée : aucune policy `for delete` n'existe. */
  archived_at: string | null;
  /** Vraie pour les six posées par le déclencheur à la création de la
   *  maison. N'accorde aucun privilège et n'entre dans aucune policy —
   *  elle ne sert qu'au déménagement, qui n'emporte pas le socle. */
  seeded: boolean;
  created_at: string;
  updated_at: string;
};

type PlaceRow = {
  id: string;
  family_id: string;
  label: string;
  /** Facultative, et c'est elle seule qui fait apparaître l'itinéraire :
   *  « Chez Mamie » dans Maps atterrirait n'importe où. */
  address: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Un abonnement Web Push, par APPAREIL (migration 0016).
 *
 * Pas une colonne sur `users` : la même personne a un téléphone et une
 * tablette, et se désabonner de l'un ne doit pas couper l'autre.
 * `endpoint` est l'adresse que le service de push attribue à cette
 * installation précise — c'est elle qui fait l'identité.
 */
type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  /** « iPhone », « Android » — de quoi s'y retrouver, jamais l'agent complet. */
  appareil: string | null;
  created_at: string;
  dernier_succes_at: string | null;
  /**
   * Envois refusés d'affilée. **Un abonnement meurt sans prévenir** :
   * le service répond `404` ou `410` une fois, puis accepte tout sans
   * rien livrer. Sans ce compteur, la file se remplit d'adresses
   * fantômes et personne ne le voit — même famille de panne que
   * `needs_reauth` sur les jetons Google.
   */
  echecs: number;
};

/** Colonnes fournies par un `default` côté base, donc optionnelles à l'insertion. */
type Defaulted =
  | "id" | "created_at" | "updated_at" | "joined_at"
  | "token" | "expires_at" | "status" | "role" | "color"
  | "avatar" | "first_name" | "timezone" | "name"
  | "all_day" | "source" | "is_private" | "provider"
  | "visibility_mode" | "needs_reauth" | "busy" | "sync_generation"
  // `voice_id` est nullable sans valeur par défaut : Postgres la met à
  // `null` tout seul, donc elle est optionnelle à l'insertion — et
  // `null` est justement l'état « je n'ai pas choisi ».
  // `seeded` (0015) : `false` par défaut. Le socle est posé par le
  // déclencheur, qui la met à `true` explicitement ; tout le reste est
  // créé à la main et n'a pas à s'en soucier.
  | "wants_digests" | "voice_id" | "seeded"
  // 0016 : `wants_push` vaut `true` par défaut, `echecs` vaut 0.
  | "wants_push" | "echecs";

/** Une colonne nullable n'a pas à être fournie : Postgres y mettra `null`. */
type NullableKeys<Row> = {
  [K in keyof Row]-?: null extends Row[K] ? K : never;
}[keyof Row];

type OptionalOnInsert<Row> = Extract<keyof Row, Defaulted> | NullableKeys<Row>;

/**
 * `Relationships` n'est pas décoratif : c'est ce que `supabase-js`
 * consulte pour typer les sélections imbriquées
 * (`select("*, event_participants(...)")`). Sans les bonnes entrées,
 * l'inférence renvoie un `SelectQueryError` au lieu du type attendu.
 */
type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type Table<Row, Rel extends readonly Relationship[] = []> = {
  Row: Row;
  Insert: Omit<Row, OptionalOnInsert<Row>> &
    Partial<Pick<Row, OptionalOnInsert<Row>>>;
  Update: Partial<Row>;
  Relationships: Rel;
};

/** Raccourci : toutes nos clés étrangères pointent vers une colonne `id`. */
type FK<Name extends string, Col extends string, Target extends string> = {
  foreignKeyName: Name;
  columns: [Col];
  isOneToOne: false;
  referencedRelation: Target;
  referencedColumns: ["id"];
};

export type Database = {
  public: {
    Tables: {
      users: Table<UserRow>;
      families: Table<FamilyRow>;
      family_members: Table<
        FamilyMemberRow,
        [
          FK<"family_members_family_id_fkey", "family_id", "families">,
          FK<"family_members_user_id_fkey", "user_id", "users">,
        ]
      >;
      events: Table<
        EventRow,
        [
          FK<"events_connection_id_fkey", "connection_id", "calendar_connections">,
          FK<"events_creator_id_fkey", "creator_id", "users">,
          FK<"events_family_id_fkey", "family_id", "families">,
        ]
      >;
      event_participants: Table<
        EventParticipantRow,
        [
          FK<"event_participants_event_id_fkey", "event_id", "events">,
          FK<"event_participants_user_id_fkey", "user_id", "users">,
        ]
      >;
      event_rsvp_tokens: Table<
        EventRsvpTokenRow,
        [
          FK<"event_rsvp_tokens_event_id_fkey", "event_id", "events">,
          FK<"event_rsvp_tokens_user_id_fkey", "user_id", "users">,
        ]
      >;
      unsubscribe_tokens: Table<
        UnsubscribeTokenRow,
        [FK<"unsubscribe_tokens_user_id_fkey", "user_id", "users">]
      >;
      calendar_connections: Table<
        CalendarConnectionRow,
        [
          FK<"calendar_connections_family_id_fkey", "family_id", "families">,
          FK<"calendar_connections_user_id_fkey", "user_id", "users">,
        ]
      >;
      family_invites: Table<
        FamilyInviteRow,
        [
          FK<"family_invites_family_id_fkey", "family_id", "families">,
          FK<"family_invites_invited_by_fkey", "invited_by", "users">,
        ]
      >;
      ai_conversations: Table<
        AiConversationRow,
        [
          FK<"ai_conversations_family_id_fkey", "family_id", "families">,
          FK<"ai_conversations_user_id_fkey", "user_id", "users">,
        ]
      >;
      ai_messages: Table<
        AiMessageRow,
        [FK<"ai_messages_conversation_id_fkey", "conversation_id", "ai_conversations">]
      >;
      audio_generations: Table<
        AudioGenerationRow,
        [FK<"audio_generations_user_id_fkey", "user_id", "users">]
      >;
      ai_action_drafts: Table<
        AiActionDraftRow,
        [
          FK<"ai_action_drafts_user_id_fkey", "user_id", "users">,
          FK<"ai_action_drafts_family_id_fkey", "family_id", "families">,
          FK<
            "ai_action_drafts_conversation_id_fkey",
            "conversation_id",
            "ai_conversations"
          >,
          FK<"ai_action_drafts_result_event_id_fkey", "result_event_id", "events">,
        ]
      >;
      event_categories: Table<
        EventCategoryRow,
        [FK<"event_categories_family_id_fkey", "family_id", "families">]
      >;
      places: Table<
        PlaceRow,
        [FK<"places_family_id_fkey", "family_id", "families">]
      >;
      push_subscriptions: Table<
        PushSubscriptionRow,
        [FK<"push_subscriptions_user_id_fkey", "user_id", "users">]
      >;
    };
    Views: Record<never, never>;
    Functions: {
      create_family: { Args: { family_name?: string }; Returns: string };
      accept_family_invite: { Args: { invite_token: string }; Returns: string };

      /* ── Jetons OAuth ───────────────────────────────────────────
         `private.oauth_credentials` est hors de portée de PostgREST :
         le schéma n'est pas exposé, clé de service comprise. Ces
         fonctions sont le seul chemin, et seul `service_role` a le
         droit de les appeler.
         ───────────────────────────────────────────────────────── */
      save_oauth_credentials: {
        Args: {
          p_user_id: string;
          p_provider: string;
          p_refresh_token: string;
          p_access_token: string | null;
          p_expires_at: string | null;
          p_scopes: string | null;
        };
        Returns: undefined;
      };
      save_oauth_access_token: {
        Args: {
          p_user_id: string;
          p_provider: string;
          p_access_token: string;
          p_expires_at: string;
        };
        Returns: undefined;
      };
      get_oauth_credentials: {
        Args: { p_user_id: string; p_provider: string };
        Returns: {
          refresh_token: string;
          access_token: string | null;
          expires_at: string | null;
          scopes: string | null;
        }[];
      };
      delete_oauth_credentials: {
        Args: { p_user_id: string; p_provider: string };
        Returns: undefined;
      };
    };
    Enums: {
      member_color: MemberColorDb;
      family_role: FamilyRoleDb;
      event_source: EventSourceDb;
      participant_status: ParticipantStatusDb;
      visibility_mode: VisibilityModeDb;
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
