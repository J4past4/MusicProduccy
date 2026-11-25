/**
 * PRODUCCY AI Beat Co-Producer Engine.
 * Structured, music-theory-grounded studio agent that inspects the live DawProject,
 * composes genre-authentic beats & melodies, sculpts per-pad DSP, auto-mixes the console,
 * and builds full multi-section song arrangements.
 */

import {
  createEmptyMelodicLane,
  createEmptyPattern,
  midiToNoteName,
  NOTE_NAMES,
  type BeatAnalysis,
  type BeatDiagnostic,
  type DawProject,
  type DrumPattern,
  type MelodicSynthPreset,
  type MusicalScaleName,
} from '../types';
import { createProjectFromKit, FACTORY_KITS } from '../data/factoryKits';
import { clonePattern, humanizePattern } from '../data/patternTools';
import { buildScaleChord, scaleDegreeToMidi } from '../audio/melodicDspCore';

export interface CoProducerResult {
  nextProject: DawProject;
  summary: string;
  actionsApplied: string[];
  dirtyPadIds: number[];
}

export const QUICK_AGENT_PROMPTS: { label: string; prompt: string }[] = [
  { label: 'UK Drill 142 (F Min)', prompt: 'Make a dark 142 bpm UK drill beat in F minor with sliding 808s and haunted pluck' },
  { label: 'UKG 2-Step + M1 Organ', prompt: 'Create a 134 bpm UK garage 2-step beat in C minor with M1 organ chords' },
  { label: 'Amapiano Log + Chords', prompt: 'Build a 114 bpm amapiano groove in G minor with log drum bass and warm pad chords' },
  { label: 'Dusty Boom Bap + Rhodes', prompt: 'Make a 90 bpm dusty lo-fi boom bap beat in D dorian with warm rhodes chords' },
  { label: 'Jersey Club 140', prompt: 'Create a 140 bpm jersey club bounce beat with hard kick and pluck melody' },
  { label: 'Spicy Hat Rolls', prompt: 'Add spicy trap hi-hat rolls and ghost percussion to my beat' },
  { label: 'Auto-Mix & Master', prompt: 'Auto-mix and master all channels for maximum club punch' },
  { label: 'Build Full Song', prompt: 'Build a full 4-section song arrangement with intro, drop, breakdown fill, and outro' },
];

// ---------------------------------------------------------------------------
// 1. Real-Time Studio Beat Analyzer
// ---------------------------------------------------------------------------

