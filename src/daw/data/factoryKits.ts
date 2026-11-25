/**
 * 6 Curated Studio Factory Kits for PRODUCCY Drum Rack.
 * Pad layout follows classic MPC / Ableton Drum Rack ergonomics:
 *   Row 1 (bottom, 0-3): Kick, 808/Sub, Snare, Clap
 *   Row 2 (4-7):         Closed Hat, Open Hat, Rim/Snap, Perc/Shaker
 *   Row 3 (8-11):        Low Tom, Mid Tom, Hi Tom, Aux Perc
 *   Row 4 (top, 12-15):  Crash, Ride, FM Bell/Cowbell, Log Drum / FX
 */

import {
  createEmptyPattern,
  DEFAULT_MASTER_BUS,
  DEFAULT_MELODIC_TRACK,
  type DawProject,
  type DrumPadConfig,
  type DrumPattern,
  type FactoryKitPreset,
  type StepCell,
} from '../types';
import { clonePattern } from './patternTools';

type PadInit = Partial<DrumPadConfig> & {
  id: number;
  name: string;
  shortName: string;
  color: DrumPadConfig['color'];
  engine: DrumPadConfig['engine'];
};

function makePad(init: PadInit): DrumPadConfig {
  return {
    pitch: 0,
    fine: 0,
    tone: 0.5,
    decay: 0.45,
    punch: 0.55,
    attack: 0,
    filterMode: 'lp',
    filterCutoff: 0.96,
    filterRes: 0.08,
    drive: 0.08,
    crush: 0,
    volume: 0.88,
    pan: 0,
    reverbSend: 0.08,
    delaySend: 0,
    mute: false,
    solo: false,
    chokeGroup: 0,
    reverse: false,
    trimStart: 0,
    trimEnd: 1,
    ...init,
  };
}

interface StepHit {
  step: number;
  vel?: number;
  pitch?: number;
  ratchet?: 1 | 2 | 3 | 4;
  prob?: number;
  pan?: number;
  nudge?: number;
}

function buildPattern(
  id: string,
  name: string,
  length: 16 | 32 | 64,
  hits: Record<number, (number | StepHit)[]>
): DrumPattern {
  const pat = createEmptyPattern(id, name, length);
  for (const [padStr, list] of Object.entries(hits)) {
    const padId = Number(padStr);
    if (padId < 0 || padId > 15) continue;
    for (const item of list) {
      const h: StepHit = typeof item === 'number' ? { step: item } : item;
      if (h.step < 0 || h.step >= length) continue;
      const cell: StepCell = {
        active: true,
        velocity: h.vel ?? 0.86,
        pitch: h.pitch ?? 0,
        ratchet: h.ratchet ?? 1,
        probability: h.prob ?? 1,
        pan: h.pan ?? 0,
        nudge: h.nudge ?? 0,
      };
      pat.steps[padId][h.step] = cell;
    }
  }
  return pat;
}

// ---------------------------------------------------------------------------
// 1. 808 TRAP STUDIO (142 BPM)
// ---------------------------------------------------------------------------
const METRO_808_PADS: DrumPadConfig[] = [
  makePad({ id: 0, name: 'Punch Kick', shortName: 'KICK', color: 'coral', engine: 'kick', pitch: -1, tone: 0.45, decay: 0.34, punch: 0.86, drive: 0.24, volume: 0.98, reverbSend: 0 }),
  makePad({ id: 1, name: 'Metro 808', shortName: '808', color: 'coral', engine: '808', pitch: 0, tone: 0.42, decay: 0.78, punch: 0.64, drive: 0.32, volume: 0.96, chokeGroup: 2, reverbSend: 0 }),
  makePad({ id: 2, name: 'Trap Snare', shortName: 'SNARE', color: 'amber', engine: 'snare', pitch: 3, tone: 0.72, decay: 0.34, punch: 0.78, drive: 0.14, volume: 0.9, reverbSend: 0.18 }),
  makePad({ id: 3, name: 'Crisp Clap', shortName: 'CLAP', color: 'amber', engine: 'clap', pitch: 2, tone: 0.68, decay: 0.42, punch: 0.72, drive: 0.12, volume: 0.88, reverbSend: 0.24 }),
  makePad({ id: 4, name: 'Razor CH', shortName: 'CH', color: 'cyan', engine: 'hat', pitch: 2, tone: 0.76, decay: 0.16, punch: 0.65, volume: 0.72, pan: -0.14, chokeGroup: 1, reverbSend: 0.05 }),
  makePad({ id: 5, name: 'Sizzle OH', shortName: 'OH', color: 'cyan', engine: 'hat', pitch: 1, tone: 0.72, decay: 0.64, punch: 0.4, volume: 0.68, pan: 0.18, chokeGroup: 1, reverbSend: 0.14 }),
  makePad({ id: 6, name: 'Dark Rim', shortName: 'RIM', color: 'gold', engine: 'perc', pitch: -2, tone: 0.14, decay: 0.22, punch: 0.8, volume: 0.76, pan: 0.25, reverbSend: 0.22, delaySend: 0.18 }),
  makePad({ id: 7, name: 'Trap Shaker', shortName: 'SHKR', color: 'gold', engine: 'perc', pitch: 4, tone: 0.92, decay: 0.28, punch: 0.5, volume: 0.58, pan: -0.3 }),
  makePad({ id: 8, name: 'Sub Tom', shortName: 'L-TOM', color: 'emerald', engine: 'tom', pitch: -5, tone: 0.36, decay: 0.46, punch: 0.66, volume: 0.8, pan: -0.25, reverbSend: 0.16 }),
  makePad({ id: 9, name: 'Mid Tom', shortName: 'M-TOM', color: 'emerald', engine: 'tom', pitch: 0, tone: 0.44, decay: 0.4, punch: 0.62, volume: 0.78, pan: 0.05, reverbSend: 0.16 }),
  makePad({ id: 10, name: 'Hi Tom', shortName: 'H-TOM', color: 'emerald', engine: 'tom', pitch: 5, tone: 0.52, decay: 0.34, punch: 0.6, volume: 0.76, pan: 0.3, reverbSend: 0.16 }),
  makePad({ id: 11, name: '808 Cowbell', shortName: 'COWB', color: 'rose', engine: 'fm', pitch: 1, tone: 0.24, decay: 0.3, punch: 0.4, volume: 0.66, pan: -0.2, reverbSend: 0.18, delaySend: 0.22 }),
  makePad({ id: 12, name: 'Dark Crash', shortName: 'CRASH', color: 'slate', engine: 'cymbal', pitch: -2, tone: 0.64, decay: 0.76, punch: 0.65, volume: 0.62, pan: -0.15, reverbSend: 0.35 }),
  makePad({ id: 13, name: 'Glass Ride', shortName: 'RIDE', color: 'slate', engine: 'cymbal', pitch: 3, tone: 0.78, decay: 0.52, punch: 0.42, volume: 0.55, pan: 0.25, reverbSend: 0.22 }),
  makePad({ id: 14, name: 'FM Bell', shortName: 'BELL', color: 'rose', engine: 'fm', pitch: 7, tone: 0.58, decay: 0.68, punch: 0.32, volume: 0.64, pan: 0.12, reverbSend: 0.38, delaySend: 0.32 }),
  makePad({ id: 15, name: 'Laser Zap', shortName: 'ZAP', color: 'rose', engine: 'fm', pitch: -4, tone: 0.82, decay: 0.32, punch: 0.94, volume: 0.68, reverbSend: 0.2, delaySend: 0.28 }),
];

