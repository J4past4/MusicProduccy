import { describe, expect, it } from 'vitest';
import { SubtraktorDspEngine, filterNormToHz } from './dspCore';
import { getWavetables, NUM_WAVEFORMS, TABLE_SIZE } from './wavetables';
import { FACTORY_PRESETS, INIT_PATCH, mutateBassPatch } from '../data/presets';
import { UK_BASS_PATTERNS } from '../data/patterns';
import { renderOneShotToWav, renderPatternToWav } from './wavExport';
import type { SubtractorPatch } from './types';

function renderTestAudio(patch: SubtractorPatch, midiNote = 41, numSamples = 4096, sr = 44100) {
  const engine = new SubtraktorDspEngine(sr, patch);
  engine.setBpm(140);
  engine.noteOn(midiNote, 0.9);
  const outL = new Float32Array(numSamples);
  const outR = new Float32Array(numSamples);
  const block = 128;
  for (let i = 0; i < numSamples; i += block) {
    const len = Math.min(block, numSamples - i);
    engine.processBlock(outL.subarray(i, i + len), outR.subarray(i, i + len));
  }
  return { outL, outR };
}

function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function assertFinite(buf: Float32Array) {
  for (let i = 0; i < buf.length; i++) {
    expect(Number.isFinite(buf[i])).toBe(true);
    expect(Math.abs(buf[i])).toBeLessThanOrEqual(1.05);
  }
}

describe('SUBTRAKTOR-140 Wavetables', () => {
  it('generates all 32 normalized zero-DC wavetables', () => {
    const tables = getWavetables();
    expect(tables.length).toBe(NUM_WAVEFORMS);
    for (const table of tables) {
      expect(table.length).toBe(TABLE_SIZE);
      let mean = 0;
      let peak = 0;
      for (let i = 0; i < table.length; i++) {
        mean += table[i];
        peak = Math.max(peak, Math.abs(table[i]));
      }
      mean /= table.length;
      expect(Math.abs(mean)).toBeLessThan(0.01);
      expect(peak).toBeCloseTo(1.0, 2);
    }
  });
});

