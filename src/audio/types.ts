export type PhaseMode = 'off' | 'subtract' | 'multiply';
export type Filter1Type = 'lp24' | 'lp12' | 'bp12' | 'hp12' | 'notch';
export type PlayMode = 'retrig' | 'legato';

export type Lfo1Waveform =
  | 'triangle'
  | 'rampUp'
  | 'rampDown'
  | 'square'
  | 'randomStepped'
  | 'randomSmooth';

export type Lfo1Dest =
  | 'osc12'
  | 'osc2'
  | 'filterFreq'
  | 'fm'
  | 'phase'
  | 'oscMix';

export type Lfo2Dest = 'osc12' | 'phase' | 'filterFreq2' | 'amp';

export type ModEnvDest =
  | 'osc1'
  | 'osc2'
  | 'oscMix'
  | 'fm'
  | 'phase'
  | 'freq2';

export type DriveType = 'tube' | 'tape' | 'fold' | 'fuzz';

export interface SyncDivision {
  label: string;
  beats: number; // duration of 1 LFO cycle in quarter-note beats
}

export const LFO_SYNC_DIVISIONS: SyncDivision[] = [
  { label: '4/1', beats: 16 },
  { label: '2/1', beats: 8 },
  { label: '1/1', beats: 4 },
  { label: '1/2D', beats: 3 },
  { label: '1/2', beats: 2 },
  { label: '1/2T', beats: 4 / 3 },
  { label: '1/4D', beats: 1.5 },
  { label: '1/4', beats: 1 },
  { label: '1/4T', beats: 2 / 3 },
  { label: '1/8D', beats: 0.75 },
  { label: '1/8', beats: 0.5 },
  { label: '1/8T', beats: 1 / 3 },
  { label: '1/16D', beats: 0.375 },
  { label: '1/16', beats: 0.25 },
  { label: '1/16T', beats: 1 / 6 },
  { label: '1/32', beats: 0.125 },
];

export interface WaveformMeta {
  id: number; // 1..32
  name: string;
  shortName: string;
  category: 'Analog' | 'Keys & Organ' | 'Bass' | 'Strings & Brass' | 'Mallet & Pluck' | 'FM & Metallic';
}

export const WAVEFORM_CATALOG: WaveformMeta[] = [
  { id: 1, name: 'Sawtooth', shortName: 'SAW', category: 'Analog' },
  { id: 2, name: 'Square', shortName: 'SQR', category: 'Analog' },
  { id: 3, name: 'Triangle', shortName: 'TRI', category: 'Analog' },
  { id: 4, name: 'Sine', shortName: 'SIN', category: 'Analog' },
  { id: 5, name: 'Soft Saw', shortName: 'W05', category: 'Analog' },
  { id: 6, name: 'Acoustic Piano', shortName: 'W06', category: 'Keys & Organ' },
  { id: 7, name: 'Glassy E-Piano', shortName: 'W07', category: 'Keys & Organ' },
  { id: 8, name: 'Clavinet / Harpsi', shortName: 'W08', category: 'Keys & Organ' },
  { id: 9, name: 'Electric Bass', shortName: 'W09', category: 'Bass' },
  { id: 10, name: 'Deep Sub', shortName: 'W10', category: 'Bass' },
  { id: 11, name: 'UK M1 Organ', shortName: 'W11', category: 'Keys & Organ' },
  { id: 12, name: 'Metallic Edge', shortName: 'W12', category: 'FM & Metallic' },
  { id: 13, name: 'Hollow Pulse', shortName: 'W13', category: 'Analog' },
  { id: 14, name: 'Nasal Reed', shortName: 'W14', category: 'Strings & Brass' },
  { id: 15, name: 'Warm String', shortName: 'W15', category: 'Strings & Brass' },
  { id: 16, name: 'Bright String', shortName: 'W16', category: 'Strings & Brass' },
  { id: 17, name: 'Ensemble String', shortName: 'W17', category: 'Strings & Brass' },
  { id: 18, name: 'Steel Guitar', shortName: 'W18', category: 'Mallet & Pluck' },
  { id: 19, name: 'Synth Brass', shortName: 'W19', category: 'Strings & Brass' },
  { id: 20, name: 'Muted Brass', shortName: 'W20', category: 'Strings & Brass' },
  { id: 21, name: 'Saxophone', shortName: 'W21', category: 'Strings & Brass' },
  { id: 22, name: 'Trumpet', shortName: 'W22', category: 'Strings & Brass' },
  { id: 23, name: 'Marimba', shortName: 'W23', category: 'Mallet & Pluck' },
  { id: 24, name: 'Wood Mallet', shortName: 'W24', category: 'Mallet & Pluck' },
  { id: 25, name: 'Pluck Guitar', shortName: 'W25', category: 'Mallet & Pluck' },
  { id: 26, name: 'Harp Pluck', shortName: 'W26', category: 'Mallet & Pluck' },
  { id: 27, name: 'Vibraphone', shortName: 'W27', category: 'Mallet & Pluck' },
  { id: 28, name: 'Bright Mallet', shortName: 'W28', category: 'Mallet & Pluck' },
  { id: 29, name: 'Metallic Bell', shortName: 'W29', category: 'FM & Metallic' },
  { id: 30, name: 'FM Grit I', shortName: 'W30', category: 'FM & Metallic' },
  { id: 31, name: 'FM Grit II', shortName: 'W31', category: 'FM & Metallic' },
  { id: 32, name: 'Alien Noise-Tone', shortName: 'W32', category: 'FM & Metallic' },
];

