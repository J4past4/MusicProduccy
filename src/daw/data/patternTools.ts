/**
 * Musical Pattern Utilities: Euclidean Rhythm Generator (Bjorklund algorithm),
 * Humanizer, Pattern Doubler, Shifter, and Deep Cloning helpers.
 */

import {
  createEmptyMelodicLane,
  createEmptyStep,
  type DrumPattern,
  type StepCell,
} from '../types';

/**
 * Generates a Euclidean rhythm distribution of `pulses` across `steps`
 * with optional `rotation` offset.
 */
export function generateEuclidean(steps: number, pulses: number, rotation = 0): boolean[] {
  const n = Math.max(1, Math.min(64, Math.floor(steps)));
  const k = Math.max(0, Math.min(n, Math.floor(pulses)));
  const result = new Array<boolean>(n).fill(false);
  if (k === 0) return result;
  if (k === n) return result.fill(true);

  for (let i = 0; i < n; i++) {
    // Bresenham / Euclidean pulse distribution
    if (Math.floor((i * k) / n) !== Math.floor(((i - 1) * k) / n)) {
      const idx = (i + ((rotation % n) + n)) % n;
      result[idx] = true;
    }
  }
  return result;
}

export function clonePattern(pattern: DrumPattern, newId?: string, newName?: string): DrumPattern {
  const melodicSrc = pattern.melodicSteps ?? createEmptyMelodicLane();
  return {
    id: newId ?? pattern.id,
    name: newName ?? pattern.name,
    length: pattern.length,
    steps: pattern.steps.map((row) => row.map((cell) => ({ ...cell }))),
    melodicSteps: melodicSrc.map((m) => ({ ...m, notes: [...m.notes] })),
  };
}

export function applyEuclideanToPad(
  pattern: DrumPattern,
  padId: number,
  pulses: number,
  rotation = 0
): DrumPattern {
  const next = clonePattern(pattern);
  const hits = generateEuclidean(next.length, pulses, rotation);
  for (let s = 0; s < next.length; s++) {
    const active = hits[s];
    next.steps[padId][s] = {
      ...next.steps[padId][s],
      active,
      velocity: active ? (s % 4 === 0 ? 0.94 : 0.76) : next.steps[padId][s].velocity,
    };
  }
  return next;
}

export function humanizePattern(pattern: DrumPattern, amount = 0.22): DrumPattern {
  const next = clonePattern(pattern);
  for (let p = 0; p < 16; p++) {
    for (let s = 0; s < next.length; s++) {
      const cell = next.steps[p][s];
      if (!cell.active) continue;
      const velJitter = (Math.random() * 2 - 1) * amount * 0.35;
      const nudgeJitter = (Math.random() * 2 - 1) * amount * 0.25;
      cell.velocity = Math.max(0.25, Math.min(1, Number((cell.velocity + velJitter).toFixed(2))));
      cell.nudge = Math.max(-0.35, Math.min(0.35, Number((cell.nudge + nudgeJitter).toFixed(2))));
    }
  }
  return next;
}

export function doublePatternLength(pattern: DrumPattern): DrumPattern {
  const next = clonePattern(pattern);
  if (next.length >= 64) return next;
  const oldLen = next.length;
  const newLen = (oldLen * 2) as 32 | 64;
  next.length = newLen;
  for (let p = 0; p < 16; p++) {
    for (let s = 0; s < oldLen; s++) {
      next.steps[p][s + oldLen] = { ...next.steps[p][s] };
    }
  }
  if (next.melodicSteps) {
    for (let s = 0; s < oldLen; s++) {
      const m = next.melodicSteps[s];
      next.melodicSteps[s + oldLen] = { ...m, notes: [...m.notes] };
    }
  }
  return next;
}

export function shiftPadSteps(pattern: DrumPattern, padId: number, delta: -1 | 1): DrumPattern {
  const next = clonePattern(pattern);
  const len = next.length;
  const row = next.steps[padId];
  const shifted: StepCell[] = row.map((c) => ({ ...c }));
  for (let s = 0; s < len; s++) {
    const src = (s - delta + len) % len;
    shifted[s] = { ...row[src] };
  }
  next.steps[padId] = shifted;
  return next;
}

export function clearPattern(pattern: DrumPattern, padId?: number): DrumPattern {
  const next = clonePattern(pattern);
  if (typeof padId === 'number') {
    next.steps[padId] = Array.from({ length: 64 }, () => createEmptyStep());
  } else {
    next.steps = Array.from({ length: 16 }, () =>
      Array.from({ length: 64 }, () => createEmptyStep())
    );
    next.melodicSteps = createEmptyMelodicLane();
  }
  return next;
}
