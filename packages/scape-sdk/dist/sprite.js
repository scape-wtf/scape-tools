import { effectNumber, effectRecord } from './effectValidation.js';
import { jsonData, ObjectActionError } from './api.js';
const color = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
export function gizmoSpriteError(value) {
    let error = effectRecord(value, 'sprite', ['size', 'layers']);
    if (error)
        return error;
    const sprite = value;
    error = effectNumber(sprite.size, 'sprite.size', 64, 512);
    if (error)
        return error;
    if (!Number.isInteger(sprite.size) || !Array.isArray(sprite.layers) || !sprite.layers.length || sprite.layers.length > 4)
        return 'sprite requires an integer size and 1–4 layers.';
    const ids = new Set();
    for (const layer of sprite.layers) {
        error = effectRecord(layer, 'sprite.layer', ['id', 'shapes']);
        if (error)
            return error;
        if (!id(layer.id) || ids.has(layer.id))
            return 'sprite layer IDs must be unique.';
        ids.add(layer.id);
        if (!Array.isArray(layer.shapes) || !layer.shapes.length || layer.shapes.length > 16)
            return 'sprite layers support 1–16 shapes.';
        for (const shape of layer.shapes) {
            error = effectRecord(shape, 'sprite.shape', ['kind', 'x', 'y', 'width', 'height', 'radius', 'fill', 'text', 'size', 'weight', 'color'])
                ?? effectNumber(shape.x, 'sprite.shape.x', 0, sprite.size) ?? effectNumber(shape.y, 'sprite.shape.y', 0, sprite.size);
            if (error)
                return error;
            if (shape.kind === 'text') {
                error = effectRecord(shape, 'sprite.text', ['kind', 'x', 'y', 'text', 'size', 'weight', 'color'])
                    ?? effectNumber(shape.size, 'sprite.text.size', 4, 64);
                if (error)
                    return error;
                if (typeof shape.text !== 'string' || shape.text.length > 64 || /[\u0000-\u001f\u007f]/.test(shape.text) || ![400, 600].includes(shape.weight) || !color(shape.color))
                    return 'Invalid sprite text.';
            }
            else if (shape.kind === 'rect' || shape.kind === 'marker') {
                error = effectRecord(shape, 'sprite.shape', shape.kind === 'rect' ? ['kind', 'x', 'y', 'width', 'height', 'radius', 'fill'] : ['kind', 'x', 'y', 'width', 'height'])
                    ?? effectNumber(shape.width, 'sprite.shape.width', 1, sprite.size) ?? effectNumber(shape.height, 'sprite.shape.height', 1, sprite.size);
                if (error)
                    return error;
                if (shape.x + shape.width > sprite.size || shape.y + shape.height > sprite.size)
                    return 'Sprite rectangles must fit the canvas.';
                if (shape.kind === 'rect') {
                    error = effectNumber(shape.radius, 'sprite.rect.radius', 0, Math.min(shape.width, shape.height) / 2);
                    if (error)
                        return error;
                    if (typeof shape.fill === 'string') {
                        if (!color(shape.fill))
                            return 'Invalid sprite fill.';
                    }
                    else {
                        error = effectRecord(shape.fill, 'sprite.fill', ['from', 'to', 'y']);
                        if (error)
                            return error;
                        if (!color(shape.fill.from) || !color(shape.fill.to) || !Array.isArray(shape.fill.y) || shape.fill.y.length !== 2
                            || shape.fill.y.some(y => effectNumber(y, 'gradient.y', 0, sprite.size)) || shape.fill.y[1] <= shape.fill.y[0])
                            return 'Invalid sprite gradient.';
                    }
                }
            }
            else
                return 'Unsupported sprite shape.';
        }
    }
    return null;
}
export function gizmoSpriteAnimationError(value) {
    let error = effectRecord(value, 'sprite animation', ['layer', 'frames']);
    if (error)
        return error;
    const animation = value;
    if (!id(animation.layer) || !Array.isArray(animation.frames) || animation.frames.length < 2 || animation.frames.length > 16)
        return 'Sprite animation requires a layer and 2–16 frames.';
    let previous = -1;
    for (const frame of animation.frames) {
        error = effectRecord(frame, 'sprite frame', ['at', 'offset', 'tint', 'curve']) ?? effectNumber(frame.at, 'sprite frame.at', 0, 1);
        if (error)
            return error;
        if (frame.at <= previous)
            return 'Sprite frame times must increase.';
        previous = frame.at;
        if (!Array.isArray(frame.offset) || frame.offset.length !== 2 || frame.offset.some(n => effectNumber(n, 'sprite offset', -.5, .5))
            || !Array.isArray(frame.tint) || frame.tint.length !== 3 || frame.tint.some(n => effectNumber(n, 'sprite tint', 0, 1)))
            return 'Invalid sprite transform.';
        if (frame.curve !== undefined && !['linear', 'out-cubic', 'out-quadratic'].includes(frame.curve))
            return 'Invalid sprite curve.';
    }
    if (animation.frames[0].at !== 0 || animation.frames.at(-1).at !== 1)
        return 'Sprite animation must run from zero to one.';
    return null;
}
export function spriteAnimationFrame(animation, progress) {
    const right = animation.frames.findIndex(frame => frame.at > progress);
    if (right < 1)
        return right === 0 ? animation.frames[0] : animation.frames.at(-1);
    const a = animation.frames[right - 1], b = animation.frames[right], t = (progress - a.at) / (b.at - a.at);
    const mix = b.curve === 'out-cubic' ? 1 - (1 - t) ** 3 : b.curve === 'out-quadratic' ? 1 - (1 - t) ** 2 : t;
    return { at: progress, offset: a.offset.map((v, i) => v + (b.offset[i] - v) * mix),
        tint: a.tint.map((v, i) => v + (b.tint[i] - v) * mix) };
}
const cache = new WeakMap();
export function resolveGizmoSprite(definition, state) {
    if (!definition.sprite)
        return;
    const key = JSON.stringify(state), entries = cache.get(definition) ?? new Map();
    if (entries.has(key))
        return entries.get(key);
    try {
        const result = definition.sprite(structuredClone(state));
        if (!jsonData(result) || JSON.stringify(result).length > 16_384)
            throw new Error('Sprite exceeds 16 KiB of JSON');
        const error = gizmoSpriteError(result);
        if (error)
            throw new Error(error);
        if (entries.size >= 32)
            entries.delete(entries.keys().next().value);
        entries.set(key, structuredClone(result));
        cache.set(definition, entries);
        return entries.get(key);
    }
    catch (error) {
        throw new ObjectActionError(400, `${definition.type}: sprite: ${error instanceof Error ? error.message : 'Evaluation failed'}`);
    }
}
