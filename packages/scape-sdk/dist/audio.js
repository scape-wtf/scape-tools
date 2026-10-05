import { gizmoPartialsError, renderGizmoPartials } from './partials.js';
import { gizmoNoiseSoundError, renderGizmoNoise } from './noiseSound.js';
import { gizmoBusError } from './sequence.js';
import { gizmoSynthError, renderGizmoSynth, } from './synthesis.js';
import { record, exactKeys } from './api.js';
import { effectNumber, effectRecord } from './effectValidation.js';
/** Render a portable procedural or encoded sound into PCM samples for local tests. */
export function renderGizmoSound(sound) {
    return typeof sound === 'string'
        ? readGizmoSound(sound)
        : sound.kind === 'noise'
            ? renderGizmoNoise(sound)
            : sound.kind === 'partials'
                ? renderGizmoPartials(sound)
                : renderGizmoSynth(sound);
}
/** Maximum encoded WAV size accepted by the SDK. */
export const GIZMO_AUDIO_MAX_BYTES = 960044;
const identifier = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
/** Validate before allocating playback resources. Supports recorded or generated mono/stereo WAV. */
export function readGizmoSound(encoded) {
    if (typeof encoded !== 'string' ||
        encoded.length > Math.ceil(GIZMO_AUDIO_MAX_BYTES / 3) * 4 ||
        encoded.length % 4 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))
        throw new Error('Use a packaged PCM16 WAV file of at most 960044 bytes.');
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)), v = new DataView(bytes.buffer);
    const word = (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
    if (bytes.length < 44 ||
        word(0) !== 'RIFF' ||
        word(8) !== 'WAVE' ||
        v.getUint32(4, true) + 8 !== bytes.length)
        throw new Error('Expected a complete PCM16 WAV file.');
    let rate = 0, channels = 0, data;
    for (let offset = 12; offset < bytes.length;) {
        if (offset + 8 > bytes.length)
            throw new Error('WAV has an incomplete chunk header.');
        const size = v.getUint32(offset + 4, true), start = offset + 8;
        if (start + size + (size % 2) > bytes.length)
            throw new Error('WAV chunk extends past the end of the file.');
        if (word(offset) === 'fmt ') {
            if (rate ||
                size < 16 ||
                v.getUint16(start, true) !== 1 ||
                v.getUint16(start + 14, true) !== 16)
                throw new Error('Use uncompressed 16-bit PCM WAV audio.');
            channels = v.getUint16(start + 2, true);
            rate = v.getUint32(start + 4, true);
            if (![1, 2].includes(channels) ||
                rate < 8000 ||
                rate > 48000 ||
                v.getUint16(start + 12, true) !== channels * 2 ||
                v.getUint32(start + 8, true) !== rate * channels * 2)
                throw new Error('WAV must have 1–2 channels at 8000–48000 Hz.');
        }
        else if (word(offset) === 'data') {
            if (data)
                throw new Error('Use a WAV with one audio data chunk.');
            data = bytes.subarray(start, start + size);
        }
        offset = start + size + (size % 2);
    }
    if (!rate || !data || !data.length || data.length % (channels * 2))
        throw new Error('WAV audio data is missing or incomplete.');
    const frames = data.length / (channels * 2), duration = frames / rate;
    if (duration > 10)
        throw new Error('Sound duration must be at most 10 seconds.');
    const samples = Array.from({ length: channels }, () => new Float32Array(frames));
    const pcm = new DataView(data.buffer, data.byteOffset, data.byteLength);
    for (let frame = 0; frame < frames; frame++)
        for (let channel = 0; channel < channels; channel++)
            samples[channel][frame] = pcm.getInt16((frame * channels + channel) * 2, true) / 32768;
    return { samples, rate, duration };
}
export function gizmoSoundsError(value) {
    if (!record(value) || Object.keys(value).length > 16)
        return 'sounds must contain at most 16 named sounds.';
    let bytes = 0;
    for (const [name, asset] of Object.entries(value)) {
        if (!identifier(name))
            return 'sounds names must use 1–64 letters, digits, underscores or hyphens.';
        try {
            if (typeof asset === 'string') {
                const sound = readGizmoSound(asset);
                bytes += sound.samples.reduce((n, s) => n + s.byteLength, 0);
            }
            else {
                const error = record(asset) && asset.kind === 'noise'
                    ? gizmoNoiseSoundError(asset, `sounds.${name}`)
                    : record(asset) && asset.kind === 'partials'
                        ? gizmoPartialsError(asset, `sounds.${name}`)
                        : gizmoSynthError(asset, `sounds.${name}`);
                if (error)
                    return error;
            }
        }
        catch (error) {
            return `sounds.${name}: ${error.message}`;
        }
    }
    return bytes > 4 * 1024 * 1024 ? 'sounds exceeds the 4 MiB decoded audio budget.' : null;
}
const rangeError = (value, path, min, max) => {
    if (!Array.isArray(value) || value.length !== 2)
        return `${path} must contain a minimum and maximum.`;
    return (effectNumber(value[0], `${path}[0]`, min, max) ??
        effectNumber(value[1], `${path}[1]`, min, max) ??
        (value[1] <= value[0] ? `${path}[1] must be greater than ${path}[0].` : null));
};
export function gizmoAmbienceError(value, sounds) {
    if (record(value) && value.mode === 'sequence') {
        return (effectRecord(value, 'ambience', [
            'mode',
            'bus',
            'rangeCells',
            'maxSources',
            'stereo',
            'duckWhileSpeaking',
            'duckGain',
        ]) ??
            (value.duckGain !== undefined
                ? effectNumber(value.duckGain, 'ambience.duckGain', 0, 1)
                : null) ??
            gizmoBusError(value.bus) ??
            rangeError(value.rangeCells, 'ambience.rangeCells', 0, 12) ??
            effectNumber(value.maxSources, 'ambience.maxSources', 1, 4) ??
            (!Number.isInteger(value.maxSources) ? 'ambience.maxSources must be an integer.' : null) ??
            effectNumber(value.stereo, 'ambience.stereo', 0, 1) ??
            (typeof value.duckWhileSpeaking !== 'boolean'
                ? 'ambience.duckWhileSpeaking must be boolean.'
                : null));
    }
    const shape = effectRecord(value, 'ambience', [
        'sounds',
        'intervalSeconds',
        'chance',
        'rangeCells',
        'maxSources',
        'stereo',
        'loop',
        'duckWhileSpeaking',
        'duckGain',
        'normalizeSources',
        'loopPhase',
    ]);
    if (shape)
        return shape;
    const v = value;
    if (v.duckGain !== undefined) {
        const e = effectNumber(v.duckGain, 'ambience.duckGain', 0, 1);
        if (e)
            return e;
    }
    if (v.normalizeSources !== undefined && typeof v.normalizeSources !== 'boolean')
        return 'ambience.normalizeSources must be boolean.';
    if (v.loopPhase !== undefined &&
        (!Array.isArray(v.loopPhase) ||
            v.loopPhase.length !== 2 ||
            v.loopPhase.some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 16)))
        return 'ambience.loopPhase must contain two finite values between -16 and 16.';
    if (!Array.isArray(v.sounds) || !v.sounds.length || v.sounds.length > 16)
        return 'ambience.sounds must contain 1–16 sound choices.';
    for (let i = 0; i < v.sounds.length; i++) {
        const c = v.sounds[i], path = `ambience.sounds[${i}]`;
        const shape = effectRecord(c, path, ['sound', 'gain', 'rate', 'pan', 'weight']);
        if (shape)
            return shape;
        if (!identifier(c.sound) || (sounds && !Object.hasOwn(sounds, c.sound)))
            return `${path}.sound must name a declared sound.`;
        const error = effectNumber(c.gain, `${path}.gain`, 0, 1) ??
            effectNumber(c.rate, `${path}.rate`, 0.25, 4) ??
            effectNumber(c.pan, `${path}.pan`, -1, 1) ??
            effectNumber(c.weight, `${path}.weight`, 0.01, 100);
        if (error)
            return error;
    }
    return (rangeError(v.intervalSeconds, 'ambience.intervalSeconds', 0.1, 30) ??
        rangeError(v.rangeCells, 'ambience.rangeCells', 0, 12) ??
        effectNumber(v.chance, 'ambience.chance', 0, 1) ??
        effectNumber(v.maxSources, 'ambience.maxSources', 1, 4) ??
        (!Number.isInteger(v.maxSources) ? 'ambience.maxSources must be a whole number.' : null) ??
        effectNumber(v.stereo, 'ambience.stereo', 0, 1) ??
        (typeof v.loop !== 'boolean' || typeof v.duckWhileSpeaking !== 'boolean'
            ? 'ambience.loop and ambience.duckWhileSpeaking must be true or false.'
            : null));
}
export function validGizmoAmbience(value) {
    return gizmoAmbienceError(value) === null;
}
export function gizmoAudioError(value, sounds) {
    if (value === null)
        return null;
    if (!record(value) ||
        !exactKeys(value, ['key', 'at', 'commands']) ||
        typeof value.key !== 'string' ||
        !value.key.length ||
        value.key.length > 100 ||
        !Number.isSafeInteger(value.at) ||
        Number(value.at) < 0 ||
        !Array.isArray(value.commands) ||
        value.commands.length > 16)
        return 'audio must return null or a timeline with key, at and at most 16 commands.';
    for (let i = 0; i < value.commands.length; i++) {
        const c = value.commands[i], path = `audio.commands[${i}]`;
        if (!record(c) || !['play', 'stop'].includes(String(c.kind)) || !identifier(c.voice))
            return `${path} needs a play/stop kind and a voice name.`;
        if (!exactKeys(c, c.kind === 'stop'
            ? ['kind', 'voice', 'delayMs']
            : ['kind', 'voice', 'delayMs', 'sound', 'gain', 'rate', 'loop', 'rangeCells', 'stereo']))
            return `${path} has unsupported fields.`;
        let error = effectNumber(c.delayMs, `${path}.delayMs`, 0, 5000);
        if (error)
            return error;
        if (c.kind === 'stop')
            continue;
        if (!identifier(c.sound) || !Object.hasOwn(sounds, c.sound))
            return `${path}.sound must name a declared sound.`;
        if (typeof c.loop !== 'boolean')
            return `${path}.loop must be true or false.`;
        error =
            effectNumber(c.gain, `${path}.gain`, 0, 1) ??
                effectNumber(c.rate, `${path}.rate`, 0.25, 4) ??
                rangeError(c.rangeCells, `${path}.rangeCells`, 0, 16) ??
                effectNumber(c.stereo, `${path}.stereo`, 0, 1);
        if (error)
            return error;
    }
    return null;
}
/** File encoding only. Authors supply samples created by any recording or synthesis tool. */
export function encodeGizmoWav(channels, rate) {
    const frames = channels[0]?.length ?? 0;
    if (![1, 2].includes(channels.length) ||
        !Number.isInteger(rate) ||
        rate < 8000 ||
        rate > 48000 ||
        frames < 1 ||
        frames / rate > 10 ||
        channels.some(c => c.length !== frames))
        throw new Error('WAV needs 1–2 equally sized channels, 8000–48000 Hz and at most 10 seconds.');
    const bytes = new Uint8Array(44 + frames * channels.length * 2), v = new DataView(bytes.buffer);
    if (bytes.length > GIZMO_AUDIO_MAX_BYTES)
        throw new Error('WAV exceeds its byte limit.');
    const word = (offset, text) => [...text].forEach((c, i) => (bytes[offset + i] = c.charCodeAt(0)));
    word(0, 'RIFF');
    v.setUint32(4, bytes.length - 8, true);
    word(8, 'WAVE');
    word(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, channels.length, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * channels.length * 2, true);
    v.setUint16(32, channels.length * 2, true);
    v.setUint16(34, 16, true);
    word(36, 'data');
    v.setUint32(40, bytes.length - 44, true);
    for (let i = 0; i < frames; i++)
        for (let c = 0; c < channels.length; c++) {
            const sample = channels[c][i];
            if (!Number.isFinite(sample) || Math.abs(sample) > 1)
                throw new Error('WAV samples must be finite and within -1–1.');
            v.setInt16(44 + (i * channels.length + c) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
        }
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
}