const METRO_PAT_A = buildPattern('A', 'Main Trap', 32, {
  0: [0, 10, 16, 22, 26],
  1: [
    { step: 0, vel: 0.95, pitch: 0 },
    { step: 10, vel: 0.9, pitch: 0 },
    { step: 14, vel: 0.82, pitch: 3 },
    { step: 16, vel: 0.96, pitch: 0 },
    { step: 22, vel: 0.88, pitch: -2 },
    { step: 26, vel: 0.92, pitch: -4 },
    { step: 30, vel: 0.85, pitch: 3 },
  ],
  2: [{ step: 8, vel: 0.94 }, { step: 24, vel: 0.96 }],
  3: [{ step: 8, vel: 0.86 }, { step: 24, vel: 0.88 }, { step: 31, vel: 0.52, prob: 0.75 }],
  4: [
    0, 2, 4, { step: 6, vel: 0.85, ratchet: 2 }, 8, 10, { step: 12, vel: 0.9, ratchet: 3 }, 14,
    16, 18, 20, { step: 22, vel: 0.78, ratchet: 2 }, 24, 26, 28, { step: 30, vel: 0.92, ratchet: 4 },
  ],
  5: [{ step: 4, vel: 0.62 }, { step: 20, vel: 0.66 }],
  6: [{ step: 15, vel: 0.62 }, { step: 29, vel: 0.7 }],
  14: [{ step: 0, vel: 0.58, pitch: 0 }, { step: 16, vel: 0.52, pitch: -2 }],
});

const METRO_PAT_B = buildPattern('B', 'Trap Breakdown', 16, {
  0: [0, 6, 10],
  1: [{ step: 0, vel: 0.95, pitch: 0 }, { step: 6, vel: 0.86, pitch: 5 }, { step: 10, vel: 0.92, pitch: 3 }],
  3: [{ step: 8, vel: 0.92 }],
  4: [0, 2, 4, 6, 8, { step: 10, vel: 0.82, ratchet: 2 }, 12, { step: 14, vel: 0.9, ratchet: 3 }],
  11: [{ step: 4, vel: 0.7 }, { step: 12, vel: 0.74 }, { step: 15, vel: 0.62 }],
});

