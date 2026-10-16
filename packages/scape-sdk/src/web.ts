import {
  boundedJsonData,
  exactKeys,
  record,
  type ObjectDefinition,
  type ObjectView,
} from './api.js';

/** Host-rendered web content. External applications own their networking and multiplayer. */
export interface GizmoWebView {
  /** Accessible frame title. */
  title: string;
  /** Show the host's expand/retract button. Defaults to true; this does not grant browser Fullscreen API access. */
  fullscreen?: boolean;
  /** Absolute HTTPS embed URL. Mutually exclusive with html. */
  url?: string;
  /** HTML/CSS, at most 16,384 characters. Static unless interactive is explicitly true. */
  html?: string;
  /** HTML-only opt-in to inline JavaScript and the public bridge. External resources remain blocked. */
  interactive?: boolean;
  /** Opt in to the public room-context bridge for an external site or interactive HTML panel. */
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
  // QuickJS has no URL API. The accepting host repeats validation with its
  // platform parser, including IDNA/punycode rules beyond this portable syntax.
  const Parser = (globalThis as { URL?: new (url: string) => unknown }).URL;
  if (Parser) {
    try {
      new Parser(value);
    } catch {
      return false;
    }
  }
  const match = /^https:\/\/([a-z0-9.-]+)(?::([0-9]{1,5}))?(?:[/?#][^\s]*)?$/i.exec(value);
  if (
    !match ||
    match[1].length > 253 ||
    (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))
  )
    return false;
  const labels = match[1].split('.');
  if (!labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return false;
  // WHATWG URL parsing treats numeric-ending hosts as IPv4, even with a DNS
  // prefix. Accept only canonical dotted decimal IPv4, not aliases or bad IPs.
  const last = labels[labels.length - 1];
  if (/^(?:[0-9]+|0x[0-9a-f]*)$/i.test(last))
    return (
      labels.length === 4 &&
      labels.every(label => /^(?:0|[1-9][0-9]{0,2})$/.test(label) && Number(label) <= 255)
    );
  return true;
}

export function validGizmoWebView(value: unknown): value is GizmoWebView {
  if (
    !record(value) ||
    !exactKeys(value, [
      'title',
      'fullscreen',
      'url',
      'html',
      'interactive',
      'context',
      'data',
      'actions',
      'rooms',
    ]) ||
    typeof value.title !== 'string' ||
    !value.title.trim() ||
    value.title.length > 240
  )
    return false;
  if ((value.url === undefined) === (value.html === undefined)) return false;
  if (value.fullscreen !== undefined && typeof value.fullscreen !== 'boolean') return false;
  if (value.url !== undefined && (!validGizmoWebUrl(value.url) || value.interactive !== undefined))
    return false;
  if (value.interactive !== undefined && typeof value.interactive !== 'boolean') return false;
  if (
    value.html !== undefined &&
    (typeof value.html !== 'string' ||
      value.html.length > 16384 ||
      (!value.interactive &&
        (value.context !== undefined || value.data !== undefined || value.actions !== undefined)))
  )
    return false;
  if (value.context !== undefined && typeof value.context !== 'boolean') return false;
  if (
    value.data !== undefined &&
    (!value.context || !record(value.data) || !boundedJsonData(value.data, 8192))
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

/** A source declaration is fixed in the definition; live data comes only from the view. */
export function validGizmoWebDefinition(value: unknown): value is Omit<GizmoWebView, 'data'> {
  return validGizmoWebView(value) && !Object.hasOwn(value, 'data');
}

/** Resolve only the declared source, never a URL/HTML supplied by mutable view state. */
export function resolveGizmoWebView(
  definition: ObjectDefinition,
  view: ObjectView,
): GizmoWebView | undefined {
  if (!definition.web || !validGizmoWebDefinition(definition.web)) return undefined;
  const web = {
    ...definition.web,
    ...(definition.web.context && view.webData ? { data: view.webData } : {}),
  };
  return validGizmoWebView(web) ? web : undefined;
}