export function analyzeBeat(project: DawProject): BeatAnalysis {
  const pattern = project.patterns[project.activePatternIndex] ?? project.patterns[0];
  const len = pattern?.length ?? 16;

  let activePadsCount = 0;
  let totalHits = 0;
  let minVel = 1;
  let maxVel = 0;
  let hasRatchets = false;
  let hasSubReverb = false;
  let hasHatChokeIssue = false;

  for (let p = 0; p < 16; p++) {
    const pad = project.pads[p];
    const row = pattern.steps[p];
    let padHits = 0;
    for (let s = 0; s < len; s++) {
      const c = row[s];
      if (c && c.active) {
        padHits++;
        totalHits++;
        if (c.velocity < minVel) minVel = c.velocity;
        if (c.velocity > maxVel) maxVel = c.velocity;
        if (c.ratchet > 1) hasRatchets = true;
      }
    }
    if (padHits > 0) {
      activePadsCount++;
      if ((pad.engine === 'kick' || pad.engine === '808') && pad.reverbSend > 0.08) {
        hasSubReverb = true;
      }
    }
  }

  // Check if closed & open hats share a choke group
  const hatPads = project.pads.filter((p) => p.engine === 'hat');
  if (hatPads.length >= 2 && hatPads[0].chokeGroup === 0) {
    hasHatChokeIssue = true;
  }

  const melodicHits = (pattern.melodicSteps ?? [])
    .slice(0, len)
    .filter((m) => m.active && m.notes.length > 0).length;
  const hasMelodicTrack = melodicHits > 0;

  const densityPct = Math.min(100, Math.round((totalHits / Math.max(1, len * 3.5)) * 100));
  const dynamicRangePct = totalHits > 1 ? Math.round((maxVel - minVel) * 100) : 0;

  const rootName = NOTE_NAMES[((project.melodic.rootMidi % 12) + 12) % 12];
  const keyLabel = `${rootName} ${project.melodic.scale.toUpperCase()}`;
  const pocketLabel =
    project.swing >= 0.25
      ? 'HEAVY SWING'
      : project.swing >= 0.1
      ? 'GROOVE POCKET'
      : 'TIGHT QUANTIZED';

  const diagnostics: BeatDiagnostic[] = [];
  let score = 62;

  if (activePadsCount >= 5) {
    score += 10;
    diagnostics.push({
      id: 'layering',
      severity: 'good',
      title: `Solid ${activePadsCount}-pad drum layering`,
      detail: `${totalHits} active hits across ${len} steps.`,
    });
  } else {
    diagnostics.push({
      id: 'sparse',
      severity: 'tip',
      title: 'Sparse drum arrangement',
      detail: `Only ${activePadsCount} pads active. Add percussion or hat rolls for energy.`,
      fixPrompt: 'Add spicy hi-hat rolls and ghost percussion to my beat',
    });
  }

  if (hasMelodicTrack) {
    score += 12;
    diagnostics.push({
      id: 'melodic-ok',
      severity: 'good',
      title: `Melodic ${project.melodic.preset.toUpperCase()} locked in ${keyLabel}`,
      detail: `${melodicHits} melodic phrases synced to the drum rack.`,
    });
  } else {
    diagnostics.push({
      id: 'no-melody',
      severity: 'tip',
      title: 'No melodic synth hook yet',
      detail: `Add scale-locked chords or bass in ${keyLabel} to turn drums into a full beat.`,
      fixPrompt: `Add a melodic ${project.melodic.preset} hook in ${rootName} ${project.melodic.scale}`,
    });
  }

  if (hasSubReverb) {
    score -= 10;
    diagnostics.push({
      id: 'sub-reverb',
      severity: 'warn',
      title: 'Low-end reverb mud detected',
      detail: 'Kick or 808 has Reverb Send active — mono dry sub hits much harder.',
      fixPrompt: 'Auto-mix and master all channels for maximum club punch',
    });
  } else {
    score += 6;
  }

  if (hasHatChokeIssue) {
    score -= 5;
    diagnostics.push({
      id: 'hat-choke',
      severity: 'warn',
      title: 'Hi-hat choke group unassigned',
      detail: 'Link Closed & Open Hi-Hats to Choke Group A for crisp realism.',
      fixPrompt: 'Auto-mix and master all channels for maximum club punch',
    });
  }

  if (dynamicRangePct >= 18 || hasRatchets) {
    score += 10;
  } else if (totalHits > 4) {
    diagnostics.push({
      id: 'flat-vel',
      severity: 'tip',
      title: 'Flat velocity dynamics',
      detail: 'Humanize velocities and micro-timing so the beat breathes.',
      fixPrompt: 'Humanize the groove and add dynamic bounce',
    });
  }

  return {
    activePadsCount,
    totalHits,
    densityPct,
    dynamicRangePct,
    hasMelodicTrack,
    keyLabel,
    pocketLabel,
    score: Math.max(15, Math.min(100, score)),
    diagnostics,
  };
}

// ---------------------------------------------------------------------------
// 2. Musical Prompt Parsing Helpers
// ---------------------------------------------------------------------------

function extractBpm(text: string): number | null {
  const m = text.match(/\b(\d{2,3})\s*bpm\b/i);
  if (!m) return null;
  const val = Number(m[1]);
  return val >= 55 && val <= 215 ? val : null;
}