// ---------------------------------------------------------------------------
// 2. 909 UKG / HOUSE (132 BPM)
// ---------------------------------------------------------------------------
const UKG_909_PADS: DrumPadConfig[] = [
  makePad({ id: 0, name: '909 Club Kick', shortName: 'KICK', color: 'coral', engine: 'kick', pitch: 1, tone: 0.55, decay: 0.36, punch: 0.82, drive: 0.18, volume: 0.98, reverbSend: 0 }),
  makePad({ id: 1, name: 'UKG Sub', shortName: 'SUB', color: 'coral', engine: '808', pitch: 2, tone: 0.25, decay: 0.55, punch: 0.45, drive: 0.16, volume: 0.88, chokeGroup: 2, reverbSend: 0 }),
  makePad({ id: 2, name: '909 Snare', shortName: 'SNARE', color: 'amber', engine: 'snare', pitch: 4, tone: 0.74, decay: 0.3, punch: 0.74, volume: 0.88, reverbSend: 0.16 }),
  makePad({ id: 3, name: '909 Clap', shortName: 'CLAP', color: 'amber', engine: 'clap', pitch: 1, tone: 0.62, decay: 0.38, punch: 0.68, volume: 0.9, reverbSend: 0.2 }),
  makePad({ id: 4, name: 'Skippy CH', shortName: 'CH', color: 'cyan', engine: 'hat', pitch: 3, tone: 0.82, decay: 0.14, punch: 0.72, volume: 0.74, pan: -0.15, chokeGroup: 1 }),
  makePad({ id: 5, name: '909 Open Hat', shortName: 'OH', color: 'cyan', engine: 'hat', pitch: 2, tone: 0.76, decay: 0.52, punch: 0.45, volume: 0.74, pan: 0.16, chokeGroup: 1, reverbSend: 0.12 }),
  makePad({ id: 6, name: '2-Step Rim', shortName: 'RIM', color: 'gold', engine: 'perc', pitch: 2, tone: 0.18, decay: 0.18, punch: 0.84, volume: 0.82, pan: 0.22, reverbSend: 0.18, delaySend: 0.15 }),
  makePad({ id: 7, name: 'Garage Shkr', shortName: 'SHKR', color: 'gold', engine: 'perc', pitch: 2, tone: 0.95, decay: 0.22, punch: 0.58, volume: 0.62, pan: -0.24 }),
  makePad({ id: 8, name: 'House LoTom', shortName: 'L-TOM', color: 'emerald', engine: 'tom', pitch: -3, tone: 0.45, decay: 0.42, punch: 0.65, volume: 0.8, pan: -0.2 }),
  makePad({ id: 9, name: 'House Conga', shortName: 'CONGA', color: 'emerald', engine: 'tom', pitch: 4, tone: 0.58, decay: 0.3, punch: 0.72, volume: 0.76, pan: 0.24, reverbSend: 0.14 }),
  makePad({ id: 10, name: 'Bongo Hi', shortName: 'BONGO', color: 'emerald', engine: 'tom', pitch: 9, tone: 0.62, decay: 0.24, punch: 0.75, volume: 0.72, pan: -0.28 }),
  makePad({ id: 11, name: 'Clave Hit', shortName: 'CLAVE', color: 'gold', engine: 'perc', pitch: 6, tone: 0.08, decay: 0.15, punch: 0.88, volume: 0.7, pan: 0.3, delaySend: 0.22 }),
  makePad({ id: 12, name: '909 Crash', shortName: 'CRASH', color: 'slate', engine: 'cymbal', pitch: 1, tone: 0.74, decay: 0.8, punch: 0.62, volume: 0.62, reverbSend: 0.3 }),
  makePad({ id: 13, name: '909 Ride', shortName: 'RIDE', color: 'slate', engine: 'cymbal', pitch: 4, tone: 0.84, decay: 0.48, punch: 0.48, volume: 0.6, pan: 0.22 }),
  makePad({ id: 14, name: 'Organ Perc', shortName: 'STAB', color: 'rose', engine: 'fm', pitch: 0, tone: 0.35, decay: 0.36, punch: 0.28, volume: 0.68, reverbSend: 0.26, delaySend: 0.24 }),
  makePad({ id: 15, name: 'Bass Pluck', shortName: 'PLUCK', color: 'rose', engine: 'logdrum', pitch: 3, tone: 0.52, decay: 0.42, punch: 0.65, volume: 0.78, chokeGroup: 2, reverbSend: 0.12 }),
];

const UKG_PAT_A = buildPattern('A', '2-Step UKG', 16, {
  0: [{ step: 0, vel: 0.98 }, { step: 10, vel: 0.92 }],
  2: [{ step: 4, vel: 0.86 }, { step: 12, vel: 0.9 }],
  3: [{ step: 4, vel: 0.84 }, { step: 12, vel: 0.86 }],
  4: [{ step: 3, vel: 0.68 }, { step: 7, vel: 0.72 }, { step: 9, vel: 0.55 }, { step: 11, vel: 0.76 }, { step: 15, vel: 0.74 }],
  5: [{ step: 2, vel: 0.76 }, { step: 6, vel: 0.64 }, { step: 10, vel: 0.72 }, { step: 14, vel: 0.78 }],
  6: [{ step: 7, vel: 0.74 }, { step: 14, vel: 0.66 }],
  7: [0, 2, 4, 6, 8, 10, 12, 14].map((s) => ({ step: s, vel: s % 4 === 2 ? 0.65 : 0.42 })),
  15: [{ step: 0, vel: 0.85, pitch: 0 }, { step: 3, vel: 0.76, pitch: 3 }, { step: 10, vel: 0.88, pitch: -2 }, { step: 13, vel: 0.78, pitch: 5 }],
});

const UKG_PAT_B = buildPattern('B', '4x4 Niche', 16, {
  0: [0, 4, 8, 12],
  3: [4, 12],
  4: [1, 3, 5, 7, 9, 11, 13, 15].map((s) => ({ step: s, vel: s % 4 === 3 ? 0.72 : 0.5 })),
  5: [2, 6, 10, 14],
  6: [{ step: 14, vel: 0.76 }],
  9: [{ step: 7, vel: 0.72 }, { step: 15, vel: 0.78 }],
});

