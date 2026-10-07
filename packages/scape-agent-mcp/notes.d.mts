export interface ConversationNote {
  id: string;
  scope: string;
  visitor: string;
  room: string;
  text: string;
  at: number;
}
export interface ConversationNotesScope {
  list(visitor: string): string[];
  remember(visitor: string, text: string): Promise<void>;
  forget(visitor: string): Promise<void>;
}
export function openConversationNotes(options: {
  directory: string;
  readOnly?: boolean;
  now?: () => number;
}): Promise<{
  list(): ConversationNote[];
  forget(id: string): Promise<void>;
  scope(identity: { origin: string; room: string; agent: string }): ConversationNotesScope;
  close(): Promise<void>;
}>;