describe('SUBTRAKTOR-140 Core DSP Features', () => {
  it('Phase Offset SUBTRACT cancels at offset=0 and produces rich harmonics at offset=0.4', () => {
    const zeroOffset: SubtractorPatch = {
      ...INIT_PATCH,
      osc1PhaseMode: 'subtract',
      osc1Phase: 0.0,
      filter1Freq: 1.0,
      filterEnvAmount: 0,
    };
    const activeOffset: SubtractorPatch = {
      ...zeroOffset,
      osc1Phase: 0.4,
    };

    const resZero = renderTestAudio(zeroOffset);
    const resActive = renderTestAudio(activeOffset);

    expect(rms(resZero.outL)).toBeLessThan(0.001);
    expect(rms(resActive.outL)).toBeGreaterThan(0.15);
  });

  it('Phase Offset MULTIPLY generates distinct harmonic content', () => {
    const offPatch: SubtractorPatch = { ...INIT_PATCH, osc1Wave: 4, osc1PhaseMode: 'off', filter1Freq: 1.0 };
    const mulPatch: SubtractorPatch = {
      ...offPatch,
      osc1PhaseMode: 'multiply',
      osc1Phase: 0.3,
    };
    const a = renderTestAudio(offPatch);
    const b = renderTestAudio(mulPatch);

    let diff = 0;
    for (let i = 0; i < a.outL.length; i++) diff += Math.abs(a.outL[i] - b.outL[i]);
    expect(diff / a.outL.length).toBeGreaterThan(0.05);
  });

  it('FM from Osc 2 modulates Osc 1 even when Osc Mix is 0 (Osc 1 only)', () => {
    const noFm: SubtractorPatch = {
      ...INIT_PATCH,
      osc1Wave: 4,
      osc2On: true,
      osc2Wave: 3,
      osc2Octave: 5,
      oscMix: 0,
      fmAmount: 0,
      filter1Freq: 1.0,
    };
    const withFm: SubtractorPatch = { ...noFm, fmAmount: 0.65 };

    const a = renderTestAudio(noFm);
    const b = renderTestAudio(withFm);
    let diff = 0;
    for (let i = 0; i < a.outL.length; i++) diff += Math.abs(a.outL[i] - b.outL[i]);
    expect(diff / a.outL.length).toBeGreaterThan(0.1);
  });

  it('Noise Generator can FM Osc 1 when Osc 2 is OFF (authentic Subtractor routing)', () => {
    const clean: SubtractorPatch = {
      ...INIT_PATCH,
      osc1Wave: 4,
      osc2On: false,
      noiseOn: false,
      oscMix: 0,
      fmAmount: 0.6,
      filter1Freq: 1.0,
    };
    const noiseFm: SubtractorPatch = {
      ...clean,
      noiseOn: true,
      noiseLevel: 0.9,
      noiseDecay: 0.8,
    };
    const a = renderTestAudio(clean);
    const b = renderTestAudio(noiseFm);
    let diff = 0;
    for (let i = 0; i < a.outL.length; i++) diff += Math.abs(a.outL[i] - b.outL[i]);
    expect(diff / a.outL.length).toBeGreaterThan(0.08);
  });

  it('All 5 Filter 1 modes + Linked Filter 2 remain finite and stable at high resonance', () => {
    const modes: SubtractorPatch['filter1Type'][] = ['lp24', 'lp12', 'bp12', 'hp12', 'notch'];
    for (const mode of modes) {
      const p: SubtractorPatch = {
        ...INIT_PATCH,
        filter1Type: mode,
        filter1Freq: 0.35,
        filter1Res: 0.95,
        filter2On: true,
        filterLink: true,
        filter2Freq: 0.5,
        filter2Res: 0.85,
      };
      const { outL, outR } = renderTestAudio(p);
      assertFinite(outL);
      assertFinite(outR);
      expect(rms(outL)).toBeGreaterThan(0.01);
    }
    expect(filterNormToHz(0)).toBeCloseTo(28, 1);
    expect(filterNormToHz(1)).toBeCloseTo(18000, 0);
  });

  it('LFO 1 Tempo Sync calculates exact 140 BPM frequencies', () => {
    const p: SubtractorPatch = {
      ...INIT_PATCH,
      lfo1Sync: true,
      lfo1Rate: 10 / 15, // 1/8 note (0.5 beats)
    };
    const engine = new SubtraktorDspEngine(44100, p);
    engine.setBpm(140);
    // At 140 BPM, 1/8 note = 140 / (60 * 0.5) = 4.6667 Hz
    expect(engine.getLfo1FrequencyHz()).toBeCloseTo(140 / 30, 3);
  });
});

describe('Factory UK Bassline Presets & WAV Export', () => {
  it('all 20 factory presets render clean, finite, audible audio', () => {
    expect(FACTORY_PRESETS.length).toBe(20);
    for (const preset of FACTORY_PRESETS) {
      const { outL, outR } = renderTestAudio(preset, 41, 4096);
      assertFinite(outL);
      assertFinite(outR);
      expect(rms(outL)).toBeGreaterThan(0.015);
    }
  });

  it('mutateBassPatch produces valid audible patches', () => {
    const mutated = mutateBassPatch(FACTORY_PRESETS[0]);
    const { outL } = renderTestAudio(mutated, 41, 4096);
    assertFinite(outL);
    expect(rms(outL)).toBeGreaterThan(0.015);
  });

  it('renders valid RIFF WAVE 16-bit stereo buffers for loops and one-shots', () => {
    const wavLoop = renderPatternToWav(FACTORY_PRESETS[0], UK_BASS_PATTERNS[0].steps, 140, 0.08, 1, 22050);
    const view = new DataView(wavLoop);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(2); // stereo
    expect(view.getUint16(34, true)).toBe(16); // 16-bit
    expect(wavLoop.byteLength).toBeGreaterThan(44 + 22050 * 4);

    const wavShot = renderOneShotToWav(FACTORY_PRESETS[1], 36, 0.5, 140, 22050);
    expect(wavShot.byteLength).toBeGreaterThan(44 + 10000 * 4);
  });
});
