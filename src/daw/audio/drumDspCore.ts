/**
 * Studio-grade Drum Synthesis & Processing DSP Core for PRODUCCY Drum Rack.
 * Pure Float32Array DSP — runs identically in live Web Audio buffer cache,
 * waveform preview canvas, Vitest verification, and offline 44.1kHz WAV export.
 */

import type { DrumPadConfig, FilterMode } from '../types';

const TWO_PI = Math.PI * 2;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Deterministic fast PRNG for repeatable transients & noise textures */
function createPrng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Maps 0..1 cutoff to 55Hz..18500Hz logarithmically */
export function padCutoffToHz(norm: number): number {
  return 55 * Math.pow(18500 / 55, clamp(norm, 0, 1));
}

/** Maps 0..1 decay to duration in seconds depending on engine character */
export function padDecayToSec(decay: number, engine: DrumPadConfig['engine']): number {
  const d = clamp(decay, 0, 1);
  switch (engine) {
    case '808':
      return 0.14 + Math.pow(d, 1.55) * 1.95;
    case 'cymbal':
      return 0.18 + Math.pow(d, 1.45) * 2.1;
    case 'hat':
      return 0.025 + Math.pow(d, 1.7) * 0.72;
    case 'kick':
      return 0.08 + Math.pow(d, 1.5) * 0.75;
    case 'logdrum':
      return 0.12 + Math.pow(d, 1.5) * 1.1;
    case 'snare':
    case 'clap':
      return 0.07 + Math.pow(d, 1.45) * 0.65;
    case 'tom':
    case 'fm':
      return 0.08 + Math.pow(d, 1.5) * 0.95;
    case 'perc':
      return 0.03 + Math.pow(d, 1.5) * 0.45;
    default:
      return 0.1 + Math.pow(d, 1.5) * 1.2;
  }
}

/** Semitone + fine cents ratio */
export function pitchRatio(semitones: number, fineCents = 0): number {
  return Math.pow(2, (semitones + fineCents / 100) / 12);
}

/** Cytomic / Andrew Simper Zero-Delay-Feedback State Variable Filter */
class SvfFilter {
  private ic1eq = 0;
  private ic2eq = 0;

  process(input: number, cutoffHz: number, res: number, mode: FilterMode, sampleRate: number): number {
    const fc = clamp(cutoffHz, 20, sampleRate * 0.45);
    const g = Math.tan((Math.PI * fc) / sampleRate);
    // Safe resonance mapping (k = 2 down to 0.18)
    const k = 2 - clamp(res, 0, 1) * 1.82;
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;

    const v3 = input - this.ic2eq;
    const v1 = a1 * this.ic1eq + a2 * v3;
    const v2 = this.ic2eq + a2 * this.ic1eq + a3 * v3;

    this.ic1eq = 2 * v1 - this.ic1eq;
    this.ic2eq = 2 * v2 - this.ic2eq;

    if (mode === 'lp') return v2;
    if (mode === 'bp') return v1;
    // hp = input - k*v1 - v2
    return input - k * v1 - v2;
  }
}

/** Warm asymmetric tube/tape soft clipper */
function warmSaturate(x: number, drive: number): number {
  if (drive <= 0.001) return x;
  const gain = 1 + drive * 7.5;
  const driven = x * gain;
  // Asymmetric tanh blend for even + odd warmth
  const clipped = Math.tanh(driven + 0.12 * drive * driven * driven);
  // Makeup compensation so loudness stays musical
  return clipped / (1 + drive * 0.55);
}

/**
 * Synthesizes a single mono drum hit (Float32Array) for the given pad configuration.
 * Velocity affects both amplitude and subtle timbral brightness/punch (like hardware drum synths).
 */
