import { describe, expect, it } from 'vitest';
import { analyzeBeat, composeMelodicLaneForPattern, runCoProducerPrompt } from './beatAgent';
import { buildScaleChord, synthesizeMelodicEvent } from '../audio/melodicDspCore';
import { renderDawProjectToWav } from '../audio/dawWavExport';
import { createProjectFromKit, FACTORY_KITS } from '../data/factoryKits';
import type { MelodicSynthPreset } from '../types';

function rms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / Math.max(1, buf.length));
}

describe('PRODUCCY Melodic Synth DSP Core', () => {
  it('renders finite, audible audio across all 6 studio synth presets', () => {
    const presets: MelodicSynthPreset[] = ['reese', 'organ', 'pad', 'pluck', 'rhodes', 'acid'];
    const baseProject = createProjectFromKit(FACTORY_KITS[0]);
    const chord = buildScaleChord(53, 'minor', 0, true); // Fm7

    for (const preset of presets) {
      const cfg = { ...baseProject.melodic, preset };
      const buf = synthesizeMelodicEvent(chord, 0.35, 0.88, cfg, 22050);
      expect(buf.length).toBeGreaterThan(2000);
      for (let i = 0; i < buf.length; i++) {
        expect(Number.isFinite(buf[i])).toBe(true);
      }
      expect(rms(buf)).toBeGreaterThan(0.02);
    }
  });
});

describe('PRODUCCY AI Beat Co-Producer Engine', () => {
  it('composes UK Drill beat with explicit BPM, key, scale, and melodic pluck', () => {
    const base = createProjectFromKit(FACTORY_KITS[0]);
    const res = runCoProducerPrompt(
      base,
      'Make a dark 144 bpm UK drill beat in F minor with haunted pluck'
    );

    expect(res.nextProject.bpm).toBe(144);
    expect(res.nextProject.melodic.preset).toBe('pluck');
    expect(res.nextProject.melodic.scale).toBe('minor');
    expect(res.nextProject.melodic.rootMidi % 12).toBe(5); // F
    expect(res.actionsApplied.length).toBeGreaterThanOrEqual(2);

    const pat = res.nextProject.patterns[0];
    const melodicActive = (pat.melodicSteps ?? []).filter((m) => m.active).length;
    expect(melodicActive).toBeGreaterThan(0);
  });

  it('supports Jersey Club, Phonk, UKG, Amapiano, and Boom Bap prompts', () => {
    const base = createProjectFromKit(FACTORY_KITS[0]);
    const prompts = [
      'Create a 140 bpm jersey club bounce beat',
      'Make a 136 bpm phonk beat with distorted 808',
      'Create a 134 bpm UK garage 2-step beat with M1 organ chords',
      'Build a 114 bpm amapiano groove with log drum and warm pad',
      'Make a 90 bpm dusty lo-fi boom bap beat in D dorian with rhodes',
    ];

    for (const p of prompts) {
      const res = runCoProducerPrompt(base, p);
      expect(res.actionsApplied.length).toBeGreaterThan(0);
      const analysis = analyzeBeat(res.nextProject);
      expect(analysis.totalHits).toBeGreaterThan(8);
      expect(analysis.score).toBeGreaterThan(60);
    }
  });

  it('auto-mix fixes sub-bass reverb mud and links hi-hat choke groups', () => {
    const dirty = createProjectFromKit(FACTORY_KITS[0]);
    dirty.pads[0].reverbSend = 0.5;
    dirty.pads[4].chokeGroup = 0;

    const before = analyzeBeat(dirty);
    expect(before.diagnostics.some((d) => d.id === 'sub-reverb')).toBe(true);
    expect(before.diagnostics.some((d) => d.id === 'hat-choke')).toBe(true);

    const mixed = runCoProducerPrompt(dirty, 'Auto-mix and master all channels');
    expect(mixed.nextProject.pads[0].reverbSend).toBe(0);
    expect(mixed.nextProject.pads[4].chokeGroup).toBe(1);

    const after = analyzeBeat(mixed.nextProject);
    expect(after.diagnostics.some((d) => d.id === 'sub-reverb')).toBe(false);
    expect(after.diagnostics.some((d) => d.id === 'hat-choke')).toBe(false);
  });

  it('builds a complete 4-section Song Arrangement and renders all isolated WAV stems', () => {
    const base = createProjectFromKit(FACTORY_KITS[0]);
    base.patterns[0] = composeMelodicLaneForPattern(base.patterns[0], 53, 'minor', 'pluck');
    const arranged = runCoProducerPrompt(base, 'Build a full 4-section song arrangement');

    expect(arranged.nextProject.playMode).toBe('song');
    expect(arranged.nextProject.songClips.length).toBe(4);

    // Render all 4 stem targets cleanly
    const stems = ['master', 'drums-low', 'drums-top', 'synth'] as const;
    for (const stem of stems) {
      const wav = renderDawProjectToWav(arranged.nextProject, 'pattern', [], 22050, stem);
      expect(wav.byteLength).toBeGreaterThan(44 + 22050);
      const view = new DataView(wav);
      let peak = 0;
      for (let off = 44; off < Math.min(wav.byteLength, 44 + 60000); off += 2) {
        const s = Math.abs(view.getInt16(off, true));
        if (s > peak) peak = s;
      }
      expect(peak).toBeGreaterThan(400);
    }
  });
});