// ---------------------------------------------------------------------------
// 3. DUSTY MPC 95 (Boom Bap, 92 BPM)
// ---------------------------------------------------------------------------
const MPC_BOOMBAP_PADS: DrumPadConfig[] = [
  makePad({ id: 0, name: 'Dusty Kick', shortName: 'KICK', color: 'coral', engine: 'kick', pitch: -2, tone: 0.34, decay: 0.42, punch: 0.74, filterCutoff: 0.74, drive: 0.36, crush: 0.14, volume: 0.96, reverbSend: 0.04 }),
  makePad({ id: 1, name: 'Warm Sub', shortName: 'SUB', color: 'coral', engine: '808', pitch: -1, tone: 0.28, decay: 0.65, punch: 0.38, filterCutoff: 0.62, drive: 0.28, volume: 0.86, chokeGroup: 2 }),
  makePad({ id: 2, name: 'Vinyl Snare', shortName: 'SNARE', color: 'amber', engine: 'snare', pitch: -1, tone: 0.54, decay: 0.42, punch: 0.66, filterCutoff: 0.8, drive: 0.32, crush: 0.18, volume: 0.94, reverbSend: 0.2 }),
  makePad({ id: 3, name: 'Lo-Fi Clap', shortName: 'CLAP', color: 'amber', engine: 'clap', pitch: -2, tone: 0.48, decay: 0.4, punch: 0.6, filterCutoff: 0.76, drive: 0.26, crush: 0.16, volume: 0.82, reverbSend: 0.22 }),
  makePad({ id: 4, name: 'Tape CH', shortName: 'CH', color: 'cyan', engine: 'hat', pitch: -2, tone: 0.56, decay: 0.2, punch: 0.52, filterCutoff: 0.78, crush: 0.15, volume: 0.7, pan: -0.18, chokeGroup: 1 }),
  makePad({ id: 5, name: 'Tape OH', shortName: 'OH', color: 'cyan', engine: 'hat', pitch: -2, tone: 0.52, decay: 0.62, punch: 0.38, filterCutoff: 0.74, crush: 0.14, volume: 0.66, pan: 0.18, chokeGroup: 1, reverbSend: 0.15 }),
  makePad({ id: 6, name: 'Wood Rim', shortName: 'RIM', color: 'gold', engine: 'perc', pitch: -3, tone: 0.12, decay: 0.24, punch: 0.72, drive: 0.22, crush: 0.12, volume: 0.76, pan: 0.22, reverbSend: 0.18 }),
  makePad({ id: 7, name: 'Brush Shkr', shortName: 'SHKR', color: 'gold', engine: 'perc', pitch: -1, tone: 0.88, decay: 0.32, punch: 0.36, filterCutoff: 0.78, volume: 0.58, pan: -0.25 }),
  makePad({ id: 8, name: 'Jazz LoTom', shortName: 'L-TOM', color: 'emerald', engine: 'tom', pitch: -4, tone: 0.36, decay: 0.52, punch: 0.55, drive: 0.22, volume: 0.8, pan: -0.22, reverbSend: 0.18 }),
  makePad({ id: 9, name: 'Jazz MidTom', shortName: 'M-TOM', color: 'emerald', engine: 'tom', pitch: 1, tone: 0.42, decay: 0.44, punch: 0.52, drive: 0.2, volume: 0.76, pan: 0.15, reverbSend: 0.18 }),
  makePad({ id: 10, name: 'Wood Block', shortName: 'BLOCK', color: 'emerald', engine: 'perc', pitch: 5, tone: 0.06, decay: 0.18, punch: 0.82, volume: 0.72, pan: 0.28, delaySend: 0.2 }),
  makePad({ id: 11, name: 'Ghost Snr', shortName: 'GHOST', color: 'amber', engine: 'snare', pitch: 2, tone: 0.48, decay: 0.22, punch: 0.44, filterCutoff: 0.72, volume: 0.64, pan: -0.1, reverbSend: 0.16 }),
  makePad({ id: 12, name: 'Vinyl Crash', shortName: 'CRASH', color: 'slate', engine: 'cymbal', pitch: -3, tone: 0.55, decay: 0.78, punch: 0.52, filterCutoff: 0.76, crush: 0.14, volume: 0.58, reverbSend: 0.3 }),
  makePad({ id: 13, name: 'Jazz Ride', shortName: 'RIDE', color: 'slate', engine: 'cymbal', pitch: 0, tone: 0.62, decay: 0.64, punch: 0.4, filterCutoff: 0.8, volume: 0.62, pan: 0.24, reverbSend: 0.2 }),
  makePad({ id: 14, name: 'Rhodes Bell', shortName: 'BELL', color: 'rose', engine: 'fm', pitch: -2, tone: 0.32, decay: 0.72, punch: 0.2, filterCutoff: 0.72, volume: 0.62, reverbSend: 0.36, delaySend: 0.26 }),
  makePad({ id: 15, name: 'Upright Hit', shortName: 'BASS', color: 'rose', engine: 'logdrum', pitch: -2, tone: 0.34, decay: 0.58, punch: 0.45, filterCutoff: 0.68, drive: 0.24, volume: 0.82, chokeGroup: 2 }),
];

