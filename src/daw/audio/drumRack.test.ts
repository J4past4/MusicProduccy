import { describe, expect, it } from 'vitest';
import {
  applyPadProcessing,
  extractWaveformPeaks,
  generateStereoReverbIR,
  synthesizeDrumHit,
} from './drumDspCore';
import { renderDawProjectToWav } from './dawWavExport';
import { createProjectFromKit, FACTORY_KITS } from '../data/factoryKits';
import {
  applyEuclideanToPad,
  doublePatternLength,
  generateEuclidean,
  shiftPadSteps,
} from '../data/patternTools';
import type { DrumSynthEngineType } from '../types';

function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    sum += buf[i] * buf[i];
  }
  return Math.sqrt(sum / Math.max(1, buf.length));
}

function allFinite(buf: Float32Array): boolean {
  for (let i = 0; i < buf.length; i++) {
    if (!Number.isFinite(buf[i])) return false;
  }
  return true;
}

describe('PRODUCCY Drum Rack DSP Core', () => {
  it('synthesizes clean, audible, finite audio for all 10 drum synthesis engines', () => {
    const engines: DrumSynthEngineType[] = [
      'kick',
      '808',
      'snare',
      'clap',
      'hat',
      'cymbal',
      'tom',
      'perc',
      'fm',
      'logdrum',
    ];
    const basePad = FACTORY_KITS[0].pads[0];

    for (const engine of engines) {
      const pad = { ...basePad, engine, decay: 0.5, tone: 0.55, punch: 0.65 };
      const buf = synthesizeDrumHit(pad, 44100, 0.9, 0);
      expect(buf.length).toBeGreaterThan(1000);
      expect(allFinite(buf)).toBe(true);
      expect(rms(buf)).toBeGreaterThan(0.015);
    }
  });

  it('keeps ZDF SVF filter, drive, bitcrusher, reverse, and trim finite at extreme settings', () => {
    const basePad = FACTORY_KITS[0].pads[2];
    const modes = ['lp', 'hp', 'bp'] as const;

    for (const filterMode of modes) {
      const extremePad = {
        ...basePad,
        filterMode,
        filterCutoff: 0.12,
        filterRes: 0.98,
        drive: 1.0,
        crush: 0.92,
        reverse: true,
        trimStart: 0.05,
        trimEnd: 0.85,
      };
      const buf = synthesizeDrumHit(extremePad, 44100, 1.0, 7);
      expect(allFinite(buf)).toBe(true);
      expect(buf.length).toBeGreaterThan(200);
    }

    // Custom sample buffer processing
    const syntheticSample = new Float32Array(4410);
    for (let i = 0; i < syntheticSample.length; i++) {
      syntheticSample[i] = Math.sin((2 * Math.PI * 220 * i) / 44100) * Math.exp(-i / 1500);
    }
    const processed = applyPadProcessing(
      syntheticSample,
      { ...basePad, engine: 'sample', filterMode: 'lp', filterCutoff: 0.5, drive: 0.6, crush: 0.4 },
      44100,
      true
    );
    expect(allFinite(processed)).toBe(true);
    expect(rms(processed)).toBeGreaterThan(0.01);
  });

  it('extracts normalized waveform peaks and generates finite stereo reverb IR', () => {
    const kick = synthesizeDrumHit(FACTORY_KITS[0].pads[0], 44100, 1.0, 0);
    const peaks = extractWaveformPeaks(kick, 64);
    expect(peaks.length).toBe(64);
    expect(Math.max(...peaks)).toBeGreaterThan(0.5);
    expect(Math.min(...peaks)).toBeGreaterThanOrEqual(0);

    const [irL, irR] = generateStereoReverbIR(44100, 1.5, 0.65);
    expect(irL.length).toBe(Math.floor(44100 * 1.5));
    expect(allFinite(irL)).toBe(true);
    expect(allFinite(irR)).toBe(true);
    expect(rms(irL)).toBeGreaterThan(0.005);
  });
});

describe('Factory Kits, Pattern Tools & Offline WAV Export', () => {
  it('all 6 factory kits have 16 pads and render valid non-silent stereo 16-bit WAV files', () => {
    expect(FACTORY_KITS.length).toBe(6);

    for (const kit of FACTORY_KITS) {
      expect(kit.pads.length).toBe(16);
      const project = createProjectFromKit(kit);
      const wav = renderDawProjectToWav(project, 'pattern', [], 22050);
      expect(wav.byteLength).toBeGreaterThan(44 + 22050);

      const view = new DataView(wav);
      const riff = String.fromCharCode(
        view.getUint8(0),
        view.getUint8(1),
        view.getUint8(2),
        view.getUint8(3)
      );
      expect(riff).toBe('RIFF');

      // Verify audio is audible (non-zero PCM frames)
      let maxSample = 0;
      for (let off = 44; off < Math.min(wav.byteLength, 44 + 80000); off += 2) {
        const s = Math.abs(view.getInt16(off, true));
        if (s > maxSample) maxSample = s;
      }
      expect(maxSample).toBeGreaterThan(1500);
    }
  });

  it('renders Song Mode arrangement spanning multiple pattern clips', () => {
    const project = createProjectFromKit(FACTORY_KITS[0]);
    const wavSong = renderDawProjectToWav(project, 'song', [], 22050);
    // 4 bars at 142 BPM = ~6.76s + 1.2s tail -> ~8s stereo 16-bit at 22050Hz (~700KB)
    expect(wavSong.byteLength).toBeGreaterThan(500000);
  });

  it('Euclidean generator, pattern doubler, and pad shifter work accurately', () => {
    const tresillo = generateEuclidean(8, 3, 0);
    expect(tresillo.filter(Boolean).length).toBe(3);

    const project = createProjectFromKit(FACTORY_KITS[1]);
    const pat = project.patterns[0]; // length 16
    const withEuclid = applyEuclideanToPad(pat, 7, 5, 1);
    const activeCount = withEuclid.steps[7].slice(0, 16).filter((c) => c.active).length;
    expect(activeCount).toBe(5);

    const doubled = doublePatternLength(withEuclid);
    expect(doubled.length).toBe(32);
    expect(doubled.steps[7][16].active).toBe(doubled.steps[7][0].active);

    const shifted = shiftPadSteps(withEuclid, 7, 1);
    expect(shifted.steps[7][1].active).toBe(withEuclid.steps[7][0].active);
  });
});
