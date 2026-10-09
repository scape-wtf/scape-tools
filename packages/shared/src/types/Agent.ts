/** Parked experiment: no runtime/environment opt-in. See internal FR-180/FR-181 notes. */
export const AGENT_BUILDING_ENABLED: boolean = false;
/** Maximum display-name length accepted by the external agent gateway. */
export const AGENT_NAME_MAX_LENGTH = 24;
/** A bounded object visible to an admitted agent. Coordinates are room-local. */
export interface AgentSceneObject {
  /** Optional stable object identifier for interaction targets. */
  id?: string;
  /** Revision-bound token for removal; distinct from the interaction ID. */
  editTarget?: string;
  /** Effective permission for removing this object. */
  canRemove?: boolean;
  /** Horizontal room coordinate. */
  x: number;
  /** Vertical room coordinate. */
  y: number;
  /** Public object emoji. */
  emoji: string;
  /** Floor containing the object. */
  floor?: 0 | 1;
  /** Whether this object marks an entry point. */
  isEntry?: boolean;
  /** Bounded text displayed by a sign or world object. */
  message?: string;
  /** Public destination label for a linked room. */
  targetRoomName?: string;
  /** Whether the object is connected to another room. */
  linkedRoom?: boolean;
  /** Public portal-pair identifier when applicable. */
  portalPairId?: string;
  /** Whether a radio interaction is configured. */
  radioConfigured?: boolean;
  /** Direction of a conveyor object. */
  conveyorEmoji?: '➡️' | '⬇️' | '⬅️' | '⬆️';
  /** Piano note label, when exposed by the room catalog. */
  pianoNote?: string;
  /** Public piano sound identifier. */
  pianoSound?: string;
}
/** Bounded scene summary supplied to an agent; it is not raw room state. */
export interface AgentScene {
  /** Blocked cell indexes for the active floor. */
  blocked: number[];
  /** Public objects visible to the agent. */
  objects: AgentSceneObject[];
  /** Active floor. */
  floor?: 0 | 1;
  /** Whether the room exposes a basement floor. */
  hasBasement?: boolean;
  /** Current editing policy for the room. */
  editing?: 'everyone' | 'owner';
  /** Persisted scene revision required by edits, separate from observation revisions. */
  sceneRevision?: number;
  /** Current editing grant and effective pairing-account privileges. */
  editCapabilities?: AgentEditingCapabilities;
  /** Bounded public game facts relevant to agent behavior. */
  gameFacts?: { gemsEnabled: boolean; gemRefundHours: number };
}
/** A room-local grid position. */
export interface AgentPosition {
  x: number;
  y: number;
  floor: 0 | 1;
}
/** Lifecycle of one movement request accepted by Scape. */
export interface AgentMovement {
  id: string;
  target: AgentPosition;
  status: 'moving' | 'arrived' | 'stopped' | 'blocked' | 'timed_out' | 'disconnected';
}
/** State of a bounded follow or approach request targeting one player. */
export interface AgentPursuit {
  id: string;
  player: string;
  mode: 'follow' | 'approach';
  status: 'moving' | 'holding' | 'arrived' | 'stopped' | 'lost' | 'blocked' | 'timed_out';
  expiresAt: number;
}
/** Snapshot delivered by the external agent gateway. */
export interface AgentObservation {
  protocol: 1;
  sessionId: string;
  revision: number;
  observedAt: number;
  room: string;
  status: string;
  self: (AgentPosition & { id: string; name: string; text: string }) | null;
  players: Array<
    AgentPosition & {
      id: string;
      name: string;
      text: string;
      textRevision: number;
      settled: boolean;
    }
  >;
  objects: Array<AgentPosition & { emoji: string; text?: string }>;
  blocked: Array<{ x: number; y: number }>;
  movement: AgentMovement | null;
  scene?: AgentScene;
  roster?: Array<AgentPosition & { id: string; name: string; encounterKey?: string }>;
  interacting?: boolean;
  pursuit?: AgentPursuit | null;
  appearance?: {
    kind: string;
    emoji: string;
    model: string | null;
    expression?: string;
    expressions?: string[];
  };
  limits: { radius: number; heartbeatMs: number; idleTimeoutMs: number; maxSpeechLength: number };
}

/** Editing is separately approved during pairing and checked again on every mutation. */
export interface AgentEditingCapabilities {
  enabled: boolean;
  canPlace: boolean;
  canRemoveOthers: boolean;
  canManageRadios: boolean;
  maxEditsPerMinute: number;
  /** null: paced edits continue for the lifetime of the active session. */
  maxEditsPerSession: number | null;
}
/** Installed placement definitions and their default configuration envelopes. */
export interface AgentObjectCatalog {
  capabilities: AgentEditingCapabilities;
  plainEmoji: boolean;
  objects: Array<{
    emoji: string;
    label: string;
    type: string;
    version: number;
    configuration?: { type: string; version: number; values: Record<string, unknown> };
  }>;
}
/** Single pictograph, joined emoji, flag or keycap; text is not a world sprite. */
export const AGENT_OBJECT_EMOJI: RegExp =
  /^(?:\p{Extended_Pictographic}[\uFE0E\uFE0F]?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}[\uFE0E\uFE0F]?\p{Emoji_Modifier}?)*|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)$/u;