const MPC_PAT_A = buildPattern('A', 'Dilla Swing', 16, {
  0: [{ step: 0, vel: 0.98 }, { step: 7, vel: 0.76, nudge: 0.12 }, { step: 10, vel: 0.92 }],
  2: [{ step: 4, vel: 0.96, nudge: 0.08 }, { step: 12, vel: 0.94, nudge: 0.06 }],
  4: [0, 2, 4, 6, 8, 10, 12, 14].map((s) => ({ step: s, vel: s % 4 === 0 ? 0.82 : 0.58, nudge: s % 4 === 2 ? 0.1 : 0 })),
  5: [{ step: 14, vel: 0.64 }],
  11: [{ step: 9, vel: 0.46 }, { step: 15, vel: 0.54 }],
  15: [{ step: 0, vel: 0.86, pitch: 0 }, { step: 10, vel: 0.82, pitch: -2 }, { step: 14, vel: 0.74, pitch: 3 }],
});

// ---------------------------------------------------------------------------
// 4. LIQUID / JUNGLE 174 (DnB, 174 BPM)
// ---------------------------------------------------------------------------
const DNB_JUNGLE_PADS: DrumPadConfig[] = [
  makePad({ id: 0, name: 'Tight DnB Kk', shortName: 'KICK', color: 'coral', engine: 'kick', pitch: 3, tone: 0.58, decay: 0.24, punch: 0.9, drive: 0.22, volume: 0.96, reverbSend: 0 }),
  makePad({ id: 1, name: 'Reese Sub', shortName: 'SUB', color: 'coral', engine: '808', pitch: 2, tone: 0.48, decay: 0.76, punch: 0.35, drive: 0.3, volume: 0.9, chokeGroup: 2 }),
  makePad({ id: 2, name: 'Jungle Snr', shortName: 'SNARE', color: 'amber', engine: 'snare', pitch: 6, tone: 0.82, decay: 0.26, punch: 0.86, drive: 0.22, volume: 0.94, reverbSend: 0.14 }),
  makePad({ id: 3, name: 'Ghost Snr', shortName: 'GHOST', color: 'amber', engine: 'snare', pitch: 8, tone: 0.74, decay: 0.16, punch: 0.62, volume: 0.72, pan: -0.1, reverbSend: 0.1 }),
  makePad({ id: 4, name: 'Amen CH', shortName: 'CH', color: 'cyan', engine: 'hat', pitch: 4, tone: 0.84, decay: 0.12, punch: 0.78, volume: 0.74, pan: -0.14, chokeGroup: 1 }),
  makePad({ id: 5, name: 'Amen OH', shortName: 'OH', color: 'cyan', engine: 'hat', pitch: 3, tone: 0.8, decay: 0.36, punch: 0.55, volume: 0.72, pan: 0.18, chokeGroup: 1 }),
  makePad({ id: 6, name: 'Break Rim', shortName: 'RIM', color: 'gold', engine: 'perc', pitch: 4, tone: 0.22, decay: 0.14, punch: 0.86, volume: 0.74, pan: 0.24 }),
  makePad({ id: 7, name: 'Fast Shkr', shortName: 'SHKR', color: 'gold', engine: 'perc', pitch: 5, tone: 0.94, decay: 0.16, punch: 0.65, volume: 0.62, pan: -0.22 }),
  makePad({ id: 8, name: 'Break LoTom', shortName: 'L-TOM', color: 'emerald', engine: 'tom', pitch: -1, tone: 0.52, decay: 0.32, punch: 0.74, volume: 0.78, pan: -0.24 }),
  makePad({ id: 9, name: 'Break HiTom', shortName: 'H-TOM', color: 'emerald', engine: 'tom', pitch: 5, tone: 0.58, decay: 0.26, punch: 0.74, volume: 0.76, pan: 0.24 }),
  makePad({ id: 10, name: 'Clap Layer', shortName: 'CLAP', color: 'amber', engine: 'clap', pitch: 4, tone: 0.76, decay: 0.28, punch: 0.78, volume: 0.78, reverbSend: 0.18 }),
  makePad({ id: 11, name: 'Metal Perc', shortName: 'METAL', color: 'rose', engine: 'fm', pitch: 6, tone: 0.68, decay: 0.22, punch: 0.64, volume: 0.64, delaySend: 0.26 }),
  makePad({ id: 12, name: 'Splash Cymb', shortName: 'CRASH', color: 'slate', engine: 'cymbal', pitch: 2, tone: 0.82, decay: 0.68, punch: 0.66, volume: 0.6, reverbSend: 0.28 }),
  makePad({ id: 13, name: 'Jungle Ride', shortName: 'RIDE', color: 'slate', engine: 'cymbal', pitch: 5, tone: 0.88, decay: 0.42, punch: 0.54, volume: 0.68, pan: 0.2, reverbSend: 0.18 }),
  makePad({ id: 14, name: 'Dub Siren', shortName: 'SIREN', color: 'rose', engine: 'fm', pitch: 2, tone: 0.76, decay: 0.64, punch: 0.88, volume: 0.62, reverbSend: 0.38, delaySend: 0.45 }),
  makePad({ id: 15, name: 'Laser Hit', shortName: 'LASER', color: 'rose', engine: 'fm', pitch: -3, tone: 0.9, decay: 0.28, punch: 0.96, volume: 0.66, delaySend: 0.35 }),
];

