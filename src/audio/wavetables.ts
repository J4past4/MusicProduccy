/**
 * Deterministic generator for all 32 Subtractor-inspired single-cycle waveforms.
 * Each table has TABLE_SIZE samples, zero DC offset, and peak normalized to [-1, 1].
 */

export const TABLE_SIZE = 2048;
export const NUM_WAVEFORMS = 32;

const TWO_PI = Math.PI * 2;

function normalizeAndRemoveDC(table: Float32Array): Float32Array {
  let mean = 0;
  for (let i = 0; i < table.length; i++) mean += table[i];
  mean /= table.length;

  let peak = 0;
  for (let i = 0; i < table.length; i++) {
    table[i] -= mean;
    const a = Math.abs(table[i]);
    if (a > peak) peak = a;
  }
  if (peak > 1e-6) {
    const inv = 1 / peak;
    for (let i = 0; i < table.length; i++) table[i] *= inv;
  }
  return table;
}

function buildAdditive(harmonics: Array<[number, number, number?]>): Float32Array {
  const table = new Float32Array(TABLE_SIZE);
  for (let i = 0; i < TABLE_SIZE; i++) {
    const phase = (i / TABLE_SIZE) * TWO_PI;
    let sum = 0;
    for (let h = 0; h < harmonics.length; h++) {
      const [n, amp, phi = 0] = harmonics[h];
      sum += amp * Math.sin(n * phase + phi);
    }
    table[i] = sum;
  }
  return normalizeAndRemoveDC(table);
}

function buildSaw(maxHarmonics: number, rolloff = 1): Float32Array {
  const harmonics: Array<[number, number, number?]> = [];
  for (let n = 1; n <= maxHarmonics; n++) {
    // Gibbs-smoothed sawtooth
    const sigma = Math.sin((Math.PI * n) / (maxHarmonics + 1)) / ((Math.PI * n) / (maxHarmonics + 1));
    harmonics.push([n, (sigma / Math.pow(n, rolloff)) * (n % 2 === 0 ? -1 : 1)]);
  }
  return buildAdditive(harmonics);
}

function buildSquare(maxHarmonics: number): Float32Array {
  const harmonics: Array<[number, number, number?]> = [];
  for (let n = 1; n <= maxHarmonics; n += 2) {
    const sigma = Math.sin((Math.PI * n) / (maxHarmonics + 1)) / ((Math.PI * n) / (maxHarmonics + 1));
    harmonics.push([n, sigma / n]);
  }
  return buildAdditive(harmonics);
}

function buildTriangle(): Float32Array {
  const harmonics: Array<[number, number, number?]> = [];
  for (let k = 0; k < 16; k++) {
    const n = 2 * k + 1;
    harmonics.push([n, (k % 2 === 0 ? 1 : -1) / (n * n)]);
  }
  return buildAdditive(harmonics);
}

function buildSine(): Float32Array {
  return buildAdditive([[1, 1]]);
}

function buildPulse(duty: number, maxHarmonics = 36): Float32Array {
  const harmonics: Array<[number, number, number?]> = [];
  for (let n = 1; n <= maxHarmonics; n++) {
    const amp = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    const sigma = Math.sin((Math.PI * n) / (maxHarmonics + 1)) / ((Math.PI * n) / (maxHarmonics + 1));
    harmonics.push([n, amp * sigma, Math.PI / 2]);
  }
  return buildAdditive(harmonics);
}

function buildFormant(
  fundamentalAmp: number,
  formants: Array<{ center: number; width: number; gain: number }>,
  maxH = 40
): Float32Array {
  const harmonics: Array<[number, number, number?]> = [];
  for (let n = 1; n <= maxH; n++) {
    let amp = n === 1 ? fundamentalAmp : 0.08 / n;
    for (const f of formants) {
      const d = (n - f.center) / f.width;
      amp += f.gain * Math.exp(-0.5 * d * d);
    }
    harmonics.push([n, amp, (n * 0.37) % TWO_PI]);
  }
  return buildAdditive(harmonics);
}