export interface SubtractorPatch {
  id: string;
  name: string;
  category: 'Warp' | 'Organ' | 'Wobble' | 'Sub' | 'Donk & Pluck' | 'Reese & Lead' | 'Acid & FX' | 'Init';
  artistRef: string;

  // Voice & Play
  polyphony: number; // 1..16
  playMode: PlayMode;
  portamento: number; // 0..1 (maps to 0..600ms)
  pitchBendRange: number; // 1..24 semitones
  masterLevel: number; // 0..1

  // Osc 1
  osc1Wave: number; // 1..32
  osc1PhaseMode: PhaseMode;
  osc1Phase: number; // 0..1
  osc1Octave: number; // 0..8 (4 = normal)
  osc1Semi: number; // 0..12
  osc1Cent: number; // -50..50
  osc1KbdTrack: boolean;

  // Osc 2
  osc2On: boolean;
  osc2Wave: number; // 1..32
  osc2PhaseMode: PhaseMode;
  osc2Phase: number; // 0..1
  osc2Octave: number; // 0..8 (4 = normal)
  osc2Semi: number; // 0..12
  osc2Cent: number; // -50..50
  osc2KbdTrack: boolean;

  // Osc Mix, FM, Ring
  oscMix: number; // 0 = Osc1 only, 1 = Osc2 only
  fmAmount: number; // 0..1
  ringMod: boolean;

  // Noise Generator (routed into Osc 2 bus, can FM Osc 1!)
  noiseOn: boolean;
  noiseDecay: number; // 0..1 (1 = infinite hold)
  noiseColor: number; // 0..1 (dark -> bright)
  noiseLevel: number; // 0..1

  // Filter 1 (Multimode)
  filter1Type: Filter1Type;
  filter1Freq: number; // 0..1 (log mapped 28Hz..18kHz)
  filter1Res: number; // 0..1
  filter1Kbd: number; // 0..1

  // Filter 2 (LP12 Linkable)
  filter2On: boolean;
  filterLink: boolean;
  filter2Freq: number; // 0..1
  filter2Res: number; // 0..1

  // Filter Envelope
  filterEnvAttack: number; // 0..1
  filterEnvDecay: number; // 0..1
  filterEnvSustain: number; // 0..1
  filterEnvRelease: number; // 0..1
  filterEnvAmount: number; // 0..1
  filterEnvInvert: boolean;

  // Amp Envelope
  ampEnvAttack: number; // 0..1
  ampEnvDecay: number; // 0..1
  ampEnvSustain: number; // 0..1
  ampEnvRelease: number; // 0..1

  // Mod Envelope
  modEnvAttack: number; // 0..1
  modEnvDecay: number; // 0..1
  modEnvSustain: number; // 0..1
  modEnvRelease: number; // 0..1
  modEnvAmount: number; // 0..1
  modEnvInvert: boolean;
  modEnvDest: ModEnvDest;

  // LFO 1
  lfo1Wave: Lfo1Waveform;
  lfo1Dest: Lfo1Dest;
  lfo1Sync: boolean;
  lfo1Rate: number; // 0..1 (if sync: indexes LFO_SYNC_DIVISIONS)
  lfo1Amount: number; // 0..1

  // LFO 2
  lfo2Dest: Lfo2Dest;
  lfo2Delay: number; // 0..1
  lfo2KbdTrack: boolean;
  lfo2Rate: number; // 0..1
  lfo2Amount: number; // 0..1

  // Mod Wheel Destinations (-1..1)
  modWheelFilterFreq: number;
  modWheelFilterRes: number;
  modWheelLfo1: number;
  modWheelPhase: number;
  modWheelFm: number;

  // Velocity Destinations (-1..1)
  velFilterEnv: number;
  velFilterDecay: number;
  velFilterFreq: number;
  velFm: number;
  velModEnv: number;
  velPhase: number;
  velAmp: number;
  velOscMix: number;

  // UK Bassline Rack FX (Reason Combinator / Scream 4 inspired)
  fxSubOn: boolean;
  fxSubLevel: number; // 0..1
  fxSubOctave: -1 | 0;
  fxDriveOn: boolean;
  fxDriveType: DriveType;
  fxDriveAmount: number; // 0..1
  fxDriveTone: number; // 0..1
  fxChorusOn: boolean;
  fxChorusMix: number; // 0..1
  fxChorusRate: number; // 0..1
  fxSidechainAmount: number; // 0..1 (4x4 kick ducking)
}

export interface SequencerStep {
  active: boolean;
  note: number; // MIDI note (e.g., 36 = C2, 41 = F2)
  velocity: number; // 0..1
  slide: boolean; // legato tie / portamento glide into next step
  accent: boolean; // velocity boost
}

export interface BassPattern {
  id: string;
  name: string;
  style: string;
  bpm: number;
  swing: number; // 0..0.35
  drumGroove: '4x4' | '2step' | 'halftime' | 'off';
  steps: SequencerStep[];
}
