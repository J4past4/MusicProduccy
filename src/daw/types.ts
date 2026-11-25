/**
 * Core data structures for PRODUCCY — Mobile-First Pro DAW & Drum Rack.
 */

export type DrumSynthEngineType =
  | 'kick'
  | '808'
  | 'snare'
  | 'clap'
  | 'hat'
  | 'cymbal'
  | 'tom'
  | 'perc'
  | 'fm'
  | 'logdrum'
  | 'sample';

export type FilterMode = 'lp' | 'hp' | 'bp';

export type ChokeGroup = 0 | 1 | 2 | 3 | 4; // 0 = OFF, 1=A, 2=B, 3=C, 4=D

export type PadColor =
  | 'amber'
  | 'coral'
  | 'emerald'
  | 'cyan'
  | 'gold'
  | 'rose'
  | 'slate';

export type NoteRepeatRate = 'off' | '1/4' | '1/8' | '1/16' | '1/32' | '1/16T';

export type SixteenLevelsMode = 'off' | 'pitch' | 'velocity';

export type StepParamLane = 'velocity' | 'pitch' | 'ratchet' | 'probability' | 'pan' | 'nudge';

export type DawTab = 'pads' | 'seq' | 'edit' | 'mixer' | 'song';

export type DelayDivision = '1/16' | '1/8' | '1/8D' | '1/4';

export interface PadSampleMeta {
  name: string;
  sampleRate: number;
  duration: number;
  start: number; // 0..1 normalized
  end: number; // 0..1 normalized
  reverse: boolean;
  oneShot: boolean;
  peaks: number[]; // 96 normalized peaks for waveform display
}

export interface DrumPadConfig {
  id: number; // 0..15
  name: string;
  shortName: string;
  color: PadColor;
  engine: DrumSynthEngineType;
  pitch: number; // -24..+24 semitones
  fine: number; // -100..+100 cents
  tone: number; // 0..1
  decay: number; // 0..1
  punch: number; // 0..1
  attack: number; // 0..1
  filterMode: FilterMode;
  filterCutoff: number; // 0..1
  filterRes: number; // 0..1
  drive: number; // 0..1
  crush: number; // 0..1
  volume: number; // 0..1.2
  pan: number; // -1..1
  reverbSend: number; // 0..1
  delaySend: number; // 0..1
  mute: boolean;
  solo: boolean;
  chokeGroup: ChokeGroup;
  reverse: boolean;
  trimStart: number; // 0..0.95
  trimEnd: number; // 0.05..1
  sampleMeta?: PadSampleMeta;
}

export interface StepCell {
  active: boolean;
  velocity: number; // 0.08..1
  pitch: number; // -12..+12 semitones
  ratchet: 1 | 2 | 3 | 4;
  probability: number; // 0.1..1
  pan: number; // -1..1
  nudge: number; // -0.45..0.45
}

export interface DrumPattern {
  id: string; // 'A'..'H'
  name: string;
  length: 16 | 32 | 64;
  steps: StepCell[][]; // [16][64]
}

export interface MasterBusConfig {
  volume: number; // 0..1.2
  eqLow: number; // -12..+12 dB
  eqMid: number; // -12..+12 dB
  eqHigh: number; // -12..+12 dB
  compThreshold: number; // -36..0 dB
  compRatio: number; // 1..12
  compMakeup: number; // 0..12 dB
  reverbDecay: number; // 0.3..4.0 s
  reverbTone: number; // 0..1
  delayDivision: DelayDivision;
  delayFeedback: number; // 0..0.82
  limiterOn: boolean;
}

export interface SongClip {
  id: string;
  patternId: string; // 'A'..'H'
  bars: number; // 1..8
}

export interface DawProject {
  version: 1;
  name: string;
  bpm: number;
  swing: number; // 0..0.65
  kitId: string;
  pads: DrumPadConfig[];
  patterns: DrumPattern[];
  activePatternIndex: number;
  songClips: SongClip[];
  playMode: 'pattern' | 'song';
  master: MasterBusConfig;
}

export interface FactoryKitPreset {
  id: string;
  name: string;
  genre: string;
  bpm: number;
  swing: number;
  description: string;
  pads: DrumPadConfig[];
  demoPattern: DrumPattern;
  demoPatternB?: DrumPattern;
}

export function createEmptyStep(): StepCell {
  return {
    active: false,
    velocity: 0.85,
    pitch: 0,
    ratchet: 1,
    probability: 1,
    pan: 0,
    nudge: 0,
  };
}

export function createEmptyPattern(id: string, name: string, length: 16 | 32 | 64 = 16): DrumPattern {
  return {
    id,
    name,
    length,
    steps: Array.from({ length: 16 }, () => Array.from({ length: 64 }, () => createEmptyStep())),
  };
}

export const DEFAULT_MASTER_BUS: MasterBusConfig = {
  volume: 0.88,
  eqLow: 1.5,
  eqMid: 0,
  eqHigh: 1.0,
  compThreshold: -14,
  compRatio: 3.5,
  compMakeup: 2.5,
  reverbDecay: 1.6,
  reverbTone: 0.62,
  delayDivision: '1/8D',
  delayFeedback: 0.36,
  limiterOn: true,
};

export const CHOKE_LABELS = ['OFF', 'A', 'B', 'C', 'D'] as const;

export const ENGINE_LABELS: Record<DrumSynthEngineType, string> = {
  kick: 'KICK',
  '808': '808 SUB',
  snare: 'SNARE',
  clap: 'CLAP',
  hat: 'HI-HAT',
  cymbal: 'CYMBAL',
  tom: 'TOM',
  perc: 'PERC',
  fm: 'FM BELL',
  logdrum: 'LOG DRUM',
  sample: 'SAMPLE',
};
