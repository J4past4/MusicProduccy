import type { BassPattern, SequencerStep } from '../audio/types';

function buildSteps(
  spec: Array<[number, number, number?, boolean?, boolean?]>
): SequencerStep[] {
  // Default inactive F1 (MIDI 41) steps
  const steps: SequencerStep[] = Array.from({ length: 16 }, () => ({
    active: false,
    note: 41,
    velocity: 0.85,
    slide: false,
    accent: false,
  }));

  for (const [idx, note, vel = 0.88, slide = false, accent = false] of spec) {
    if (idx >= 0 && idx < 16) {
      steps[idx] = { active: true, note, velocity: vel, slide, accent };
    }
  }
  return steps;
}

export const UK_BASS_PATTERNS: BassPattern[] = [
  {
    id: 'niche-4x4-bounce',
    name: 'Sheffield 4x4 Bounce',
    style: 'DJ Q / Niche 140',
    bpm: 140,
    swing: 0.08,
    drumGroove: '4x4',
    steps: buildSteps([
      [0, 41, 0.95, false, true], // F1
      [3, 41, 0.86, true, false],
      [6, 44, 0.92, false, true], // Ab1
      [8, 41, 0.88, false, false],
      [10, 46, 0.95, true, true], // Bb1 slide
      [11, 48, 0.85, false, false], // C2
      [14, 44, 0.9, false, false], // Ab1
    ]),
  },
  {
    id: 'ts7-organ-roller',
    name: 'TS7 Organ Anthem',
    style: '4x4 Organ Bass',
    bpm: 140,
    swing: 0.06,
    drumGroove: '4x4',
    steps: buildSteps([
      [0, 43, 0.95, false, true], // G1
      [2, 43, 0.78, false, false],
      [3, 46, 0.9, false, false], // Bb1
      [6, 50, 0.94, false, true], // D2
      [8, 43, 0.9, false, false],
      [11, 48, 0.92, false, true], // C2
      [13, 46, 0.82, false, false], // Bb1
      [14, 41, 0.92, false, true], // F1
    ]),
  },
  {
    id: 'thorpey-wobble-stomp',
    name: 'Thorpey Wobble Stomp',
    style: 'Heavy 140 Warp',
    bpm: 140,
    swing: 0.04,
    drumGroove: '4x4',
    steps: buildSteps([
      [0, 38, 0.96, true, true], // D1
      [1, 38, 0.88, false, false],
      [4, 41, 0.92, true, false], // F1
      [5, 45, 0.95, false, true], // A1
      [8, 38, 0.94, true, true], // D1
      [9, 38, 0.86, false, false],
      [12, 39, 0.94, true, true], // Eb1 dark tension!
      [14, 38, 0.9, false, false],
    ]),
  },
  {
    id: 'pantha-skippy-2step',
    name: 'Pantha Skippy 2-Step',
    style: 'Speed Garage / UKG',
    bpm: 138,
    swing: 0.16,
    drumGroove: '2step',
    steps: buildSteps([
      [0, 41, 0.96, false, true], // F1
      [3, 44, 0.86, false, false],
      [6, 48, 0.92, true, true], // C2
      [7, 46, 0.82, false, false],
      [10, 41, 0.94, false, true],
      [13, 43, 0.85, true, false],
      [14, 44, 0.9, false, false],
    ]),
  },
  {
    id: 'ussy-offbeat-donk',
    name: 'Ussy Offbeat Donk',
    style: '140 Donk / Filth',
    bpm: 142,
    swing: 0.05,
    drumGroove: '4x4',
    steps: buildSteps([
      [2, 41, 0.95, false, true],
      [6, 41, 0.9, false, false],
      [10, 44, 0.96, false, true],
      [13, 46, 0.85, false, false],
      [14, 48, 0.96, false, true],
    ]),
  },
  {
    id: 'reese-glide-stepper',
    name: 'Speed Garage Reese',
    style: 'Dark 140 Glide',
    bpm: 140,
    swing: 0.08,
    drumGroove: '4x4',
    steps: buildSteps([
      [0, 36, 0.94, true, true], // C1
      [1, 36, 0.85, true, false],
      [2, 36, 0.85, true, false],
      [3, 39, 0.92, true, false], // Eb1
      [4, 43, 0.95, true, true], // G1
      [5, 43, 0.85, false, false],
      [8, 36, 0.94, true, true],
      [9, 36, 0.85, true, false],
      [10, 41, 0.92, true, false], // F1
      [11, 39, 0.9, true, false],
      [12, 38, 0.92, true, true], // D1
      [13, 36, 0.85, false, false],
    ]),
  },
  {
    id: 'grime-halftime-140',
    name: '140 Half-Time Weight',
    style: 'Grime / Sub Weight',
    bpm: 140,
    swing: 0.02,
    drumGroove: 'halftime',
    steps: buildSteps([
      [0, 36, 0.98, true, true], // C1
      [1, 36, 0.85, false, false],
      [6, 39, 0.92, false, false], // Eb1
      [10, 41, 0.95, true, true], // F1
      [12, 38, 0.92, false, false], // D1
      [14, 36, 0.9, false, false],
    ]),
  },
  {
    id: 'acid-squelch-16s',
    name: 'Acid 303 16th Run',
    style: 'Acid Bassline 140',
    bpm: 140,
    swing: 0.06,
    drumGroove: '4x4',
    steps: buildSteps([
      [0, 41, 0.96, false, true],
      [2, 41, 0.76, false, false],
      [3, 53, 0.95, true, true], // +1 oct F2
      [4, 41, 0.82, false, false],
      [6, 44, 0.9, true, false],
      [7, 46, 0.84, false, false],
      [8, 41, 0.95, false, true],
      [10, 48, 0.92, true, true],
      [11, 46, 0.82, false, false],
      [12, 41, 0.85, false, false],
      [14, 44, 0.92, true, true],
      [15, 41, 0.8, false, false],
    ]),
  },
];