const DNB_PAT_A = buildPattern('A', '2-Step DnB', 16, {
  0: [{ step: 0, vel: 0.98 }, { step: 10, vel: 0.94 }],
  2: [{ step: 4, vel: 0.96 }, { step: 12, vel: 0.96 }],
  3: [{ step: 7, vel: 0.58 }, { step: 9, vel: 0.52 }, { step: 15, vel: 0.64 }],
  4: [0, 2, 4, 6, 8, 10, 12, 14].map((s) => ({ step: s, vel: s % 4 === 2 ? 0.78 : 0.62 })),
  5: [{ step: 6, vel: 0.64 }, { step: 14, vel: 0.68 }],
  13: [0, 2, 4, 6, 8, 10, 12, 14].map((s) => ({ step: s, vel: 0.52 })),
});

// ---------------------------------------------------------------------------
// 5. AMAPIANO LOG (Afrobeats / Amapiano, 114 BPM)
// ---------------------------------------------------------------------------
const AMAPIANO_PADS: DrumPadConfig[] = [
  makePad({ id: 0, name: 'Deep Afro Kk', shortName: 'KICK', color: 'coral', engine: 'kick', pitch: -1, tone: 0.38, decay: 0.4, punch: 0.72, drive: 0.14, volume: 0.96, reverbSend: 0 }),
  makePad({ id: 1, name: 'Log Drum A', shortName: 'LOG A', color: 'amber', engine: 'logdrum', pitch: 0, tone: 0.56, decay: 0.56, punch: 0.78, drive: 0.26, volume: 0.96, chokeGroup: 2, reverbSend: 0.08 }),
  makePad({ id: 2, name: 'Log Drum B', shortName: 'LOG B', color: 'amber', engine: 'logdrum', pitch: -5, tone: 0.48, decay: 0.64, punch: 0.72, drive: 0.24, volume: 0.92, chokeGroup: 2, reverbSend: 0.08 }),
  makePad({ id: 3, name: 'Soft Clap', shortName: 'CLAP', color: 'gold', engine: 'clap', pitch: 1, tone: 0.58, decay: 0.34, punch: 0.6, volume: 0.8, reverbSend: 0.22 }),
  makePad({ id: 4, name: 'Tight CH', shortName: 'CH', color: 'cyan', engine: 'hat', pitch: 1, tone: 0.72, decay: 0.14, punch: 0.58, volume: 0.68, pan: -0.16, chokeGroup: 1 }),
  makePad({ id: 5, name: 'Airy OH', shortName: 'OH', color: 'cyan', engine: 'hat', pitch: 1, tone: 0.68, decay: 0.46, punch: 0.42, volume: 0.64, pan: 0.2, chokeGroup: 1 }),
  makePad({ id: 6, name: 'Afro Rim', shortName: 'RIM', color: 'gold', engine: 'perc', pitch: 3, tone: 0.14, decay: 0.18, punch: 0.84, volume: 0.84, pan: 0.18, reverbSend: 0.18, delaySend: 0.16 }),
  makePad({ id: 7, name: 'Piano Shkr', shortName: 'SHKR', color: 'gold', engine: 'perc', pitch: 3, tone: 0.95, decay: 0.26, punch: 0.54, volume: 0.76, pan: -0.2 }),
  makePad({ id: 8, name: 'Low Conga', shortName: 'L-CNG', color: 'emerald', engine: 'tom', pitch: -2, tone: 0.46, decay: 0.4, punch: 0.66, volume: 0.82, pan: -0.26, reverbSend: 0.14 }),
  makePad({ id: 9, name: 'High Conga', shortName: 'H-CNG', color: 'emerald', engine: 'tom', pitch: 5, tone: 0.56, decay: 0.3, punch: 0.72, volume: 0.78, pan: 0.26, reverbSend: 0.14 }),
  makePad({ id: 10, name: 'Clave Wood', shortName: 'CLAVE', color: 'emerald', engine: 'perc', pitch: 7, tone: 0.08, decay: 0.15, punch: 0.9, volume: 0.74, pan: -0.3, delaySend: 0.2 }),
  makePad({ id: 11, name: 'Snare Snap', shortName: 'SNAP', color: 'amber', engine: 'snare', pitch: 5, tone: 0.64, decay: 0.24, punch: 0.7, volume: 0.78, reverbSend: 0.18 }),
  makePad({ id: 12, name: 'Warm Crash', shortName: 'CRASH', color: 'slate', engine: 'cymbal', pitch: -1, tone: 0.66, decay: 0.74, punch: 0.5, volume: 0.56, reverbSend: 0.3 }),
  makePad({ id: 13, name: 'Ride Bell', shortName: 'RIDE', color: 'slate', engine: 'cymbal', pitch: 3, tone: 0.76, decay: 0.48, punch: 0.48, volume: 0.56, pan: 0.22 }),
  makePad({ id: 14, name: 'Kalimba FM', shortName: 'KALIM', color: 'rose', engine: 'fm', pitch: 4, tone: 0.36, decay: 0.52, punch: 0.3, volume: 0.68, pan: 0.14, reverbSend: 0.3, delaySend: 0.28 }),
  makePad({ id: 15, name: 'Whistle FX', shortName: 'FX', color: 'rose', engine: 'fm', pitch: 10, tone: 0.44, decay: 0.62, punch: 0.6, volume: 0.56, reverbSend: 0.4, delaySend: 0.35 }),
];

