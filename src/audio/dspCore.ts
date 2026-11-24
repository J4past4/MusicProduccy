/**
 * Pure TypeScript sample-accurate DSP core for SUBTRAKTOR-140.
 * Shared identically by the AudioWorklet processor, offline WAV renderer, and Vitest unit tests.
 */

import {
  LFO_SYNC_DIVISIONS,
  type DriveType,
  type Filter1Type,
  type Lfo1Waveform,
  type PhaseMode,
  type SubtractorPatch,
} from './types';
import { getWavetables, sampleWavetable } from './wavetables';

const TWO_PI = Math.PI * 2;
const MAX_VOICES = 16;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Exponential time mapping: 0..1 -> minSec..maxSec */
export function envTimeSec(norm: number, minSec = 0.0015, maxSec = 4.5): number {
  const n = clamp(norm, 0, 1);
  return minSec * Math.pow(maxSec / minSec, n);
}

/** Log frequency mapping: 0..1 -> 28 Hz .. 18000 Hz */
export function filterNormToHz(norm: number): number {
  const n = clamp(norm, 0, 1);
  return 28 * Math.pow(18000 / 28, n);
}

/** Fast soft saturation */
function fastTanh(x: number): number {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

/** Zero-Delay-Feedback State Variable Filter (Cytomic TPT SVF) */
class ZdfSvf {
  private ic1eq = 0;
  private ic2eq = 0;

  reset(): void {
    this.ic1eq = 0;
    this.ic2eq = 0;
  }

  process(
    input: number,
    cutoffHz: number,
    resonance01: number,
    sampleRate: number,
    mode: 'lp' | 'bp' | 'hp' | 'notch'
  ): number {
    const fc = clamp(cutoffHz, 20, sampleRate * 0.44);
    const g = Math.tan((Math.PI * fc) / sampleRate);
    // Damping k: 2 (no res) down to 0.08 (high resonant self-oscillation edge)
    const k = 2 - 1.92 * Math.pow(clamp(resonance01, 0, 1), 0.85);
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;

    const v3 = input - this.ic2eq;
    const v1 = a1 * this.ic1eq + a2 * v3;
    const v2 = this.ic2eq + a2 * this.ic1eq + a3 * v3;

    // Gentle internal saturation prevents runaway at extreme resonance
    this.ic1eq = fastTanh(2 * v1 - this.ic1eq);
    this.ic2eq = fastTanh(2 * v2 - this.ic2eq);

    switch (mode) {
      case 'lp':
        return v2;
      case 'bp':
        return v1;
      case 'hp':
        return input - k * v1 - v2;
      case 'notch':
        return input - k * v1;
    }
  }
}

type EnvStage = 'idle' | 'attack' | 'decay' | 'sustain' | 'release';

class AdsrEnvelope {
  stage: EnvStage = 'idle';
  value = 0;

  trigger(): void {
    this.stage = 'attack';
  }

  release(): void {
    if (this.stage !== 'idle') {
      this.stage = 'release';
    }
  }

  reset(): void {
    this.stage = 'idle';
    this.value = 0;
  }

  process(aNorm: number, dNorm: number, sNorm: number, rNorm: number, sr: number): number {
    if (this.stage === 'idle') return 0;

    if (this.stage === 'attack') {
      const aSec = envTimeSec(aNorm, 0.001, 3.5);
      const inc = 1 / (aSec * sr);
      this.value += inc;
      if (this.value >= 1) {
        this.value = 1;
        this.stage = 'decay';
      }
      return this.value;
    }

    if (this.stage === 'decay') {
      const dSec = envTimeSec(dNorm, 0.004, 4.5);
      const coeff = Math.exp(-4.6 / (dSec * sr));
      const target = clamp(sNorm, 0, 1);
      this.value = target + (this.value - target) * coeff;
      if (Math.abs(this.value - target) < 0.0005) {
        this.value = target;
        this.stage = 'sustain';
      }
      return this.value;
    }

    if (this.stage === 'sustain') {
      const target = clamp(sNorm, 0, 1);
      // Smoothly track sustain slider moves while held
      this.value += (target - this.value) * 0.005;
      return this.value;
    }

    // release
    const rSec = envTimeSec(rNorm, 0.004, 5.0);
    const coeff = Math.exp(-4.6 / (rSec * sr));
    this.value *= coeff;
    if (this.value < 0.0003) {
      this.value = 0;
      this.stage = 'idle';
    }
    return this.value;
  }
}

class Voice {
  active = false;
  gate = false;
  note = 60;
  velocity = 0.8;
  age = 0;

  currentMidi = 60;
  osc1Phase = 0;
  osc2Phase = 0;
  subPhase = 0;

  ampEnv = new AdsrEnvelope();
  filterEnv = new AdsrEnvelope();
  modEnv = new AdsrEnvelope();

  // Noise burst state
  noiseEnv = 0;
  noiseLpState = 0;
  noiseHpState = 0;
  noiseSeed = 2463534242;

  // LFO 2 per-voice state
  lfo2Phase = 0;
  lfo2DelayTime = 0;

  // Filters: Filter 1 (2 cascaded SVFs for LP24), Filter 2 (LP12)
  f1a = new ZdfSvf();
  f1b = new ZdfSvf();
  f2 = new ZdfSvf();

  reset(seedOffset: number): void {
    this.active = false;
    this.gate = false;
    this.ampEnv.reset();
    this.filterEnv.reset();
    this.modEnv.reset();
    this.f1a.reset();
    this.f1b.reset();
    this.f2.reset();
    this.osc1Phase = 0;
    this.osc2Phase = 0;
    this.subPhase = 0;
    this.lfo2Phase = 0;
    this.lfo2DelayTime = 0;
    this.noiseEnv = 0;
    this.noiseSeed = (2463534242 + seedOffset * 7919) >>> 0;
  }

  nextWhiteNoise(): number {
    let x = this.noiseSeed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.noiseSeed = x >>> 0;
    return (this.noiseSeed / 0xffffffff) * 2 - 1;
  }
}

function evalOscWithPhaseOffset(
  table: Float32Array,
  phase01: number,
  mode: PhaseMode,
  offset01: number
): number {
  const s1 = sampleWavetable(table, phase01);
  if (mode === 'off') return s1;
  const s2 = sampleWavetable(table, phase01 + offset01);
  if (mode === 'subtract') {
    return (s1 - s2) * 0.72;
  }
  // multiply
  return s1 * s2 * 1.45;
}

function applyDrive(x: number, type: DriveType, amount: number): number {
  const drive = 1 + amount * 14;
  switch (type) {
    case 'tube': {
      // Asymmetric warm tube saturation
      const pre = x * drive + 0.12 * amount;
      return fastTanh(pre) - fastTanh(0.12 * amount);
    }
    case 'tape': {
      const pre = x * (1 + amount * 8);
      return pre / (1 + Math.abs(pre) * 0.85);
    }
    case 'fold': {
      // UK Bassline wavefolder grit
      const pre = x * (1 + amount * 5.5);
      return Math.sin(pre * Math.PI * 0.5);
    }
    case 'fuzz': {
      const pre = x * (1 + amount * 22);
      return clamp(pre, -0.85, 0.85) * 1.1;
    }
  }
}

export class SubtraktorDspEngine {
  private sampleRate: number;
  private patch: SubtractorPatch;
  private wavetables: Float32Array[];
  private voices: Voice[];
  private voiceCounter = 0;

  // Performance controls
  private pitchBend = 0; // -1..1
  private modWheel = 0; // 0..1
  private bpm = 140;

  // Global LFO 1 state
  private lfo1Phase = 0;
  private lfo1RandCurr = 0;
  private lfo1RandNext = 0;
  private lfo1Seed = 987654321;

  // Mono legato held-note stack
  private heldNotes: Array<{ note: number; velocity: number }> = [];

  // UK Rack FX states
  private driveToneLp = 0;
  private chorusBufL: Float32Array;
  private chorusBufR: Float32Array;
  private chorusWriteIdx = 0;
  private chorusPhase = 0;
  private sidechainEnv = 0; // 1 on kick hit, decays to 0

  constructor(sampleRate: number, initialPatch: SubtractorPatch) {
    this.sampleRate = sampleRate;
    this.patch = { ...initialPatch };
    this.wavetables = getWavetables();
    this.voices = Array.from({ length: MAX_VOICES }, (_, i) => {
      const v = new Voice();
      v.reset(i + 1);
      return v;
    });

    const chorusLen = Math.ceil(sampleRate * 0.05); // 50ms delay buffer
    this.chorusBufL = new Float32Array(chorusLen);
    this.chorusBufR = new Float32Array(chorusLen);
  }

  setPatch(patch: SubtractorPatch): void {
    this.patch = { ...patch };
  }

  setParam<K extends keyof SubtractorPatch>(key: K, value: SubtractorPatch[K]): void {
    this.patch[key] = value;
  }

  setBpm(bpm: number): void {
    this.bpm = clamp(bpm, 60, 220);
  }

  setPitchBend(value: number): void {
    this.pitchBend = clamp(value, -1, 1);
  }

  setModWheel(value: number): void {
    this.modWheel = clamp(value, 0, 1);
  }

  triggerSidechain(): void {
    this.sidechainEnv = 1.0;
  }

  resetLfo1(): void {
    this.lfo1Phase = 0;
  }

  allNotesOff(): void {
    this.heldNotes = [];
    for (const v of this.voices) {
      v.gate = false;
      v.ampEnv.release();
      v.filterEnv.release();
      v.modEnv.release();
    }
  }

  panic(): void {
    this.heldNotes = [];
    for (let i = 0; i < this.voices.length; i++) {
      this.voices[i].reset(i + 1);
    }
  }

  noteOn(note: number, velocity = 0.85): void {
    const vel = clamp(velocity, 0.01, 1);
    const poly = clamp(Math.round(this.patch.polyphony), 1, MAX_VOICES);

    // Track held notes for mono legato
    this.heldNotes = this.heldNotes.filter((n) => n.note !== note);
    this.heldNotes.push({ note, velocity: vel });

    if (poly === 1) {
      const v = this.voices[0];
      const wasActiveAndHeld = v.active && v.gate;
      const isLegato = this.patch.playMode === 'legato' && wasActiveAndHeld;

      if (!v.active) {
        v.currentMidi = note;
        v.osc1Phase = 0;
        v.osc2Phase = 0;
        v.subPhase = 0;
        v.f1a.reset();
        v.f1b.reset();
        v.f2.reset();
      } else if (this.patch.portamento <= 0.005) {
        v.currentMidi = note;
      }

      v.active = true;
      v.gate = true;
      v.note = note;
      v.velocity = vel;
      v.age = ++this.voiceCounter;

      if (!isLegato) {
        v.ampEnv.trigger();
        v.filterEnv.trigger();
        v.modEnv.trigger();
        v.noiseEnv = 1.0;
        v.lfo2DelayTime = 0;
      }
      return;
    }

    // Polyphonic allocation: reuse same note, then find inactive, else steal oldest
    let chosen: Voice | null = null;
    for (let i = 0; i < poly; i++) {
      if (this.voices[i].active && this.voices[i].note === note) {
        chosen = this.voices[i];
        break;
      }
    }
    if (!chosen) {
      for (let i = 0; i < poly; i++) {
        if (!this.voices[i].active) {
          chosen = this.voices[i];
          break;
        }
      }
    }
    if (!chosen) {
      chosen = this.voices[0];
      for (let i = 1; i < poly; i++) {
        if (this.voices[i].age < chosen.age) chosen = this.voices[i];
      }
    }

    const hadPrior = chosen.active;
    chosen.active = true;
    chosen.gate = true;
    chosen.note = note;
    chosen.velocity = vel;
    chosen.age = ++this.voiceCounter;
    if (!hadPrior || this.patch.portamento <= 0.005) {
      chosen.currentMidi = note;
    }
    chosen.osc1Phase = 0;
    chosen.osc2Phase = 0;
    chosen.subPhase = 0;
    chosen.lfo2Phase = 0;
    chosen.lfo2DelayTime = 0;
    chosen.noiseEnv = 1.0;
    chosen.f1a.reset();
    chosen.f1b.reset();
    chosen.f2.reset();
    chosen.ampEnv.trigger();
    chosen.filterEnv.trigger();
    chosen.modEnv.trigger();
  }

  noteOff(note: number): void {
    const poly = clamp(Math.round(this.patch.polyphony), 1, MAX_VOICES);
    this.heldNotes = this.heldNotes.filter((n) => n.note !== note);

    if (poly === 1) {
      const v = this.voices[0];
      if (this.heldNotes.length > 0) {
        // Return to previous held note in mono mode
        const prev = this.heldNotes[this.heldNotes.length - 1];
        v.note = prev.note;
        v.velocity = prev.velocity;
        if (this.patch.portamento <= 0.005) {
          v.currentMidi = prev.note;
        }
        if (this.patch.playMode === 'retrig') {
          v.ampEnv.trigger();
          v.filterEnv.trigger();
          v.modEnv.trigger();
          v.noiseEnv = 1.0;
        }
      } else {
        v.gate = false;
        v.ampEnv.release();
        v.filterEnv.release();
        v.modEnv.release();
      }
      return;
    }

    for (let i = 0; i < poly; i++) {
      const v = this.voices[i];
      if (v.active && v.note === note && v.gate) {
        v.gate = false;
        v.ampEnv.release();
        v.filterEnv.release();
        v.modEnv.release();
      }
    }
  }

  private nextLfo1Rand(): number {
    let x = this.lfo1Seed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.lfo1Seed = x >>> 0;
    return (this.lfo1Seed / 0xffffffff) * 2 - 1;
  }

  private evalLfo1(wave: Lfo1Waveform, phase: number): number {
    switch (wave) {
      case 'triangle':
        return phase < 0.25 ? phase * 4 : phase < 0.75 ? 2 - phase * 4 : phase * 4 - 4;
      case 'rampUp':
        return phase * 2 - 1;
      case 'rampDown':
        return 1 - phase * 2;
      case 'square':
        return phase < 0.5 ? 1 : -1;
      case 'randomStepped':
        return this.lfo1RandCurr;
      case 'randomSmooth': {
        const t = phase * phase * (3 - 2 * phase);
        return this.lfo1RandCurr + (this.lfo1RandNext - this.lfo1RandCurr) * t;
      }
    }
  }

  getLfo1FrequencyHz(): number {
    if (this.patch.lfo1Sync) {
      const idx = clamp(
        Math.round(this.patch.lfo1Rate * (LFO_SYNC_DIVISIONS.length - 1)),
        0,
        LFO_SYNC_DIVISIONS.length - 1
      );
      const beats = LFO_SYNC_DIVISIONS[idx].beats;
      return this.bpm / (60 * beats);
    }
    // Free rate: 0.08 Hz to 32 Hz exponential
    return 0.08 * Math.pow(32 / 0.08, clamp(this.patch.lfo1Rate, 0, 1));
  }

  processBlock(outL: Float32Array, outR: Float32Array): void {
    const numSamples = outL.length;
    const sr = this.sampleRate;
    const p = this.patch;
    const poly = clamp(Math.round(p.polyphony), 1, MAX_VOICES);

    const osc1Table = this.wavetables[clamp(Math.round(p.osc1Wave) - 1, 0, 31)];
    const osc2Table = this.wavetables[clamp(Math.round(p.osc2Wave) - 1, 0, 31)];
    const sineTable = this.wavetables[3]; // index 3 = Waveform 4 (Sine)

    const lfo1Freq = this.getLfo1FrequencyHz();
    const lfo1Inc = lfo1Freq / sr;

    // Portamento smoothing coefficient
    const portaSec = p.portamento > 0.005 ? envTimeSec(p.portamento, 0.008, 0.65) : 0;
    const portaCoeff = portaSec > 0 ? Math.exp(-1 / (portaSec * sr)) : 0;

    // Oscillator static tunings in semitones relative to octave 4
    const osc1OffsetSemi = (p.osc1Octave - 4) * 12 + p.osc1Semi + p.osc1Cent / 100;
    const osc2OffsetSemi = (p.osc2Octave - 4) * 12 + p.osc2Semi + p.osc2Cent / 100;
    const bendSemi = this.pitchBend * p.pitchBendRange;

    // Noise decay coeff (at 1.0 it holds indefinitely)
    const noiseDecayCoeff =
      p.noiseDecay >= 0.99 ? 1.0 : Math.exp(-4.6 / (envTimeSec(p.noiseDecay, 0.005, 2.5) * sr));
    const noiseLpAlpha = 0.03 + p.noiseColor * 0.95;

    // LFO 1 effective amount (including Mod Wheel -> LFO1)
    const lfo1Amt = clamp(p.lfo1Amount + this.modWheel * p.modWheelLfo1, 0, 1.5);

    // Filter 1 mode mapping
    const f1Type: Filter1Type = p.filter1Type;

    // Sidechain decay (~160ms at 140 BPM)
    const scDecayCoeff = Math.exp(-4.5 / (0.17 * sr));

    // Chorus parameters
    const chorusLen = this.chorusBufL.length;
    const chorusRateHz = 0.25 + p.fxChorusRate * 3.5;
    const chorusPhaseInc = chorusRateHz / sr;

    // Drive tone LP coeff
    const driveToneAlpha = 0.08 + clamp(p.fxDriveTone, 0, 1) * 0.9;

    // Gain normalization for polyphony
    const voiceScale = poly > 1 ? 0.55 / Math.sqrt(Math.min(poly, 6)) : 0.72;

    for (let s = 0; s < numSamples; s++) {
      // Advance global LFO 1
      this.lfo1Phase += lfo1Inc;
      if (this.lfo1Phase >= 1) {
        this.lfo1Phase -= 1;
        this.lfo1RandCurr = this.lfo1RandNext;
        this.lfo1RandNext = this.nextLfo1Rand();
      }
      const lfo1Val = this.evalLfo1(p.lfo1Wave, this.lfo1Phase) * lfo1Amt;

      let synthSum = 0;
      let subSum = 0;

      for (let vi = 0; vi < poly; vi++) {
        const v = this.voices[vi];
        if (!v.active) continue;

        // Envelopes
        const ampE = v.ampEnv.process(p.ampEnvAttack, p.ampEnvDecay, p.ampEnvSustain, p.ampEnvRelease, sr);
        if (v.ampEnv.stage === 'idle') {
          v.active = false;
          continue;
        }

        const velOffset = v.velocity - 0.5; // -0.5..+0.5 bipolar velocity response

        const fDecayEff = clamp(p.filterEnvDecay + velOffset * p.velFilterDecay * 0.8, 0, 1);
        const filtE = v.filterEnv.process(
          p.filterEnvAttack,
          fDecayEff,
          p.filterEnvSustain,
          p.filterEnvRelease,
          sr
        );
        const modE = v.modEnv.process(
          p.modEnvAttack,
          p.modEnvDecay,
          p.modEnvSustain,
          p.modEnvRelease,
          sr
        );

        // Portamento pitch glide
        if (portaCoeff > 0) {
          v.currentMidi = v.note + (v.currentMidi - v.note) * portaCoeff;
        } else {
          v.currentMidi = v.note;
        }

        // LFO 2 per-voice (with delay and keyboard tracking)
        const lfo2DelaySec = p.lfo2Delay > 0.01 ? envTimeSec(p.lfo2Delay, 0.02, 2.5) : 0;
        let lfo2Gain = 1;
        if (lfo2DelaySec > 0) {
          v.lfo2DelayTime += 1 / sr;
          lfo2Gain = clamp(v.lfo2DelayTime / lfo2DelaySec, 0, 1);
        }
        const kbdRateScale = p.lfo2KbdTrack ? Math.pow(2, (v.currentMidi - 60) / 24) : 1;
        const lfo2Hz = 0.1 * Math.pow(25 / 0.1, clamp(p.lfo2Rate, 0, 1)) * kbdRateScale;
        v.lfo2Phase += lfo2Hz / sr;
        if (v.lfo2Phase >= 1) v.lfo2Phase -= 1;
        const lfo2Val = Math.sin(v.lfo2Phase * TWO_PI) * p.lfo2Amount * lfo2Gain;

        // Mod Envelope signed value (including Velocity -> Mod Env)
        const modEnvAmt = clamp(p.modEnvAmount + velOffset * p.velModEnv, 0, 1.5);
        const modEnvSigned = (p.modEnvInvert ? -modE : modE) * modEnvAmt;

        // Pitch modulation (semitones)
        let osc1PitchMod = bendSemi;
        let osc2PitchMod = bendSemi;

        if (p.lfo1Dest === 'osc12') {
          osc1PitchMod += lfo1Val * 12;
          osc2PitchMod += lfo1Val * 12;
        } else if (p.lfo1Dest === 'osc2') {
          osc2PitchMod += lfo1Val * 12;
        }

        if (p.lfo2Dest === 'osc12') {
          osc1PitchMod += lfo2Val * 2.5; // classic vibrato range
          osc2PitchMod += lfo2Val * 2.5;
        }

        if (p.modEnvDest === 'osc1') {
          osc1PitchMod += modEnvSigned * 24;
        } else if (p.modEnvDest === 'osc2') {
          osc2PitchMod += modEnvSigned * 24;
        }

        const osc1Midi = (p.osc1KbdTrack ? v.currentMidi : 60) + osc1OffsetSemi + osc1PitchMod;
        const osc2Midi = (p.osc2KbdTrack ? v.currentMidi : 60) + osc2OffsetSemi + osc2PitchMod;

        const osc1Freq = midiToFreq(osc1Midi);
        const osc2Freq = midiToFreq(osc2Midi);

        // Phase Offset Modulation (both Osc 1 & 2!)
        let phaseMod = this.modWheel * p.modWheelPhase * 0.5 + velOffset * p.velPhase * 0.5;
        if (p.lfo1Dest === 'phase') phaseMod += lfo1Val * 0.48;
        if (p.lfo2Dest === 'phase') phaseMod += lfo2Val * 0.48;
        if (p.modEnvDest === 'phase') phaseMod += modEnvSigned * 0.75;

        const osc1PhaseOff = clamp(p.osc1Phase * 0.95 + phaseMod, 0, 0.99);
        const osc2PhaseOff = clamp(p.osc2Phase * 0.95 + phaseMod, 0, 0.99);

        // Noise Generator (routed into Osc 2 bus!)
        let noiseSample = 0;
        if (p.noiseOn) {
          const white = v.nextWhiteNoise();
          v.noiseLpState += noiseLpAlpha * (white - v.noiseLpState);
          v.noiseHpState += 0.15 * (white - v.noiseHpState);
          const colored = p.noiseColor > 0.5
            ? white * (p.noiseColor - 0.5) * 2 + v.noiseLpState * (1 - (p.noiseColor - 0.5) * 2)
            : v.noiseLpState;
          noiseSample = colored * p.noiseLevel * v.noiseEnv;
          v.noiseEnv *= noiseDecayCoeff;
        }

        // Advance Osc 2 phase first (modulator for Osc 1 FM)
        v.osc2Phase += osc2Freq / sr;
        if (v.osc2Phase >= 1) v.osc2Phase -= 1;

        let osc2Raw = 0;
        if (p.osc2On) {
          osc2Raw = evalOscWithPhaseOffset(osc2Table, v.osc2Phase, p.osc2PhaseMode, osc2PhaseOff);
        }
        const osc2WithNoise = osc2Raw + noiseSample;

        // Effective FM amount (Osc 2 + Noise -> Osc 1)
        let fmAmt = p.fmAmount + this.modWheel * p.modWheelFm + velOffset * p.velFm;
        if (p.lfo1Dest === 'fm') fmAmt += lfo1Val * 0.75;
        if (p.modEnvDest === 'fm') fmAmt += modEnvSigned * 1.1;
        fmAmt = clamp(fmAmt, 0, 1.5);

        // Advance Osc 1 phase + audio-rate Phase Modulation (FM)
        v.osc1Phase += osc1Freq / sr;
        if (v.osc1Phase >= 1) v.osc1Phase -= 1;

        const fmActive = p.osc2On || p.noiseOn;
        const osc1ModdedPhase = fmActive ? v.osc1Phase + osc2WithNoise * fmAmt * 0.85 : v.osc1Phase;
        const osc1Sample = evalOscWithPhaseOffset(
          osc1Table,
          osc1ModdedPhase,
          p.osc1PhaseMode,
          osc1PhaseOff
        );

        // Ring Mod: Osc 1 * Osc 2 routed to Osc 2 output bus (authentic Subtractor!)
        const osc2Bus = p.ringMod && p.osc2On ? osc1Sample * osc2Raw * 1.35 + noiseSample : osc2WithNoise;

        // Osc Mix (0 = Osc 1, 1 = Osc 2)
        let mix = p.oscMix + velOffset * p.velOscMix;
        if (p.lfo1Dest === 'oscMix') mix += lfo1Val * 0.5;
        if (p.modEnvDest === 'oscMix') mix += modEnvSigned * 0.8;
        mix = clamp(mix, 0, 1);

        let sig: number;
        if (!p.osc2On && !p.noiseOn) {
          sig = osc1Sample;
        } else {
          sig = osc1Sample * (1 - mix) + osc2Bus * mix;
        }

        // Filter 1 Cutoff Calculation
        const fEnvAmt = clamp(p.filterEnvAmount + velOffset * p.velFilterEnv, 0, 1.5);
        const fEnvSigned = (p.filterEnvInvert ? -filtE : filtE) * fEnvAmt;
        const kbdTrackNorm = ((v.currentMidi - 60) / 60) * p.filter1Kbd;

        let f1Norm =
          p.filter1Freq +
          fEnvSigned * 0.78 +
          kbdTrackNorm * 0.45 +
          this.modWheel * p.modWheelFilterFreq * 0.5 +
          velOffset * p.velFilterFreq * 0.5;

        if (p.lfo1Dest === 'filterFreq') {
          f1Norm += lfo1Val * 0.45;
        }

        const f1Res = clamp(p.filter1Res + this.modWheel * p.modWheelFilterRes * 0.5, 0, 0.99);
        const f1Hz = filterNormToHz(clamp(f1Norm, 0, 1));

        // Process Filter 1
        if (f1Type === 'lp24') {
          const s1 = v.f1a.process(sig, f1Hz, f1Res * 0.72, sr, 'lp');
          sig = v.f1b.process(s1, f1Hz, f1Res * 0.92, sr, 'lp');
        } else if (f1Type === 'lp12') {
          sig = v.f1a.process(sig, f1Hz, f1Res, sr, 'lp');
        } else if (f1Type === 'bp12') {
          sig = v.f1a.process(sig, f1Hz, f1Res, sr, 'bp') * 1.35;
        } else if (f1Type === 'hp12') {
          sig = v.f1a.process(sig, f1Hz, f1Res, sr, 'hp');
        } else {
          sig = v.f1a.process(sig, f1Hz, f1Res, sr, 'notch');
        }

        // Process Filter 2 (LP12, Linkable to Filter 1!)
        if (p.filter2On) {
          let f2Norm = p.filter2Freq;
          if (p.filterLink) {
            // In Subtractor, Link makes Filter 1 Freq/Env/LFO offset Filter 2!
            f2Norm += f1Norm - 0.5;
          }
          if (p.modEnvDest === 'freq2') {
            f2Norm += modEnvSigned * 0.75;
          }
          if (p.lfo2Dest === 'filterFreq2') {
            f2Norm += lfo2Val * 0.45;
          }
          const f2Hz = filterNormToHz(clamp(f2Norm, 0, 1));
          sig = v.f2.process(sig, f2Hz, clamp(p.filter2Res, 0, 0.98), sr, 'lp');
        }

        // Amp + Velocity + LFO 2 Tremolo
        const velAmpGain = clamp(1 + (v.velocity - 1) * clamp(p.velAmp, 0, 1), 0.08, 1.25);
        const tremolo = p.lfo2Dest === 'amp' ? clamp(1 + lfo2Val * 0.6, 0.1, 1.5) : 1;
        const voiceGain = ampE * velAmpGain * tremolo * voiceScale;

        synthSum += sig * voiceGain;

        // Dedicated Mono UK Sub Layer (clean sine following pitch + amp envelope)
        if (p.fxSubOn && p.fxSubLevel > 0.001) {
          const subMidi = v.currentMidi + (p.fxSubOctave === -1 ? -12 : 0) + bendSemi;
          const subFreq = midiToFreq(subMidi);
          v.subPhase += subFreq / sr;
          if (v.subPhase >= 1) v.subPhase -= 1;
          subSum += sampleWavetable(sineTable, v.subPhase) * ampE * p.fxSubLevel * 0.48;
        }
      }

      // Scream-4 Inspired Drive on synth bus (keeps pure sub clean underneath!)
      let mainSig = synthSum;
      if (p.fxDriveOn && p.fxDriveAmount > 0.005) {
        const driven = applyDrive(mainSig, p.fxDriveType, p.fxDriveAmount);
        this.driveToneLp += driveToneAlpha * (driven - this.driveToneLp);
        mainSig = this.driveToneLp * 0.78;
      }

      // Stereo Unison Chorus on synth bus (sub stays dead-center mono!)
      let left = mainSig;
      let right = mainSig;

      this.chorusBufL[this.chorusWriteIdx] = mainSig;
      this.chorusBufR[this.chorusWriteIdx] = mainSig;

      if (p.fxChorusOn && p.fxChorusMix > 0.005) {
        this.chorusPhase += chorusPhaseInc;
        if (this.chorusPhase >= 1) this.chorusPhase -= 1;
        const lfoL = Math.sin(this.chorusPhase * TWO_PI);
        const lfoR = Math.sin((this.chorusPhase + 0.33) * TWO_PI);

        const delayL = (0.009 + lfoL * 0.0045) * sr;
        const delayR = (0.011 + lfoR * 0.0045) * sr;

        const readIdxL = (this.chorusWriteIdx - delayL + chorusLen) % chorusLen;
        const readIdxR = (this.chorusWriteIdx - delayR + chorusLen) % chorusLen;

        const i0L = readIdxL | 0;
        const fL = readIdxL - i0L;
        const wetL =
          this.chorusBufL[i0L] +
          (this.chorusBufL[(i0L + 1) % chorusLen] - this.chorusBufL[i0L]) * fL;

        const i0R = readIdxR | 0;
        const fR = readIdxR - i0R;
        const wetR =
          this.chorusBufR[i0R] +
          (this.chorusBufR[(i0R + 1) % chorusLen] - this.chorusBufR[i0R]) * fR;

        const cmix = clamp(p.fxChorusMix, 0, 1) * 0.65;
        left = mainSig * (1 - cmix * 0.35) + wetL * cmix;
        right = mainSig * (1 - cmix * 0.35) + wetR * cmix;
      }

      this.chorusWriteIdx = (this.chorusWriteIdx + 1) % chorusLen;

      // Re-inject pure mono sub layer
      left += subSum;
      right += subSum;

      // 4x4 UK Bassline Sidechain Ducking
      const scGain = 1 - this.sidechainEnv * clamp(p.fxSidechainAmount, 0, 0.92);
      this.sidechainEnv *= scDecayCoeff;

      // Master Level + Soft Punchy Limiter
      const masterGain = clamp(p.masterLevel, 0, 1.2) * scGain;
      outL[s] = fastTanh(left * masterGain * 1.15);
      outR[s] = fastTanh(right * masterGain * 1.15);
    }
  }
}