export function synthesizeDrumHit(
  pad: DrumPadConfig,
  sampleRate = 44100,
  velocity = 1.0,
  pitchOffsetSemitones = 0
): Float32Array {
  const vel = clamp(velocity, 0.05, 1.0);
  const ratio = pitchRatio(pad.pitch + pitchOffsetSemitones, pad.fine);
  const decaySec = padDecayToSec(pad.decay, pad.engine);
  const totalSec = clamp(decaySec + 0.04, 0.04, 2.5);
  const totalSamples = Math.max(256, Math.floor(totalSec * sampleRate));
  const out = new Float32Array(totalSamples);
  const rand = createPrng(1337 + pad.id * 97 + Math.round(pad.tone * 100));

  const tone = clamp(pad.tone, 0, 1);
  const punch = clamp(pad.punch, 0, 1);

  switch (pad.engine) {
    case 'kick': {
      // Studio 909/modern punch kick: 2-stage pitch sweep + click transient + sub body
      const baseFreq = clamp(46 * ratio, 24, 240);
      const startFreq = baseFreq * (2.6 + punch * 6.5);
      const midFreq = baseFreq * (1.28 + punch * 0.65);
      let phase = 0;
      const clickSvf = new SvfFilter();
      const clickCut = 1800 + tone * 4800;

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        // 2-stage exponential pitch envelope
        const fastDrop = Math.exp(-t / (0.005 + (1 - punch) * 0.007));
        const bodyDrop = Math.exp(-t / (0.032 + punch * 0.045));
        const freq = baseFreq + (midFreq - baseFreq) * bodyDrop + (startFreq - midFreq) * fastDrop;
        phase += (TWO_PI * freq) / sampleRate;

        // Body amplitude envelope with tight tail
        const ampEnv = Math.exp(-t / (decaySec * 0.34));
        const sub = Math.sin(phase) + tone * 0.24 * Math.sin(phase * 2) * Math.exp(-t / 0.045);

        // Beater click transient
        const clickEnv = Math.exp(-t / 0.0045);
        const clickNoise = clickSvf.process((rand() * 2 - 1) * clickEnv, clickCut, 0.25, 'bp', sampleRate);

        const sample = (sub * ampEnv * 0.92 + clickNoise * (0.18 + punch * 0.55) * vel) * (0.7 + 0.3 * vel);
        out[i] = Math.tanh(sample * (1.15 + tone * 0.55));
      }
      break;
    }

    case '808': {
      // Iconic TR-808 / Metro Boomin tuned sub bass
      const baseFreq = clamp(43.65 * ratio, 22, 320); // F1 base
      const punchFreq = baseFreq * (1.8 + punch * 3.8);
      let phase = 0;
      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        const pEnv = Math.exp(-t / (0.014 + punch * 0.022));
        const freq = baseFreq + (punchFreq - baseFreq) * pEnv;
        phase += (TWO_PI * freq) / sampleRate;

        const env = Math.exp(-t / (decaySec * 0.42));
        const fundamental = Math.sin(phase);
        // Subtle 2nd & 3rd harmonics so 808 cuts cleanly on phone speakers!
        const harmonics =
          tone * (0.28 * Math.sin(phase * 2) + 0.14 * Math.sin(phase * 3)) * Math.exp(-t / (decaySec * 0.28));
        const click = Math.sin(TWO_PI * 1400 * t) * Math.exp(-t / 0.0022) * punch * 0.28;
        const raw = (fundamental + harmonics) * env + click;
        out[i] = Math.tanh(raw * (1.1 + tone * 1.15)) * (0.75 + 0.25 * vel);
      }
      break;
    }

    case 'snare': {
      // Layered acoustic/electronic snare: dual tuned body modes + snappy snare wires + crack
      const f1 = clamp(185 * ratio, 75, 620);
      const f2 = f1 * (1.58 + tone * 0.24);
      let p1 = 0;
      let p2 = 0;
      const wireSvf = new SvfFilter();
      const bodySvf = new SvfFilter();
      const wireCut = 2600 + tone * 5200;

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        const pDrop = Math.exp(-t / 0.018);
        p1 += (TWO_PI * (f1 * (1 + punch * 1.2 * pDrop))) / sampleRate;
        p2 += (TWO_PI * (f2 * (1 + punch * 0.7 * pDrop))) / sampleRate;

        const bodyEnv = Math.exp(-t / (0.045 + decaySec * 0.16));
        const bodyRaw = (Math.sin(p1) * 0.72 + Math.sin(p2) * 0.38) * bodyEnv;
        const body = bodySvf.process(bodyRaw, 900 + tone * 900, 0.15, 'lp', sampleRate);

        const wireEnv = Math.exp(-t / (decaySec * 0.28));
        const noise = rand() * 2 - 1;
        const wires = wireSvf.process(noise, wireCut, 0.22 + tone * 0.2, 'hp', sampleRate) * wireEnv;

        const crack = (rand() * 2 - 1) * Math.exp(-t / 0.0035) * (0.35 + punch * 0.5);
        out[i] = Math.tanh((body * (0.75 + punch * 0.35) + wires * (0.55 + tone * 0.5) + crack) * 1.15) * vel;
      }
      break;
    }

    case 'clap': {
      // Authentic TR-808 / 909 multi-tap handclap with 4 micro-spaced bursts + airy tail
      const tapTimes = [0, 0.0105, 0.0215, 0.032];
      const bpSvf = new SvfFilter();
      const hpSvf = new SvfFilter();
      const bpFreq = clamp((1050 + tone * 1150) * Math.sqrt(ratio), 450, 4800);

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        let burstEnv = 0;
        for (let k = 0; k < tapTimes.length; k++) {
          const dt = t - tapTimes[k];
          if (dt >= 0) {
            const tapDecay = k === tapTimes.length - 1 ? decaySec * 0.32 : 0.009 + punch * 0.005;
            const amp = k === tapTimes.length - 1 ? 0.9 : 0.72 - k * 0.08;
            burstEnv += amp * Math.exp(-dt / tapDecay);
          }
        }
        const n = rand() * 2 - 1;
        const mid = bpSvf.process(n, bpFreq, 0.42 + punch * 0.25, 'bp', sampleRate);
        const air = hpSvf.process(n, 4200 + tone * 3000, 0.1, 'hp', sampleRate);
        out[i] = Math.tanh((mid * 1.45 + air * (0.22 + tone * 0.32)) * burstEnv * 0.95) * vel;
      }
      break;
    }

    case 'hat': {
      // Classic TR-808 6-oscillator metallic inharmonic cluster + crisp white noise air
      const baseFreqs = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
      const scale = ratio * (0.82 + tone * 0.55);
      const phases = new Float64Array(6);
      const hp1 = new SvfFilter();
      const bp1 = new SvfFilter();

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        let metal = 0;
        for (let o = 0; o < 6; o++) {
          phases[o] += (TWO_PI * baseFreqs[o] * scale) / sampleRate;
          // Band-limited-ish square harmonic blend
          const s = Math.sin(phases[o]);
          metal += s >= 0 ? 1 : -1;
        }
        metal /= 6;
        const noise = rand() * 2 - 1;
        const mix = metal * (0.48 + (1 - tone) * 0.25) + noise * (0.52 + tone * 0.25);

        const crisp = hp1.process(mix, 6400 + tone * 3600, 0.18 + punch * 0.25, 'hp', sampleRate);
        const body = bp1.process(metal, 8800, 0.35, 'bp', sampleRate);
        const env = Math.exp(-t / (decaySec * 0.3));
        const transient = Math.exp(-t / 0.0025) * punch * 0.35;
        out[i] = Math.tanh((crisp * 1.15 + body * 0.55) * (env + transient)) * 0.85 * vel;
      }
      break;
    }

    case 'cymbal': {
      // Lush metallic crash/ride with 6-oscillator shimmer + dual-band wash
      const baseFreqs = [263.0, 391.2, 517.8, 692.4, 839.1, 1142.0];
      const scale = ratio * (0.85 + tone * 0.45);
      const phases = new Float64Array(6);
      const hp = new SvfFilter();
      const bp = new SvfFilter();

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        let metal = 0;
        for (let o = 0; o < 6; o++) {
          phases[o] += (TWO_PI * baseFreqs[o] * scale) / sampleRate;
          metal += Math.sin(phases[o] + 0.4 * Math.sin(phases[(o + 1) % 6]));
        }
        metal /= 6;
        const noise = rand() * 2 - 1;
        const shimmer = 0.85 + 0.15 * Math.sin(TWO_PI * 14 * t);
        const raw = metal * 0.58 + noise * 0.42;
        const high = hp.process(raw, 4800 + tone * 3400, 0.2, 'hp', sampleRate);
        const ring = bp.process(metal, 3200 + tone * 2400, 0.55, 'bp', sampleRate);
        const env = Math.exp(-t / (decaySec * 0.38)) * shimmer;
        const strike = Math.exp(-t / 0.006) * punch * 0.4;
        out[i] = Math.tanh((high * 0.95 + ring * 0.65) * (env + strike)) * 0.82 * vel;
      }
      break;
    }

    case 'tom': {
      // Analog resonant tom/conga with pitch drop and mallet transient
      const baseFreq = clamp(105 * ratio, 42, 460);
      let phase = 0;
      let overPhase = 0;
      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        const pEnv = Math.exp(-t / (0.025 + punch * 0.04));
        const freq = baseFreq * (1 + (0.45 + punch * 1.45) * pEnv);
        phase += (TWO_PI * freq) / sampleRate;
        overPhase += (TWO_PI * freq * 1.59) / sampleRate; // circular membrane 2nd mode

        const env = Math.exp(-t / (decaySec * 0.32));
        const overEnv = Math.exp(-t / (decaySec * 0.14));
        const mallet = (rand() * 2 - 1) * Math.exp(-t / 0.003) * (0.15 + punch * 0.3);
        const sig = (Math.sin(phase) * env + Math.sin(overPhase) * overEnv * (0.18 + tone * 0.32) + mallet) * vel;
        out[i] = Math.tanh(sig * 1.1);
      }
      break;
    }

    case 'perc': {
      // Morphs smoothly via `tone` from woody rimshot/clave (0) to crisp rhythmic shaker (1)
      const rimFreq = clamp(760 * ratio, 220, 2600);
      let p1 = 0;
      let p2 = 0;
      const bp = new SvfFilter();
      const hp = new SvfFilter();

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        const pEnv = Math.exp(-t / 0.008);
        p1 += (TWO_PI * rimFreq * (1 + 0.55 * punch * pEnv)) / sampleRate;
        p2 += (TWO_PI * rimFreq * 2.41) / sampleRate;

        const woodEnv = Math.exp(-t / (0.018 + decaySec * 0.12));
        const wood = (Math.sin(p1) * 0.72 + Math.sin(p2) * 0.35) * woodEnv;

        // Shaker envelope with gentle swell
        const shakerAttack = 1 - Math.exp(-t / (0.008 + (1 - punch) * 0.015));
        const shakerEnv = shakerAttack * Math.exp(-t / (0.025 + decaySec * 0.25));
        const n = rand() * 2 - 1;
        const shaker = hp.process(bp.process(n, 6200, 0.3, 'bp', sampleRate), 4200, 0.1, 'hp', sampleRate) * shakerEnv;

        const sig = wood * (1 - tone * 0.85) + shaker * (0.2 + tone * 1.15);
        out[i] = Math.tanh(sig * 1.25) * vel;
      }
      break;
    }

    case 'fm': {
      // 2-Operator FM Percussion (808 cowbell, metallic bell, laser zap, industrial hit)
      const carrierBase = clamp(540 * ratio, 90, 2200);
      const modRatio = 1.414 + tone * 2.2;
      let cPhase = 0;
      let mPhase = 0;

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        const pitchDrop = Math.exp(-t / (0.015 + (1 - punch) * 0.04));
        const cFreq = carrierBase * (1 + punch * 0.85 * pitchDrop);
        const mFreq = cFreq * modRatio;

        mPhase += (TWO_PI * mFreq) / sampleRate;
        const modIndex = (1.5 + tone * 6.5) * Math.exp(-t / (0.03 + decaySec * 0.22));
        cPhase += (TWO_PI * cFreq) / sampleRate;

        const env = Math.exp(-t / (decaySec * 0.32));
        const sig = Math.sin(cPhase + modIndex * Math.sin(mPhase)) * env;
        out[i] = Math.tanh(sig * 1.15) * 0.88 * vel;
      }
      break;
    }

    case 'logdrum': {
      // Authentic Amapiano / Afrobeats Log Drum: woody FM knock + deep resonant sub marimba body
      const baseFreq = clamp(65.41 * ratio, 32, 340); // C2 base
      let cPhase = 0;
      let mPhase = 0;
      let subPhase = 0;

      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        // Fast percussive pitch envelope
        const pDrop = Math.exp(-t / (0.012 + punch * 0.018));
        const freq = baseFreq * (1 + (0.65 + punch * 1.35) * pDrop);

        subPhase += (TWO_PI * freq) / sampleRate;
        cPhase += (TWO_PI * freq * 2.0) / sampleRate;
        mPhase += (TWO_PI * freq * 3.0) / sampleRate;

        const knockIndex = (2.2 + tone * 4.5) * Math.exp(-t / 0.016);
        const knock = Math.sin(cPhase + knockIndex * Math.sin(mPhase)) * Math.exp(-t / 0.055);
        const subBody = Math.sin(subPhase) * Math.exp(-t / (decaySec * 0.36));

        const sig = subBody * 0.82 + knock * (0.45 + tone * 0.45);
        out[i] = Math.tanh(sig * (1.25 + punch * 0.45)) * (0.78 + 0.22 * vel);
      }
      break;
    }

    case 'sample':
    default: {
      // Fallback click if 'sample' selected before loading a file
      const freq = clamp(220 * ratio, 60, 1200);
      for (let i = 0; i < totalSamples; i++) {
        const t = i / sampleRate;
        out[i] = Math.sin(TWO_PI * freq * t) * Math.exp(-t / 0.06) * 0.6 * vel;
      }
      break;
    }
  }

  return applyPadProcessing(out, pad, sampleRate);
}

