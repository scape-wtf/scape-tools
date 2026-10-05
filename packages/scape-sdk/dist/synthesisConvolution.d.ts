/** In-place radix-two FFT. Scratch is bounded by the validated sound/impulse lengths. */
export declare function fft(real: Float64Array, imag: Float64Array, inverse?: boolean): void;
/** Linear convolution, cropped to the caller's explicit output duration (never circular). */
export declare function convolveSignal(input: Float32Array, impulse: Float32Array): Float32Array;
/** Procedural stereo impulse, using Web Audio's normalized-convolver RMS calibration.
 * https://webaudio.github.io/web-audio-api/#dom-convolvernode-normalize
 * Pure sample processing: no browser/native audio device is opened here.
 */
export declare function noiseImpulse(duration: number, decay: number, seed: number, rate: number): Float32Array[];