function buildMetallic(seed: number, density: number): Float32Array {
  const harmonics: Array<[number, number, number?]> = [];
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
  harmonics.push([1, 0.7, 0]);
  for (let n = 2; n <= 48; n++) {
    if (rand() < density) {
      const amp = (0.15 + rand() * 0.85) / Math.pow(n, 0.45);
      harmonics.push([n, amp, rand() * TWO_PI]);
    }
  }
  return buildAdditive(harmonics);
}

let cachedWavetables: Float32Array[] | null = null;

export function getWavetables(): Float32Array[] {
  if (cachedWavetables) return cachedWavetables;

  const tables: Float32Array[] = [
    // 1. Sawtooth
    buildSaw(48, 1.0),
    // 2. Square
    buildSquare(48),
    // 3. Triangle
    buildTriangle(),
    // 4. Sine
    buildSine(),
    // 5. Soft Saw (Subtractor W5)
    buildSaw(24, 1.25),
    // 6. Acoustic Piano (rich harmonic rolloff + 2nd/3rd presence)
    buildAdditive([
      [1, 1.0],
      [2, 0.62, 0.2],
      [3, 0.44, 0.5],
      [4, 0.28, 1.1],
      [5, 0.22, 0.4],
      [6, 0.16, 2.0],
      [7, 0.09],
      [8, 0.11],
      [10, 0.07],
      [12, 0.05],
    ]),
    // 7. Glassy E-Piano (bell tine harmonics)
    buildAdditive([
      [1, 1.0],
      [2, 0.18],
      [3, 0.12],
      [7, 0.26, 0.4],
      [9, 0.19, 1.2],
      [14, 0.11, 2.1],
    ]),
    // 8. Clavinet / Harpsichord (spiky narrow pulse + bright odd/even)
    buildPulse(0.16, 36),
    // 9. Electric Bass (strong fundamental + warm 2nd/3rd/5th)
    buildAdditive([
      [1, 1.0],
      [2, 0.72, 0.3],
      [3, 0.42, 0.8],
      [4, 0.18],
      [5, 0.24, 1.4],
      [6, 0.1],
      [7, 0.09],
      [9, 0.06],
    ]),
    // 10. Deep Sub (fat fundamental + subtle warm 2nd & 3rd)
    buildAdditive([
      [1, 1.0],
      [2, 0.28, 0.1],
      [3, 0.12, 0.4],
      [4, 0.05],
    ]),
    // 11. UK M1 Organ (Classic UK Bassline organ! Drawbar 16'+8'+4'+2 2/3' = 1, 2, 3, 4, 6)
    buildAdditive([
      [1, 1.0],
      [2, 0.85, 0.0],
      [3, 0.65, 0.15],
      [4, 0.48, 0.0],
      [6, 0.28, 0.3],
      [8, 0.18, 0.0],
    ]),
    // 12. Metallic Edge
    buildMetallic(1201, 0.42),
    // 13. Hollow Pulse (25% pulse)
    buildPulse(0.25, 40),
    // 14. Nasal Reed (clarion formant peak)
    buildFormant(0.6, [{ center: 5, width: 2.2, gain: 0.9 }], 32),
    // 15. Warm String
    buildFormant(
      0.9,
      [
        { center: 3, width: 2.5, gain: 0.55 },
        { center: 9, width: 3.5, gain: 0.25 },
      ],
      32
    ),
    // 16. Bright String
    buildFormant(
      0.8,
      [
        { center: 4, width: 3.0, gain: 0.6 },
        { center: 13, width: 4.5, gain: 0.42 },
      ],
      40
    ),
    // 17. Ensemble String (phase-dispersed saw)
    buildAdditive(
      Array.from({ length: 28 }, (_, idx) => {
        const n = idx + 1;
        return [n, 1 / Math.pow(n, 0.9), (n * n * 0.41) % TWO_PI] as [number, number, number];
      })
    ),
    // 18. Steel Guitar
    buildFormant(
      0.7,
      [
        { center: 2, width: 1.8, gain: 0.5 },
        { center: 7, width: 2.8, gain: 0.55 },
        { center: 16, width: 4.0, gain: 0.35 },
      ],
      36
    ),
    // 19. Synth Brass
    buildFormant(
      0.85,
      [
        { center: 3, width: 2.0, gain: 0.78 },
        { center: 8, width: 3.0, gain: 0.45 },
      ],
      36
    ),
    // 20. Muted Brass
    buildFormant(
      0.45,
      [
        { center: 6, width: 2.0, gain: 0.95 },
        { center: 11, width: 2.5, gain: 0.45 },
      ],
      30
    ),
    // 21. Saxophone (odd-leaning nasal formant)
    buildAdditive([
      [1, 0.9],
      [2, 0.35],
      [3, 0.85, 0.5],
      [4, 0.3],
      [5, 0.72, 1.0],
      [7, 0.48, 0.3],
      [9, 0.32],
      [11, 0.18],
    ]),
    // 22. Trumpet
    buildFormant(
      0.7,
      [
        { center: 4, width: 2.2, gain: 0.85 },
        { center: 10, width: 3.0, gain: 0.6 },
        { center: 18, width: 3.5, gain: 0.25 },
      ],
      36
    ),
    // 23. Marimba (fundamental + 4th harmonic wood resonance)
    buildAdditive([
      [1, 1.0],
      [4, 0.45, 0.2],
      [10, 0.14, 0.8],
    ]),
    // 24. Wood Mallet
    buildAdditive([
      [1, 1.0],
      [3, 0.38, 0.4],
      [6, 0.24, 1.2],
      [11, 0.15, 0.5],
    ]),
    // 25. Pluck Guitar
    buildAdditive([
      [1, 1.0],
      [2, 0.78, 0.1],
      [3, 0.52, 0.4],
      [4, 0.34, 0.9],
      [5, 0.26, 1.3],
      [7, 0.18, 0.7],
      [9, 0.12],
      [12, 0.08],
    ]),
    // 26. Harp Pluck
    buildAdditive([
      [1, 1.0],
      [2, 0.58],
      [3, 0.32],
      [4, 0.18],
      [5, 0.11],
      [6, 0.06],
    ]),
    // 27. Vibraphone
    buildAdditive([
      [1, 1.0],
      [4, 0.32, 0.6],
      [9, 0.24, 1.5],
      [16, 0.14, 2.2],
    ]),
    // 28. Bright Mallet
    buildAdditive([
      [1, 0.95],
      [2, 0.3],
      [5, 0.42, 0.7],
      [8, 0.28, 1.4],
      [13, 0.22, 0.3],
      [19, 0.14, 2.0],
    ]),
    // 29. Metallic Bell (classic FM-like inharmonic cluster)
    buildAdditive([
      [1, 0.85],
      [2, 0.25],
      [5, 0.55, 0.5],
      [7, 0.48, 1.8],
      [11, 0.42, 0.9],
      [14, 0.35, 2.4],
      [19, 0.28, 1.1],
      [23, 0.2, 0.4],
    ]),
    // 30. FM Grit I (dense metallic harmonic cloud for dirty FM bass!)
    buildMetallic(3003, 0.58),
    // 31. FM Grit II (spiky formant-rich digital edge)
    buildMetallic(3109, 0.72),
    // 32. Alien Noise-Tone (ultra-dense pseudo-noise single-cycle for UK bassline FM grit)
    buildMetallic(3299, 0.92),
  ];

  cachedWavetables = tables;
  return tables;
}

export function sampleWavetable(table: Float32Array, phase01: number): number {
  const wrapped = phase01 - Math.floor(phase01);
  const idx = wrapped * TABLE_SIZE;
  const i0 = idx | 0;
  const i1 = (i0 + 1) & (TABLE_SIZE - 1);
  const frac = idx - i0;
  return table[i0] + (table[i1] - table[i0]) * frac;
}
