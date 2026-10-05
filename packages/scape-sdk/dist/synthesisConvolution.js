/** In-place radix-two FFT. Scratch is bounded by the validated sound/impulse lengths. */
export function fft(real, imag, inverse = false) {
    const n = real.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        for (; j & bit; bit >>= 1)
            j ^= bit;
        j ^= bit;
        if (i < j) {
            [real[i], real[j]] = [real[j], real[i]];
            [imag[i], imag[j]] = [imag[j], imag[i]];
        }
    }
    for (let width = 2; width <= n; width *= 2) {
        const angle = ((inverse ? 2 : -2) * Math.PI) / width, wr = Math.cos(angle), wi = Math.sin(angle);
        for (let start = 0; start < n; start += width) {
            let r = 1, im = 0;
            for (let j = 0; j < width / 2; j++) {
                const a = start + j, b = a + width / 2;
                const br = real[b] * r - imag[b] * im, bi = real[b] * im + imag[b] * r;
                real[b] = real[a] - br;
                imag[b] = imag[a] - bi;
                real[a] += br;
                imag[a] += bi;
                const next = r * wr - im * wi;
                im = r * wi + im * wr;
                r = next;
            }
        }
    }
    if (inverse)
        for (let i = 0; i < n; i++) {
            real[i] /= n;
            imag[i] /= n;
        }
}
/** Linear convolution, cropped to the caller's explicit output duration (never circular). */
export function convolveSignal(input, impulse) {
    let size = 1;
    while (size < input.length + impulse.length - 1)
        size *= 2;
    const real = new Float64Array(size), imag = new Float64Array(size);
    const ir = new Float64Array(size), ii = new Float64Array(size);
    real.set(input);
    ir.set(impulse);
    fft(real, imag);
    fft(ir, ii);
    for (let i = 0; i < size; i++) {
        const value = real[i] * ir[i] - imag[i] * ii[i];
        imag[i] = real[i] * ii[i] + imag[i] * ir[i];
        real[i] = value;
    }
    fft(real, imag, true);
    return Float32Array.from(real.subarray(0, input.length));
}
/** Procedural stereo impulse, using Web Audio's normalized-convolver RMS calibration.
 * https://webaudio.github.io/web-audio-api/#dom-convolvernode-normalize
 * Pure sample processing: no browser/native audio device is opened here.
 */
export function noiseImpulse(duration, decay, seed, rate) {
    const count = Math.ceil(duration * rate), channels = [new Float32Array(count), new Float32Array(count)];
    let energy = 0;
    for (const channel of channels)
        for (let i = 0; i < count; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            channel[i] = ((seed / 0xffffffff) * 2 - 1) * (1 - i / count) ** decay;
            energy += channel[i] ** 2;
        }
    const scale = (0.00125 * 44100) / rate / Math.max(0.000125, Math.sqrt(energy / (2 * count)));
    for (const channel of channels)
        for (let i = 0; i < count; i++)
            channel[i] *= scale;
    return channels;
}
