import { boundedJsonData, exactKeys, record, } from './api.js';
/** Portable validation also runs in QuickJS, where the browser URL API is unavailable. */
export function validGizmoWebUrl(value) {
    if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value))
        return false;
    // QuickJS has no URL API. The accepting host repeats validation with its
    // platform parser, including IDNA/punycode rules beyond this portable syntax.
    const Parser = globalThis.URL;
    if (Parser) {
        try {
            new Parser(value);
        }
        catch {
            return false;
        }
    }
    const match = /^https:\/\/([a-z0-9.-]+)(?::([0-9]{1,5}))?(?:[/?#][^\s]*)?$/i.exec(value);
    if (!match ||
        match[1].length > 253 ||
        (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535)))
        return false;
    const labels = match[1].split('.');
    if (!labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))
        return false;
    // WHATWG URL parsing treats numeric-ending hosts as IPv4, even with a DNS
    // prefix. Accept only canonical dotted decimal IPv4, not aliases or bad IPs.
    const last = labels[labels.length - 1];
    if (/^(?:[0-9]+|0x[0-9a-f]*)$/i.test(last))
        return (labels.length === 4 &&
            labels.every(label => /^(?:0|[1-9][0-9]{0,2})$/.test(label) && Number(label) <= 255));
    return true;
}
export function validGizmoWebView(value) {
    if (!record(value) ||
        !exactKeys(value, [
            'title',
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
        value.title.length > 240)
        return false;
    if ((value.url === undefined) === (value.html === undefined))
        return false;
    if (value.url !== undefined && (!validGizmoWebUrl(value.url) || value.interactive !== undefined))
        return false;
    if (value.interactive !== undefined && typeof value.interactive !== 'boolean')
        return false;
    if (value.html !== undefined &&
        (typeof value.html !== 'string' ||
            value.html.length > 16384 ||
            (!value.interactive &&
                (value.context !== undefined || value.data !== undefined || value.actions !== undefined))))
        return false;
    if (value.context !== undefined && typeof value.context !== 'boolean')
        return false;
    if (value.data !== undefined &&
        (!value.context || !record(value.data) || !boundedJsonData(value.data, 8192)))
        return false;
    if (value.actions !== undefined &&
        (!value.context ||
            !Array.isArray(value.actions) ||
            value.actions.length > 16 ||
            !value.actions.every(name => typeof name === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(name)) ||
            new Set(value.actions).size !== value.actions.length))
        return false;
    if (value.rooms !== undefined) {
        if (!record(value.rooms) || !exactKeys(value.rooms, ['allow', 'deny']))
            return false;
        for (const list of [value.rooms.allow, value.rooms.deny]) {
            if (list !== undefined &&
                (!Array.isArray(list) ||
                    list.length > 128 ||
                    !list.every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id))))
                return false;
        }
    }
    return true;
}
/** Deny wins; a restricted embed requires an actual connected room. */
export function gizmoWebRoomAllowed(view, roomId) {
    if (!view.rooms)
        return true;
    if (!roomId)
        return false;
    return (!view.rooms.deny?.includes(roomId) && (!view.rooms.allow || view.rooms.allow.includes(roomId)));
}
/** A source declaration is fixed in the definition; live data comes only from the view. */
export function validGizmoWebDefinition(value) {
    return validGizmoWebView(value) && !Object.hasOwn(value, 'data');
}
/** Resolve only the declared source, never a URL/HTML supplied by mutable view state. */
export function resolveGizmoWebView(definition, view) {
    if (!definition.web || !validGizmoWebDefinition(definition.web))
        return undefined;
    const web = {
        ...definition.web,
        ...(definition.web.context && view.webData ? { data: view.webData } : {}),
    };
    return validGizmoWebView(web) ? web : undefined;
}
