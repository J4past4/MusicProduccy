/**
 * Studio-Grade Polyphonic Melodic Synth DSP Core for PRODUCCY Mobile DAW.
 * Pure Float32Array synthesis — runs identically in live Web Audio and offline WAV/Stem export.
 */

import { SCALE_INTERVALS, type MelodicTrackConfig, type MusicalScaleName } from '../types';

const TWO_PI = Math.PI * 2;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Returns MIDI note for a scale degree (can be negative or > scale length) */
export function scaleDegreeToMidi(
  rootMidi: number,
  scale: MusicalScaleName,
  degree: number
): number {
  const intervals = SCALE_INTERVALS[scale] ?? SCALE_INTERVALS.minor;
  const len = intervals.length;
  const octaveOffset = Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  return rootMidi + octaveOffset * 12 + intervals[idx];
}

/** Builds a rich triad or 7th chord voiced in the given scale */
export function buildScaleChord(
  rootMidi: number,
  scale: MusicalScaleName,
  degree: number,
  addSeventh = false
): number[] {
  const notes = [
    scaleDegreeToMidi(rootMidi, scale, degree),
    scaleDegreeToMidi(rootMidi, scale, degree + 2),
    scaleDegreeToMidi(rootMidi, scale, degree + 4),
  ];
  if (addSeventh) {
    notes.push(scaleDegreeToMidi(rootMidi, scale, degree + 6));
  }
  return notes;
}

