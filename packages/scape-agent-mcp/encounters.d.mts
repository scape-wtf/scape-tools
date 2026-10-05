export interface EncounterRecord {
  firstSeen: number;
  lastSeen: number;
  lastNearby: number;
  nearbyMs: number;
  lastConversation: number;
  lastGreeting: number;
  quietUntil: number;
  spaceUntil: number;
}
export interface EncounterContext {
  metBefore: boolean;
  firstSeen?: number;
  lastSeen?: number;
  lastConversation?: number;
  lastGreeting?: number;
  secondsNearby?: number;
}
export interface EncounterScope {
  get(key: string): EncounterRecord | undefined;
  see(key: string, nearby: boolean): void;
  greet(key: string): void;
  spoke(key: string): void;
  boundary(key: string, value: { quietUntil?: number; spaceUntil?: number }): void;
  context(key: string): EncounterContext;
}
export interface EncounterMemory {
  scope(identity: { origin: string; room: string; agent: string }): EncounterScope;
  list(): Array<EncounterRecord & { id: string; origin: string; room: string; agent: string }>;
  forget(id: string): void;
  clear(): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}
/** Persistent encounter metadata only; retention is 30 days. Read-only inspection never creates a file. */
export function openEncounterMemory(options: {
  directory: string;
  readOnly?: boolean;
  now?: () => number;
  onError?: (message: string) => void;
}): Promise<EncounterMemory>;
