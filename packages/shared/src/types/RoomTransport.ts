/** Cloudflare room wire contract. Capacity is a service ceiling, not the shipping room limit. */
export const ROOM_PROTOCOL = 1;
/** Wire safety bound; conversational brevity is a soft model instruction. */
export const MAX_STATUS_TEXT_LENGTH = 320;
export const CAPACITY = 100;
export const GRID = { width: 64, height: 40 } as const;
export const RECONNECT_MS = 15_000;
export const HEARTBEAT_MS = 10_000;
export const MAX_TICKET_MS = 10 * 60_000;
/** Validate a public room slug before it reaches routing or storage. */
export const roomName = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
/** Validate an external identity used in room transport messages. */
export const identity = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9._~-]{1,128}$/.test(value);
/** Signed admission claims used only between the room authority and transport. */
export interface Admission {
  v: 1;
  aud: 'koro-room' | 'koro-observer';
  room: string;
  sub: string;
  session: string;
  name: string;
  jti: string;
  iat: number;
  exp: number;
  world?: RoomWorld;
  profilePolicy?: { v: 1; locked: boolean; blocked: string[] };
}
/** Signed scene geometry; never supplied by a player message. */
/** Signed cross-floor travel geometry. */
export interface RoomTravel {
  source: number;
  target: number;
  exits: [number, number][];
  relative?: boolean;
  cooldownMs: number;
}
/** Collision, portal, spawn, and travel data for one floor. */
export interface RoomFloorGeometry {
  travels?: RoomTravel[];
  blocked: number[];
  portals: [number, number][];
  spawn: [number, number];
}
/** Signed room geometry delivered during admission. */
export interface RoomWorld extends RoomFloorGeometry {
  basement?: RoomFloorGeometry;
  entrance?: number;
  exit?: number;
  instance: number;
  revision: number;
}
/** Public player appearance metadata, separate from live identity credentials. */
export interface RoomProfile {
  revision: number;
  emoji: string;
  avatar: string | null;
  avatarCircular: boolean;
  model: string | null;
}
export type RoomEvent =
  | { type: 'scene-committed' | 'coins-committed' | 'room-updated' }
  | { type: 'soundboard'; clipId: string }
  | { type: 'interaction'; target: string; interaction: 'press' | 'hurt' };
/** Compact player state used by room snapshots and deltas. */
export interface Player {
  floor?: 0 | 1;
  id: string;
  name: string;
  x: number;
  y: number;
  seq: number;
  connected: boolean;
  profileRevision?: number;
  typingText?: string;
  voiceOn?: boolean;
  teleported?: boolean;
}
export type RoomMessage =
  | {
      type: 'welcome';
      v: 1;
      self: string;
      revision: number;
      players: Player[];
      soundboardUnknownIds?: 'ignore';
      floors?: true;
      observer?: true;
    }
  | { type: 'snapshot'; revision: number; players: Player[] }
  | { type: 'delta'; revision: number; players: Player[]; removed: string[] }
  | { type: 'profile'; id: string; profile: RoomProfile }
  | { type: 'event'; from: string; event: RoomEvent }
  | {
      type: 'rejected';
      reason: string;
      seq?: number;
      position?: { x: number; y: number; seq: number };
    }
  | { type: 'pong'; now: number }
  | { type: 'lease'; expiresAt: number };
export type ClientMessage =
  | { type: 'authenticate'; token: string }
  | { type: 'renew'; token: string }
  | { type: 'move'; seq: number; x: number; y: number; teleported?: boolean; floor?: 0 | 1 }
  | { type: 'floor-travel'; seq: number; floor: 0 | 1 }
  | { type: 'profile'; profile: RoomProfile }
  | { type: 'profile-request'; id: string }
  | { type: 'profile-ack'; id: string; revision: number }
  | { type: 'status'; text: string; voiceOn: boolean }
  | { type: 'event'; event: RoomEvent }
  | { type: 'ack'; revision: number }
  | { type: 'ping' }
  | { type: 'leave' };

/** Short-lived room connection material; never log or persist the token. */
export interface RoomConnectionTicket {
  endpoint: string;
  token: string;
  handshakeToken?: string;
  expiresAt: number;
}
export const ROOM_ACCESS_TICKET_MS = 10_000;

/** Idempotent, session-scoped revocation. Newer authorized grants survive delayed delivery. */
export interface RoomRevocation {
  v: 1;
  aud: 'koro-room-revoke';
  room: string;
  sub: string;
  session: string;
  before: number;
  iat: number;
  exp: number;
}
