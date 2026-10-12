import { exactKeys, jsonData, record } from './api.js';

/** Host-rendered web content. External applications own their networking and multiplayer. */
export interface GizmoWebView {
  /** Accessible frame title. */
  title: string;
  /** Absolute HTTPS embed URL. Mutually exclusive with html. */
  url?: string;
  /** Static HTML/CSS, at most 16,384 characters. Scripts and network resources are disabled. */
  html?: string;
  /** Opt in to the public room-context bridge for an external site. */
  context?: boolean;
  /** Explicit public data shared with the embedded site; never pass private state. */
  data?: Record<string, unknown>;
  /** Participant actions this site may request. Editor/remover actions are never exposed. */
  actions?: string[];
  /** Host-side placement restrictions, not a signed identity or external-service ban. */
  rooms?: { allow?: string[]; deny?: string[] };
}

/** Minimal public context. This browser message is not an authentication proof. */
export interface GizmoWebContext {
  roomId: string | null;
  objectId: string;
  objectType: string;
  floor: number;
}

/** Portable validation also runs in QuickJS, where the browser URL API is unavailable. */
export function validGizmoWebUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value))
    return false;
  const match = /^https:\/\/([a-z0-9.-]+)(?::([0-9]{1,5}))?(?:[/?#][^\s]*)?$/i.exec(value);
  if (
    !match ||
    match[1].length > 253 ||
    (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))
  )
    return false;
  return match[1].split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

export function validGizmoWebView(value: unknown): value is GizmoWebView {
  if (
    !record(value) ||
    !exactKeys(value, ['title', 'url', 'html', 'context', 'data', 'actions', 'rooms']) ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.length > 240
  )
    return false;
  if ((value.url === undefined) === (value.html === undefined)) return false;
  if (value.url !== undefined && !validGizmoWebUrl(value.url)) return false;
  if (
    value.html !== undefined &&
    (typeof value.html !== 'string' ||
      value.html.length > 16384 ||
      value.context !== undefined ||
      value.data !== undefined ||
      value.actions !== undefined)
  )
    return false;
  if (value.context !== undefined && typeof value.context !== 'boolean') return false;
  if (
    value.data !== undefined &&
    (!value.context ||
      !record(value.data) ||
      !jsonData(value.data) ||
      JSON.stringify(value.data).length > 8192)
  )
    return false;
  if (
    value.actions !== undefined &&
    (!value.context ||
      !Array.isArray(value.actions) ||
      value.actions.length > 16 ||
      !value.actions.every(
        name => typeof name === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(name),
      ) ||
      new Set(value.actions).size !== value.actions.length)
  )
    return false;
  if (value.rooms !== undefined) {
    if (!record(value.rooms) || !exactKeys(value.rooms, ['allow', 'deny'])) return false;
    for (const list of [value.rooms.allow, value.rooms.deny]) {
      if (
        list !== undefined &&
        (!Array.isArray(list) ||
          list.length > 128 ||
          !list.every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)))
      )
        return false;
    }
  }
  return true;
}

/** Deny wins; a restricted embed requires an actual connected room. */
export function gizmoWebRoomAllowed(view: GizmoWebView, roomId: string | null): boolean {
  if (!view.rooms) return true;
  if (!roomId) return false;
  return (
    !view.rooms.deny?.includes(roomId) && (!view.rooms.allow || view.rooms.allow.includes(roomId))
  );
}