/**
 * Processes a mono source buffer (either synthesized or custom user sample)
 * through trim, reverse, attack/decay shaping, ZDF SVF filter, drive, and bitcrusher.
 */
export function applyPadProcessing(
  source: Float32Array,
  pad: DrumPadConfig,
  sampleRate: number,
  isCustomSample = false
): Float32Array {
  const srcLen = source.length;
  if (srcLen === 0) return new Float32Array(256);

  const startIdx = clamp(Math.floor(pad.trimStart * srcLen), 0, Math.max(0, srcLen - 64));
  const endIdx = clamp(Math.floor(pad.trimEnd * srcLen), startIdx + 64, srcLen);
  const len = endIdx - startIdx;
  const out = new Float32Array(len);

  // Copy with optional reverse
  for (let i = 0; i < len; i++) {
    out[i] = pad.reverse ? source[endIdx - 1 - i] : source[startIdx + i];
  }

  const svf = new SvfFilter();
  const cutoffHz = padCutoffToHz(pad.filterCutoff);
  const needsFilter =
    pad.filterMode !== 'lp' || pad.filterCutoff < 0.97 || pad.filterRes > 0.05;
  const attackSamples = Math.max(1, Math.floor(pad.attack * 0.08 * sampleRate));
  const sampleDecaySec = isCustomSample ? 0.05 + Math.pow(pad.decay, 1.5) * 3.0 : 0;

  // Bitcrush / sample-rate decimation params
  const crush = clamp(pad.crush, 0, 1);
  const holdStep = crush > 0.01 ? Math.max(1, Math.floor(1 + Math.pow(crush, 1.8) * 28)) : 1;
  const bitLevels = crush > 0.01 ? Math.pow(2, 12 - crush * 9.2) : 0;
  let heldSample = 0;

  const fadeOutSamples = Math.min(Math.floor(sampleRate * 0.0025), Math.floor(len * 0.25));

  for (let i = 0; i < len; i++) {
    let s = out[i];

    // Attack envelope
    if (i < attackSamples) {
      s *= i / attackSamples;
    }

    // Custom sample decay envelope
    if (isCustomSample && pad.decay < 0.98) {
      const t = i / sampleRate;
      s *= Math.exp(-t / (sampleDecaySec * 0.45));
    }

    // Resonant ZDF SVF Filter
    if (needsFilter) {
      s = svf.process(s, cutoffHz, pad.filterRes, pad.filterMode, sampleRate);
    }

    // Analog Saturation / Drive
    if (pad.drive > 0.01) {
      s = warmSaturate(s, pad.drive);
    }

    // Lo-Fi Bitcrusher / Sample-Rate Decimator
    if (crush > 0.01) {
      if (i % holdStep === 0) {
        heldSample = Math.round(s * bitLevels) / bitLevels;
      }
      s = heldSample;
    }

    // Click-free tail micro-fade
    const rem = len - 1 - i;
    if (rem < fadeOutSamples && fadeOutSamples > 0) {
      s *= rem / fadeOutSamples;
    }

    out[i] = Number.isFinite(s) ? clamp(s, -1.5, 1.5) : 0;
  }

  return out;
}