/** PolyBLEP anti-aliased sawtooth helper */
function polyBlep(t: number, dt: number): number {
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

/** Simple Cytomic ZDF Lowpass filter for melodic warmth */
class MelodicSvfLp {
  private ic1 = 0;
  private ic2 = 0;

  process(input: number, cutoffHz: number, res: number, sr: number): number {
    const fc = clamp(cutoffHz, 35, sr * 0.44);
    const g = Math.tan((Math.PI * fc) / sr);
    const k = 2 - clamp(res, 0, 0.92) * 1.82;
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = input - this.ic2;
    const v1 = a1 * this.ic1 + a2 * v3;
    const v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return v2;
  }
}

/**
 * Synthesizes a single polyphonic melodic event (single note or chord) into a mono Float32Array.
 */
export function synthesizeMelodicEvent(
  notes: number[],
  gateDurationSec: number,
  velocity: number,
  config: MelodicTrackConfig,
  sampleRate = 44100
): Float32Array {
  if (!notes || notes.length === 0) return new Float32Array(256);

  const vel = clamp(velocity, 0.08, 1);
  const decayScale = 0.25 + clamp(config.decay, 0, 1) * 1.45;
  const releaseSec =
    config.preset === 'pad'
      ? 0.45 * decayScale
      : config.preset === 'rhodes'
      ? 0.35 * decayScale
      : config.preset === 'pluck'
      ? 0.28 * decayScale
      : 0.16 * decayScale;

  const totalSec = clamp(gateDurationSec + releaseSec, 0.08, 3.2);
  const totalSamples = Math.max(256, Math.floor(totalSec * sampleRate));
  const out = new Float32Array(totalSamples);
  const voiceNorm = 1 / Math.sqrt(notes.length);

  const baseCutHz = 120 * Math.pow(12000 / 120, clamp(config.cutoff, 0, 1));
  const filter = new MelodicSvfLp();
  const drive = clamp(config.drive, 0, 1);

  // Per-voice phase accumulators
  const p1 = new Float64Array(notes.length);
  const p2 = new Float64Array(notes.length);
  const freqs = notes.map((n) => midiToHz(n));

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const inGate = t < gateDurationSec;
    let sum = 0;

    for (let v = 0; v < notes.length; v++) {
      const f = freqs[v];

      if (config.preset === 'reese') {
        // Detuned dual sawtooth + warm sub sine
        const dt1 = (f * 0.992) / sampleRate;
        const dt2 = (f * 1.008) / sampleRate;
        p1[v] = (p1[v] + dt1) % 1;
        p2[v] = (p2[v] + dt2) % 1;
        const saw1 = 2 * p1[v] - 1 - polyBlep(p1[v], dt1);
        const saw2 = 2 * p2[v] - 1 - polyBlep(p2[v], dt2);
        const sub = Math.sin(TWO_PI * f * 0.5 * t) * 0.42;
        sum += (saw1 * 0.45 + saw2 * 0.45 + sub);
      } else if (config.preset === 'organ') {
        // Iconic UK M1 Percussive Organ additive drawbars
        const ph = TWO_PI * f * t;
        const perc = Math.exp(-t / 0.045);
        const sig =
          Math.sin(ph) * 0.65 +
          Math.sin(ph * 2) * 0.45 +
          Math.sin(ph * 3) * (0.28 + 0.35 * perc) +
          Math.sin(ph * 4) * 0.16 +
          Math.sin(ph * 6) * 0.12 * perc;
        sum += sig * 0.72;
      } else if (config.preset === 'pad') {
        // Lush detuned warm chord pad
        const dt1 = (f * 0.996) / sampleRate;
        const dt2 = (f * 1.004) / sampleRate;
        p1[v] = (p1[v] + dt1) % 1;
        p2[v] = (p2[v] + dt2) % 1;
        const s1 = 2 * p1[v] - 1 - polyBlep(p1[v], dt1);
        const s2 = 2 * p2[v] - 1 - polyBlep(p2[v], dt2);
        const tri = Math.sin(TWO_PI * f * t) * 0.35;
        sum += (s1 * 0.32 + s2 * 0.32 + tri);
      } else if (config.preset === 'pluck') {
        // Dark Metro/Southside FM Bell-Pluck
        const ph = TWO_PI * f * t;
        const modIdx = 2.4 * Math.exp(-t / 0.055);
        const body = Math.sin(ph + modIdx * Math.sin(ph * 2.0));
        const sub = Math.sin(ph * 0.5) * 0.2;
        sum += (body * 0.78 + sub);
      } else if (config.preset === 'rhodes') {
        // Warm electric piano with tine attack & gentle tremolo
        const ph = TWO_PI * f * t;
        const tine = Math.sin(ph * 3.0 + 1.4 * Math.sin(ph * 7.0)) * Math.exp(-t / 0.04) * 0.35;
        const body = Math.sin(ph) * 0.75 + Math.sin(ph * 2.0) * 0.18 * Math.exp(-t / 0.25);
        const trem = 0.88 + 0.12 * Math.sin(TWO_PI * 4.5 * t);
        sum += (body + tine) * trem;
      } else {
        // Acid 303 lead/bass
        const dt = f / sampleRate;
        p1[v] = (p1[v] + dt) % 1;
        const saw = 2 * p1[v] - 1 - polyBlep(p1[v], dt);
        const sq = p1[v] < 0.5 ? 0.45 : -0.45;
        sum += saw * 0.65 + sq * 0.35;
      }
    }

    // Amp Envelope per preset
    let ampEnv = 1;
    if (config.preset === 'pad') {
      const att = Math.min(1, t / 0.09);
      const rel = inGate ? 1 : Math.exp(-(t - gateDurationSec) / Math.max(0.05, releaseSec * 0.5));
      ampEnv = att * rel;
    } else if (config.preset === 'pluck') {
      const att = Math.min(1, t / 0.004);
      ampEnv = att * Math.exp(-t / (0.14 * decayScale));
    } else if (config.preset === 'rhodes') {
      const att = Math.min(1, t / 0.006);
      const dec = Math.exp(-t / (0.55 * decayScale));
      const rel = inGate ? 1 : Math.exp(-(t - gateDurationSec) / 0.12);
      ampEnv = att * dec * rel;
    } else {
      const att = Math.min(1, t / 0.006);
      const rel = inGate ? 1 : Math.exp(-(t - gateDurationSec) / Math.max(0.03, releaseSec * 0.45));
      ampEnv = att * rel;
    }

    // Filter Cutoff Envelope (snappy for pluck/acid/organ)
    const fEnv =
      config.preset === 'acid'
        ? Math.exp(-t / 0.11) * 4200
        : config.preset === 'pluck'
        ? Math.exp(-t / 0.075) * 3200
        : config.preset === 'organ'
        ? Math.exp(-t / 0.05) * 1800
        : 0;

    let sample = filter.process(
      sum * voiceNorm * ampEnv * vel * 0.85,
      baseCutHz + fEnv,
      config.preset === 'acid' ? Math.max(0.45, config.resonance) : config.resonance,
      sampleRate
    );

    if (drive > 0.01) {
      const g = 1 + drive * 4.5;
      sample = Math.tanh(sample * g) / (1 + drive * 0.45);
    }

    // Click-free tail micro-fade
    const rem = totalSamples - 1 - i;
    if (rem < 96) {
      sample *= rem / 96;
    }

    out[i] = Number.isFinite(sample) ? clamp(sample, -1.2, 1.2) : 0;
  }

  return out;
}