const AMAPIANO_PAT_A = buildPattern('A', 'Log Groove', 16, {
  0: [0, 4, 8, 12],
  1: [
    { step: 3, vel: 0.92, pitch: 0 },
    { step: 6, vel: 0.88, pitch: 3 },
    { step: 10, vel: 0.95, pitch: 0 },
    { step: 14, vel: 0.9, pitch: -2 },
    { step: 15, vel: 0.84, pitch: 5 },
  ],
  6: [{ step: 3, vel: 0.76 }, { step: 6, vel: 0.8 }, { step: 12, vel: 0.72 }],
  7: Array.from({ length: 16 }, (_, s) => ({ step: s, vel: s % 4 === 2 ? 0.82 : s % 2 === 0 ? 0.64 : 0.42 })),
  8: [{ step: 11, vel: 0.74 }],
  9: [{ step: 7, vel: 0.76 }, { step: 15, vel: 0.72 }],
});

// ---------------------------------------------------------------------------
// 6. ELECTRO 80s (Synthwave / Electro, 124 BPM)
// ---------------------------------------------------------------------------
const ELECTRO_PADS: DrumPadConfig[] = [
  makePad({ id: 0, name: 'Linn Kick', shortName: 'KICK', color: 'coral', engine: 'kick', pitch: 0, tone: 0.52, decay: 0.38, punch: 0.84, drive: 0.22, volume: 0.96, reverbSend: 0.04 }),
  makePad({ id: 1, name: 'Electro 808', shortName: '808', color: 'coral', engine: '808', pitch: 1, tone: 0.36, decay: 0.66, punch: 0.56, drive: 0.2, volume: 0.9, chokeGroup: 2 }),
  makePad({ id: 2, name: 'Gated Snare', shortName: 'SNARE', color: 'amber', engine: 'snare', pitch: 0, tone: 0.76, decay: 0.48, punch: 0.76, drive: 0.24, volume: 0.94, reverbSend: 0.46 }),
  makePad({ id: 3, name: '808 Clap', shortName: 'CLAP', color: 'amber', engine: 'clap', pitch: 0, tone: 0.68, decay: 0.44, punch: 0.7, volume: 0.88, reverbSend: 0.32 }),
  makePad({ id: 4, name: '808 CH', shortName: 'CH', color: 'cyan', engine: 'hat', pitch: 0, tone: 0.74, decay: 0.16, punch: 0.62, volume: 0.72, pan: -0.15, chokeGroup: 1 }),
  makePad({ id: 5, name: '808 OH', shortName: 'OH', color: 'cyan', engine: 'hat', pitch: 0, tone: 0.72, decay: 0.58, punch: 0.44, volume: 0.7, pan: 0.18, chokeGroup: 1, reverbSend: 0.14 }),
  makePad({ id: 6, name: '808 Cowbell', shortName: 'COWB', color: 'rose', engine: 'fm', pitch: 0, tone: 0.22, decay: 0.32, punch: 0.35, volume: 0.78, pan: 0.2, reverbSend: 0.18, delaySend: 0.2 }),
  makePad({ id: 7, name: '808 Rim', shortName: 'RIM', color: 'gold', engine: 'perc', pitch: 2, tone: 0.16, decay: 0.16, punch: 0.82, volume: 0.74, pan: -0.22 }),
  makePad({ id: 8, name: 'Simmons Lo', shortName: 'L-TOM', color: 'emerald', engine: 'tom', pitch: -5, tone: 0.55, decay: 0.52, punch: 0.88, volume: 0.84, pan: -0.3, reverbSend: 0.28 }),
  makePad({ id: 9, name: 'Simmons Mid', shortName: 'M-TOM', color: 'emerald', engine: 'tom', pitch: 0, tone: 0.6, decay: 0.46, punch: 0.88, volume: 0.82, pan: 0, reverbSend: 0.28 }),
  makePad({ id: 10, name: 'Simmons Hi', shortName: 'H-TOM', color: 'emerald', engine: 'tom', pitch: 5, tone: 0.64, decay: 0.4, punch: 0.88, volume: 0.8, pan: 0.3, reverbSend: 0.28 }),
  makePad({ id: 11, name: 'Synth Zap', shortName: 'ZAP', color: 'rose', engine: 'fm', pitch: 2, tone: 0.86, decay: 0.34, punch: 0.96, volume: 0.74, pan: -0.25, delaySend: 0.32 }),
  makePad({ id: 12, name: '80s Crash', shortName: 'CRASH', color: 'slate', engine: 'cymbal', pitch: 0, tone: 0.74, decay: 0.84, punch: 0.58, volume: 0.64, reverbSend: 0.38 }),
  makePad({ id: 13, name: '80s Ride', shortName: 'RIDE', color: 'slate', engine: 'cymbal', pitch: 2, tone: 0.8, decay: 0.54, punch: 0.46, volume: 0.6, pan: 0.24, reverbSend: 0.2 }),
  makePad({ id: 14, name: 'DX Bell', shortName: 'BELL', color: 'rose', engine: 'fm', pitch: 7, tone: 0.48, decay: 0.68, punch: 0.24, volume: 0.64, reverbSend: 0.34, delaySend: 0.28 }),
  makePad({ id: 15, name: 'Electro Sub', shortName: 'BASS', color: 'coral', engine: 'logdrum', pitch: -1, tone: 0.42, decay: 0.48, punch: 0.58, volume: 0.8, chokeGroup: 2 }),
];