/** Extracts normalized 0..1 peak bars for crisp canvas waveform rendering */
export function extractWaveformPeaks(samples: Float32Array, numBars = 96): number[] {
  const peaks: number[] = new Array(numBars).fill(0);
  if (samples.length === 0) return peaks;
  const blockSize = Math.max(1, Math.floor(samples.length / numBars));
  let globalMax = 0.0001;

  for (let b = 0; b < numBars; b++) {
    const start = b * blockSize;
    const end = Math.min(samples.length, start + blockSize);
    let maxVal = 0;
    for (let i = start; i < end; i++) {
      const a = Math.abs(samples[i]);
      if (a > maxVal) maxVal = a;
    }
    peaks[b] = maxVal;
    if (maxVal > globalMax) globalMax = maxVal;
  }

  const norm = Math.max(0.25, globalMax);
  for (let b = 0; b < numBars; b++) {
    peaks[b] = clamp(peaks[b] / norm, 0, 1);
  }
  return peaks;
}

/** Generates a lush, smooth stereo algorithmic reverb impulse response */
export function generateStereoReverbIR(
  sampleRate: number,
  decaySec: number,
  tone: number
): [Float32Array, Float32Array] {
  const dur = clamp(decaySec, 0.25, 4.2);
  const length = Math.floor(sampleRate * dur);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const randL = createPrng(9001);
  const randR = createPrng(9002);

  // One-pole lowpass damping for warm tail
  const damp = 0.08 + clamp(tone, 0, 1) * 0.72;
  let lpL = 0;
  let lpR = 0;
  const preDelaySamples = Math.floor(sampleRate * 0.012);

  for (let i = 0; i < length; i++) {
    if (i < preDelaySamples) continue;
    const t = (i - preDelaySamples) / (length - preDelaySamples);
    const env = Math.pow(1 - t, 2.4) * Math.exp(-t * 2.2);
    const nL = (randL() * 2 - 1) * env;
    const nR = (randR() * 2 - 1) * env;
    lpL += damp * (nL - lpL);
    lpR += damp * (nR - lpR);
    left[i] = lpL * 0.65;
    right[i] = lpR * 0.65;
  }

  return [left, right];
}