function extractKeyAndScale(text: string): { rootMidi?: number; scale?: MusicalScaleName } {
  const result: { rootMidi?: number; scale?: MusicalScaleName } = {};
  const scaleMatch = text.match(/\b(minor|phrygian|dorian|major|pentatonic)\b/i);
  if (scaleMatch) {
    result.scale = scaleMatch[1].toLowerCase() as MusicalScaleName;
  }

  const keyMatch = text.match(/\b(?:in\s+)?([A-G])([#b])?\s*(?:minor|min|m|major|maj|phrygian|dorian|pentatonic)\b/i);
  if (keyMatch) {
    const baseMap: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let semi = baseMap[keyMatch[1].toUpperCase()] ?? 5;
    if (keyMatch[2] === '#') semi = (semi + 1) % 12;
    if (keyMatch[2] === 'b') semi = (semi + 11) % 12;
    result.rootMidi = 48 + semi; // C3..B3 range
  }
  return result;
}

function extractPresetHint(text: string): MelodicSynthPreset | null {
  if (/reese|sub\s*bass/i.test(text)) return 'reese';
  if (/organ|m1/i.test(text)) return 'organ';
  if (/pad|ambient|chords|atmosphere/i.test(text)) return 'pad';
  if (/pluck|bell|haunt|metro/i.test(text)) return 'pluck';
  if (/rhodes|piano|keys|jazzy/i.test(text)) return 'rhodes';
  if (/acid|303|synthwave|lead/i.test(text)) return 'acid';
  return null;
}

type GenreIntent =
  | 'drill'
  | 'trap'
  | 'ukg'
  | 'house'
  | 'boombap'
  | 'dnb'
  | 'amapiano'
  | 'jersey'
  | 'phonk'
  | 'electro'
  | null;

function detectGenre(text: string): GenreIntent {
  if (/drill/i.test(text)) return 'drill';
  if (/jersey/i.test(text)) return 'jersey';
  if (/phonk|memphis/i.test(text)) return 'phonk';
  if (/amapiano|afro|log\s*drum/i.test(text)) return 'amapiano';
  if (/ukg|garage|2-?step|niche/i.test(text)) return 'ukg';
  if (/house|techno|4x4/i.test(text)) return 'house';
  if (/boom\s*bap|dilla|mpc|90s|hip-?hop/i.test(text)) return 'boombap';
  if (/dnb|drum\s*&?\s*bass|jungle|liquid/i.test(text)) return 'dnb';
  if (/electro|synthwave|80s/i.test(text)) return 'electro';
  if (/trap|metro|808\s+beat/i.test(text)) return 'trap';
  return null;
}

// ---------------------------------------------------------------------------
// 3. Procedural Melodic Composer (Scale-Locked Basslines, Plucks & Chords)
// ---------------------------------------------------------------------------

export function composeMelodicLaneForPattern(
  pattern: DrumPattern,
  rootMidi: number,
  scale: MusicalScaleName,
  preset: MelodicSynthPreset,
  genre: GenreIntent = null
): DrumPattern {
  const next = clonePattern(pattern);
  const lane = createEmptyMelodicLane();
  const len = next.length;

  const isChordPreset = preset === 'pad' || preset === 'rhodes' || preset === 'organ';
  const bassRoot = rootMidi >= 48 ? rootMidi - 12 : rootMidi;

  if (genre === 'ukg' || preset === 'organ') {
    // Classic UKG syncopated chord stabs
    const prog = [0, 0, 5, 3];
    const stabSteps = [0, 3, 6, 10, 14];
    for (let bar = 0; bar < len / 16; bar++) {
      const deg = prog[bar % prog.length];
      for (const s of stabSteps) {
        const idx = bar * 16 + s;
        if (idx >= len) continue;
        lane[idx] = {
          active: true,
          notes: buildScaleChord(rootMidi, scale, deg, s === 10),
          velocity: s === 0 || s === 10 ? 0.88 : 0.72,
          lengthSteps: s === 6 || s === 14 ? 2 : 1,
        };
      }
    }
  } else if (isChordPreset) {
    // Lush 4-bar minor/dorian chord progression (i -> VI -> iv -> v/VII)
    const prog = [0, 5, 3, 4];
    const hitSteps = preset === 'rhodes' ? [0, 6, 10] : [0, 8];
    for (let bar = 0; bar < len / 16; bar++) {
      const deg = prog[bar % prog.length];
      for (const s of hitSteps) {
        const idx = bar * 16 + s;
        if (idx >= len) continue;
        lane[idx] = {
          active: true,
          notes: buildScaleChord(rootMidi, scale, deg, true),
          velocity: s === 0 ? 0.84 : 0.68,
          lengthSteps: preset === 'pad' ? 8 : 4,
        };
      }
    }
  } else if (preset === 'reese' || preset === 'acid') {
    // Driving bassline synchronized to kick steps
    const degrees = [0, 0, 2, 0, 5, 4, 3, 2];
    let degIdx = 0;
    for (let s = 0; s < len; s++) {
      const kickHit = next.steps[0][s]?.active;
      if (kickHit || s % 8 === 0 || (preset === 'acid' && s % 4 === 2)) {
        const deg = degrees[degIdx % degrees.length];
        degIdx++;
        lane[s] = {
          active: true,
          notes: [scaleDegreeToMidi(bassRoot, scale, deg)],
          velocity: kickHit ? 0.9 : 0.74,
          lengthSteps: preset === 'reese' ? 4 : 2,
        };
      }
    }
  } else {
    // Haunted Trap / Drill Pluck Arpeggio (dark half-step & fifth motif)
    const motif = [0, 2, 4, 5, 4, 2, 1, 0];
    const arpSteps = [0, 2, 4, 6, 8, 10, 12, 14];
    for (let bar = 0; bar < len / 16; bar++) {
      const transpose = bar % 2 === 1 ? -1 : 0;
      for (let i = 0; i < arpSteps.length; i++) {
        const idx = bar * 16 + arpSteps[i];
        if (idx >= len) continue;
        const note = scaleDegreeToMidi(rootMidi + 12, scale, motif[i] + transpose);
        lane[idx] = {
          active: true,
          notes: [note],
          velocity: i % 2 === 0 ? 0.84 : 0.62,
          lengthSteps: 2,
        };
      }
    }
  }

  next.melodicSteps = lane;
  return next;
}

// ---------------------------------------------------------------------------
// 4. Procedural Genre Drum Composer
// ---------------------------------------------------------------------------

function setHit(
  pat: DrumPattern,
  padId: number,
  step: number,
  vel = 0.88,
  opts?: { pitch?: number; ratchet?: 1 | 2 | 3 | 4; prob?: number; nudge?: number }
): void {
  if (step < 0 || step >= pat.length) return;
  pat.steps[padId][step] = {
    active: true,
    velocity: vel,
    pitch: opts?.pitch ?? 0,
    ratchet: opts?.ratchet ?? 1,
    probability: opts?.prob ?? 1,
    pan: 0,
    nudge: opts?.nudge ?? 0,
  };
}

function buildGenreGroove(project: DawProject, genre: NonNullable<GenreIntent>): DawProject {
  const kitMap: Record<NonNullable<GenreIntent>, string> = {
    drill: 'metro-808',
    trap: 'metro-808',
    phonk: 'metro-808',
    jersey: 'metro-808',
    ukg: 'ukg-909',
    house: 'ukg-909',
    boombap: 'mpc-boombap',
    dnb: 'dnb-jungle',
    amapiano: 'amapiano-log',
    electro: 'electro-synth',
  };

  const kit = FACTORY_KITS.find((k) => k.id === kitMap[genre]) ?? FACTORY_KITS[0];
  const next = createProjectFromKit(kit);
  // Preserve user's key/scale if already customized
  next.melodic = { ...next.melodic, rootMidi: project.melodic.rootMidi, scale: project.melodic.scale };

  const pat = createEmptyPattern('A', `${genre.toUpperCase()} AI`, 32);

  if (genre === 'drill') {
    next.bpm = 142;
    next.swing = 0.1;
    next.melodic.preset = 'pluck';
    next.melodic.scale = 'phrygian';
    // Signature UK Drill 3-3-2 snare placement (steps 8 & 14 in bar 1, 24 & 30 in bar 2)
    [0, 16, 22].forEach((s) => setHit(pat, 0, s, 0.98));
    [8, 14, 24, 30].forEach((s) => setHit(pat, 2, s, 0.94));
    [8, 24].forEach((s) => setHit(pat, 3, s, 0.78));
    // Sliding UK Drill 808 with octave jump glide feel!
    setHit(pat, 1, 0, 0.96, { pitch: 0 });
    setHit(pat, 1, 10, 0.9, { pitch: 0 });
    setHit(pat, 1, 13, 0.88, { pitch: 12 });
    setHit(pat, 1, 15, 0.84, { pitch: 7 });
    setHit(pat, 1, 16, 0.96, { pitch: 0 });
    setHit(pat, 1, 22, 0.9, { pitch: 1 });
    setHit(pat, 1, 27, 0.88, { pitch: 12 });
    setHit(pat, 1, 29, 0.86, { pitch: 8 });
    // Counter-syncopated UK Drill hi-hat bounce (3-3-2)
    [0, 3, 6, 8, 11, 14, 16, 19, 22, 24, 27, 30].forEach((s, i) =>
      setHit(pat, 4, s, i % 3 === 0 ? 0.86 : 0.64, { ratchet: s === 14 || s === 30 ? 3 : 1 })
    );
    [6, 22].forEach((s) => setHit(pat, 6, s, 0.72));
  } else if (genre === 'jersey') {
    next.bpm = 140;
    next.swing = 0.06;
    next.melodic.preset = 'pluck';
    // Iconic Jersey Club 5-kick bounce: 0, 4, 8, 11, 14
    for (let bar = 0; bar < 2; bar++) {
      const o = bar * 16;
      [0, 4, 8, 11, 14].forEach((s) => setHit(pat, 0, o + s, 0.96));
      [4, 12].forEach((s) => setHit(pat, 3, o + s, 0.88));
      [2, 6, 10, 14].forEach((s) => setHit(pat, 5, o + s, 0.62));
      [0, 8, 11].forEach((s, i) => setHit(pat, 1, o + s, 0.9, { pitch: i === 2 ? 3 : 0 }));
    }
  } else if (genre === 'phonk') {
    next.bpm = 136;
    next.swing = 0.08;
    next.melodic.preset = 'reese';
    next.pads[1].drive = 0.62; // Distorted Memphis 808
    for (let bar = 0; bar < 2; bar++) {
      const o = bar * 16;
      [0, 6, 10].forEach((s) => setHit(pat, 0, o + s, 0.98));
      [0, 6, 10, 14].forEach((s, i) => setHit(pat, 1, o + s, 0.95, { pitch: i === 3 ? 3 : 0 }));
      [4, 12].forEach((s) => setHit(pat, 2, o + s, 0.92));
      for (let s = 0; s < 16; s += 2) setHit(pat, 4, o + s, 0.72, { ratchet: s === 14 ? 3 : 1 });
      // Iconic Memphis 808 Cowbell melody on pad 11
      const cowNotes = [
        [0, 0], [3, 3], [6, 5], [8, 3], [11, 0], [14, -2],
      ];
      cowNotes.forEach(([s, p]) => setHit(pat, 11, o + s, 0.84, { pitch: p }));
    }
  } else if (genre === 'house') {
    next.bpm = 126;
    next.swing = 0.14;
    next.melodic.preset = 'organ';
    for (let bar = 0; bar < 2; bar++) {
      const o = bar * 16;
      [0, 4, 8, 12].forEach((s) => setHit(pat, 0, o + s, 0.98));
      [4, 12].forEach((s) => setHit(pat, 3, o + s, 0.88));
      [2, 6, 10, 14].forEach((s) => setHit(pat, 5, o + s, 0.78));
      [1, 3, 5, 7, 9, 11, 13, 15].forEach((s) => setHit(pat, 4, o + s, 0.56));
      [7, 15].forEach((s) => setHit(pat, 9, o + s, 0.72));
    }
  } else {
    // Use kit's flagship demo pattern as rich base, doubled to 32 steps if needed
    const base = clonePattern(kit.demoPattern, 'A', `${genre.toUpperCase()} AI`);
    next.patterns[0] = composeMelodicLaneForPattern(
      base,
      next.melodic.rootMidi,
      next.melodic.scale,
      next.melodic.preset,
      genre
    );
    return next;
  }

  next.patterns[0] = composeMelodicLaneForPattern(
    pat,
    next.melodic.rootMidi,
    next.melodic.scale,
    next.melodic.preset,
    genre
  );
  return next;
}

// ---------------------------------------------------------------------------
// 5. Auto-Mix & Master Engineer
// ---------------------------------------------------------------------------

function applyAutoMix(project: DawProject): { nextProject: DawProject; notes: string[] } {
  const pads = project.pads.map((pad) => {
    const p = { ...pad };
    if (p.engine === 'kick' || p.engine === '808') {
      p.pan = 0;
      p.reverbSend = 0;
      p.delaySend = 0;
      if (p.engine === '808') p.chokeGroup = 2;
    } else if (p.engine === 'hat') {
      p.chokeGroup = 1;
      p.pan = p.id % 2 === 0 ? -0.16 : 0.18;
      p.volume = Math.min(p.volume, 0.74);
    } else if (p.engine === 'snare' || p.engine === 'clap') {
      p.pan = p.engine === 'snare' ? -0.04 : 0.04;
      p.reverbSend = Math.max(p.reverbSend, 0.16);
    } else if (p.engine === 'perc' || p.engine === 'tom') {
      p.pan = p.id % 2 === 0 ? -0.26 : 0.26;
    }
    return p;
  });

  const master = {
    ...project.master,
    eqLow: 1.8,
    eqMid: -0.5,
    eqHigh: 1.4,
    compThreshold: -15,
    compRatio: 4.0,
    compMakeup: 3.0,
    limiterOn: true,
  };

  return {
    nextProject: { ...project, pads, master },
    notes: [
      'Mono-centered Kick & 808 with 0% reverb send',
      'Linked Hi-Hats to Choke A & 808s to Choke B',
      'Panned hats/perc symmetrically for stereo width',
      'Dialed Master 3-Band EQ, 4:1 Glue Comp & Limiter',
    ],
  };
}

// ---------------------------------------------------------------------------
// 6. Full 4-Section Song Arranger (Intro -> Drop -> Breakdown -> Outro)
// ---------------------------------------------------------------------------

function buildFourSectionSong(project: DawProject): DawProject {
  const main = clonePattern(
    project.patterns[project.activePatternIndex] ?? project.patterns[0],
    'B',
    'Main Drop'
  );

  // Pattern A: Intro (strip Kick & 808, keep hats/perc/melodic hook)
  const intro = clonePattern(main, 'A', 'Intro Build');
  for (let p = 0; p < 16; p++) {
    const eng = project.pads[p].engine;
    if (eng === 'kick' || eng === '808' || eng === 'snare') {
      for (let s = 0; s < intro.length; s++) intro.steps[p][s].active = false;
    }
  }
  // Add riser fill on final 4 steps of Intro
  for (let s = Math.max(0, intro.length - 4); s < intro.length; s++) {
    setHit(intro, 2, s, 0.55 + ((s - (intro.length - 4)) / 4) * 0.4, {
      ratchet: s === intro.length - 1 ? 2 : 1,
    });
  }

  // Pattern C: Breakdown + Fill
  const breakPat = clonePattern(main, 'C', 'Breakdown');
  for (let s = 0; s < breakPat.length; s++) {
    if (s >= breakPat.length - 4) {
      breakPat.steps[0][s].active = false;
      breakPat.steps[1][s].active = false;
      setHit(breakPat, 8, s, 0.78, { pitch: (s % 4) * 2 });
    }
  }

  // Pattern D: Switch-Up / Outro (humanized + spicy hat rolls)
  const outro = humanizePattern(clonePattern(main, 'D', 'Switch-Up'), 0.22);
  if (outro.length >= 16) {
    setHit(outro, 4, 14, 0.88, { ratchet: 4 });
  }

  const patterns = project.patterns.map((pat, idx) => {
    if (idx === 0) return intro;
    if (idx === 1) return main;
    if (idx === 2) return breakPat;
    if (idx === 3) return outro;
    return pat;
  });

  return {
    ...project,
    patterns,
    activePatternIndex: 1,
    playMode: 'song',
    songClips: [
      { id: 'ai-intro', patternId: 'A', bars: 2 },
      { id: 'ai-drop1', patternId: 'B', bars: 4 },
      { id: 'ai-break', patternId: 'C', bars: 2 },
      { id: 'ai-drop2', patternId: 'D', bars: 4 },
    ],
  };
}

// ---------------------------------------------------------------------------
// 7. Main AI Co-Producer Entry Point
// ---------------------------------------------------------------------------

export function runCoProducerPrompt(project: DawProject, rawPrompt: string): CoProducerResult {
  const prompt = rawPrompt.trim();
  const lower = prompt.toLowerCase();
  let next: DawProject = {
    ...project,
    pads: project.pads.map((p) => ({ ...p })),
    melodic: { ...project.melodic },
    master: { ...project.master },
    patterns: project.patterns.map((pat) => clonePattern(pat)),
  };

  const actionsApplied: string[] = [];
  const dirtyPadSet = new Set<number>();

  // 1. Genre Full Beat Composition
  const genre = detectGenre(lower);
  if (genre) {
    next = buildGenreGroove(next, genre);
    for (let i = 0; i < 16; i++) dirtyPadSet.add(i);
    actionsApplied.push(`Composed ${genre.toUpperCase()} beat (${next.bpm} BPM)`);
  }

  // 2. Explicit BPM override
  const explicitBpm = extractBpm(lower);
  if (explicitBpm !== null) {
    next.bpm = explicitBpm;
    actionsApplied.push(`Set tempo to ${explicitBpm} BPM`);
  }

  // 3. Musical Key & Scale + Synth Preset override
  const { rootMidi, scale } = extractKeyAndScale(lower);
  const presetHint = extractPresetHint(lower);
  let melodicChanged = false;
  if (rootMidi !== undefined) {
    next.melodic.rootMidi = rootMidi;
    melodicChanged = true;
  }
  if (scale !== undefined) {
    next.melodic.scale = scale;
    melodicChanged = true;
  }
  if (presetHint !== null) {
    next.melodic.preset = presetHint;
    melodicChanged = true;
  }

  if (
    melodicChanged ||
    /melod|chord|synth|bassline|hook|arp|pluck|organ|rhodes|reese|pad/i.test(lower)
  ) {
    const idx = next.activePatternIndex;
    next.patterns[idx] = composeMelodicLaneForPattern(
      next.patterns[idx],
      next.melodic.rootMidi,
      next.melodic.scale,
      next.melodic.preset,
      genre
    );
    const keyName = `${midiToNoteName(next.melodic.rootMidi).replace(/\d+$/, '')} ${next.melodic.scale}`;
    actionsApplied.push(`Composed ${next.melodic.preset.toUpperCase()} hook in ${keyName}`);
  }

  // 4. Spicy Hi-Hat Rolls & Ghost Perc
  if (/hat|roll|ratchet|spic|ghost|perc/i.test(lower)) {
    const pat = clonePattern(next.patterns[next.activePatternIndex]);
    const rollSteps = [6, 12, 14, 22, 28, 30].filter((s) => s < pat.length);
    rollSteps.forEach((s, i) => {
      setHit(pat, 4, s, 0.84, { ratchet: (i % 2 === 0 ? 3 : 4) as 3 | 4 });
    });
    if (pat.length >= 16) {
      setHit(pat, 6, 7, 0.64, { prob: 0.85 });
      setHit(pat, 6, 15, 0.7, { prob: 0.9 });
    }
    next.patterns[next.activePatternIndex] = pat;
    actionsApplied.push('Injected 3×/4× hi-hat ratchets & ghost percussion');
  }

  // 5. Sound Design Sculpting
  if (/hard|punch|slap|aggress|heavy|knock|distort/i.test(lower)) {
    next.pads[0].punch = Math.min(1, next.pads[0].punch + 0.18);
    next.pads[0].drive = Math.min(1, next.pads[0].drive + 0.2);
    next.pads[1].drive = Math.min(1, next.pads[1].drive + 0.25);
    next.pads[1].tone = Math.min(1, next.pads[1].tone + 0.16);
    next.master.compThreshold = -18;
    next.master.compRatio = 4.5;
    next.master.eqLow = 2.5;
    dirtyPadSet.add(0);
    dirtyPadSet.add(1);
    actionsApplied.push('Boosted Kick/808 punch, analog drive & bus glue');
  }

  if (/dusty|lo-?fi|vintage|tape|warm|crunch/i.test(lower)) {
    next.swing = Math.max(next.swing, 0.28);
    next.pads = next.pads.map((p) => {
      dirtyPadSet.add(p.id);
      return {
        ...p,
        filterCutoff: Math.min(p.filterCutoff, 0.76),
        drive: Math.min(1, p.drive + 0.18),
        crush: Math.min(0.32, p.crush + 0.14),
      };
    });
    next.patterns[next.activePatternIndex] = humanizePattern(next.patterns[next.activePatternIndex], 0.28);
    actionsApplied.push('Applied vintage tape saturation, lo-fi crush & swung pocket');
  }

  if (/dark|underwater|moody|space|reverb|dream/i.test(lower)) {
    next.pads = next.pads.map((p) => {
      if (p.engine === 'kick' || p.engine === '808') return p;
      dirtyPadSet.add(p.id);
      return {
        ...p,
        filterCutoff: Math.min(p.filterCutoff, 0.64),
        reverbSend: Math.min(0.65, p.reverbSend + 0.18),
      };
    });
    next.melodic.cutoff = Math.min(next.melodic.cutoff, 0.54);
    next.melodic.reverbSend = Math.min(0.75, next.melodic.reverbSend + 0.22);
    next.master.reverbDecay = 2.6;
    actionsApplied.push('Darkened filters & expanded lush atmospheric reverb space');
  }

  if (/humaniz|bounce|swing|groove|pocket/i.test(lower)) {
    next.swing = Math.min(0.42, Math.max(0.16, next.swing + 0.08));
    next.patterns[next.activePatternIndex] = humanizePattern(next.patterns[next.activePatternIndex], 0.25);
    actionsApplied.push(`Humanized velocities & micro-timing (${Math.round(next.swing * 100)}% swing)`);
  }

  // 6. Auto-Mix & Master
  if (/mix|master|clean|balance|headroom|club/i.test(lower)) {
    const mixed = applyAutoMix(next);
    next = mixed.nextProject;
    actionsApplied.push(...mixed.notes);
  }

  // 7. Full 4-Section Song Arrangement
  if (/arrang|full\s*song|structure|drop|breakdown|intro|outro|4\s*bar/i.test(lower)) {
    next = buildFourSectionSong(next);
    actionsApplied.push('Built 12-bar 4-section song (Intro → Drop → Breakdown → Switch-Up)');
  }

  // Fallback: intelligent creative enhancement if prompt was general ("make it better", "surprise me", etc.)
  if (actionsApplied.length === 0) {
    const idx = next.activePatternIndex;
    next.patterns[idx] = humanizePattern(
      composeMelodicLaneForPattern(
        next.patterns[idx],
        next.melodic.rootMidi,
        next.melodic.scale,
        next.melodic.preset
      ),
      0.22
    );
    const mixed = applyAutoMix(next);
    next = mixed.nextProject;
    actionsApplied.push(
      `Added ${next.melodic.preset.toUpperCase()} melodic layer`,
      'Humanized drum pocket & dynamics',
      'Applied studio Auto-Mix & Bus Glue'
    );
  }

  const summary = `Done — applied ${actionsApplied.length} studio move${actionsApplied.length === 1 ? '' : 's'} to "${next.name}". Press Play to audition, or tap Undo to A/B compare.`;

  return {
    nextProject: next,
    summary,
    actionsApplied,
    dirtyPadIds: Array.from(dirtyPadSet),
  };
}