const ELECTRO_PAT_A = buildPattern('A', 'Miami Electro', 16, {
  0: [0, 6, 10],
  2: [4, 12],
  3: [{ step: 4, vel: 0.78 }, { step: 12, vel: 0.82 }],
  4: [0, 2, 4, 6, 8, 10, 12, 14],
  5: [{ step: 2, vel: 0.64 }, { step: 14, vel: 0.7 }],
  6: [{ step: 0, vel: 0.76 }, { step: 3, vel: 0.72 }, { step: 6, vel: 0.78 }, { step: 11, vel: 0.74 }, { step: 14, vel: 0.8 }],
  11: [{ step: 15, vel: 0.78 }],
});

export const FACTORY_KITS: FactoryKitPreset[] = [
  {
    id: 'metro-808',
    name: '808 TRAP STUDIO',
    genre: 'Trap / Hip-Hop',
    bpm: 142,
    swing: 0.08,
    description: 'Booming tuned 808s, razor hi-hat rolls, crisp layered snares & dark FM bells.',
    pads: METRO_808_PADS,
    melodic: { preset: 'pluck', rootMidi: 53, scale: 'minor', cutoff: 0.65, reverbSend: 0.34, delaySend: 0.3 },
    demoPattern: METRO_PAT_A,
    demoPatternB: METRO_PAT_B,
  },
  {
    id: 'ukg-909',
    name: '909 UKG / HOUSE',
    genre: 'UK Garage / House',
    bpm: 132,
    swing: 0.24,
    description: 'Punchy 909 club kicks, skippy 2-step hi-hats, crisp rims & organ stabs.',
    pads: UKG_909_PADS,
    melodic: { preset: 'organ', rootMidi: 53, scale: 'minor', cutoff: 0.78, reverbSend: 0.24, delaySend: 0.22 },
    demoPattern: UKG_PAT_A,
    demoPatternB: UKG_PAT_B,
  },
  {
    id: 'mpc-boombap',
    name: 'DUSTY MPC 95',
    genre: 'Boom Bap / Lo-Fi',
    bpm: 92,
    swing: 0.34,
    description: 'Saturated lo-fi kicks, crunchy vinyl snares, swung tape hats & warm upright bass.',
    pads: MPC_BOOMBAP_PADS,
    melodic: { preset: 'rhodes', rootMidi: 50, scale: 'dorian', cutoff: 0.58, reverbSend: 0.32, delaySend: 0.18 },
    demoPattern: MPC_PAT_A,
  },
  {
    id: 'dnb-jungle',
    name: 'LIQUID / JUNGLE 174',
    genre: 'Drum & Bass',
    bpm: 174,
    swing: 0.04,
    description: 'Tight high-energy DnB kicks, snappy jungle snares, ghost breaks & dub sirens.',
    pads: DNB_JUNGLE_PADS,
    melodic: { preset: 'reese', rootMidi: 41, scale: 'minor', cutoff: 0.62, drive: 0.32, reverbSend: 0.16, delaySend: 0.12 },
    demoPattern: DNB_PAT_A,
  },
  {
    id: 'amapiano-log',
    name: 'AMAPIANO LOG',
    genre: 'Amapiano / Afro',
    bpm: 114,
    swing: 0.16,
    description: 'Authentic resonant log drums, rolling shaker grooves, congas & afro rims.',
    pads: AMAPIANO_PADS,
    melodic: { preset: 'pad', rootMidi: 55, scale: 'minor', cutoff: 0.62, reverbSend: 0.42, delaySend: 0.22 },
    demoPattern: AMAPIANO_PAT_A,
  },
  {
    id: 'electro-synth',
    name: 'ELECTRO 80s',
    genre: 'Electro / Synthwave',
    bpm: 124,
    swing: 0.06,
    description: 'Gated reverb snares, Simmons pitch-drop toms, 808 cowbells & synth zaps.',
    pads: ELECTRO_PADS,
    melodic: { preset: 'acid', rootMidi: 45, scale: 'minor', cutoff: 0.72, resonance: 0.52, drive: 0.28 },
    demoPattern: ELECTRO_PAT_A,
  },
];

const PATTERN_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export function createProjectFromKit(kit: FactoryKitPreset): DawProject {
  const patterns: DrumPattern[] = PATTERN_IDS.map((id, idx) => {
    if (idx === 0) return clonePattern(kit.demoPattern, 'A', kit.demoPattern.name);
    if (idx === 1 && kit.demoPatternB) return clonePattern(kit.demoPatternB, 'B', kit.demoPatternB.name);
    return createEmptyPattern(id, `Pattern ${id}`, 16);
  });

  return {
    version: 1,
    name: `${kit.name} Session`,
    bpm: kit.bpm,
    swing: kit.swing,
    kitId: kit.id,
    pads: kit.pads.map((p) => ({ ...p })),
    melodic: { ...DEFAULT_MELODIC_TRACK, ...(kit.melodic ?? {}) },
    patterns,
    activePatternIndex: 0,
    songClips: [
      { id: 'clip-1', patternId: 'A', bars: 2 },
      { id: 'clip-2', patternId: kit.demoPatternB ? 'B' : 'A', bars: 2 },
    ],
    playMode: 'pattern',
    master: { ...DEFAULT_MASTER_BUS },
  };
}
