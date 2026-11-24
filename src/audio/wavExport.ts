/**
 * Offline 44.1 kHz 16-bit Stereo PCM WAV Renderer.
 * Uses the exact SubtraktorDspEngine so exported loops & one-shots match live audio 1:1.
 */

import { SubtraktorDspEngine } from './dspCore';
import type { SequencerStep, SubtractorPatch } from './types';

export function encodeWav16Stereo(
  left: Float32Array,
  right: Float32Array,
  sampleRate: number
): ArrayBuffer {
  const numFrames = left.length;
  const numChannels = 2;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // 16-bit
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    view.setInt16(offset + 2, r < 0 ? r * 0x8000 : r * 0x7fff, true);
    offset += 4;
  }

  return buffer;
}

export function renderPatternToWav(
  patch: SubtractorPatch,
  steps: SequencerStep[],
  bpm: number,
  swing: number,
  bars = 2,
  sampleRate = 44100
): ArrayBuffer {
  const engine = new SubtraktorDspEngine(sampleRate, patch);
  engine.setBpm(bpm);
  engine.resetLfo1();

  const secPerSixteenth = 60 / bpm / 4;
  const totalSteps = bars * 16;
  const totalSamples = Math.ceil(totalSteps * secPerSixteenth * sampleRate);

  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  // Schedule step start/end sample positions
  interface Event {
    sample: number;
    type: 'noteOn' | 'noteOff' | 'sidechain';
    note?: number;
    velocity?: number;
  }

  const events: Event[] = [];
  for (let s = 0; s < totalSteps; s++) {
    const stepIdx = s % 16;
    const step = steps[stepIdx];
    const swingOffset = stepIdx % 2 === 1 ? swing * secPerSixteenth : 0;
    const startSample = Math.floor((s * secPerSixteenth + swingOffset) * sampleRate);

    if (stepIdx % 4 === 0 && patch.fxSidechainAmount > 0.01) {
      events.push({ sample: startSample, type: 'sidechain' });
    }

    if (step && step.active) {
      const vel = Math.min(1, step.velocity * (step.accent ? 1.25 : 1));
      events.push({ sample: startSample, type: 'noteOn', note: step.note, velocity: vel });
      const gateLen = step.slide ? secPerSixteenth * 1.08 : secPerSixteenth * 0.78;
      const endSample = Math.min(totalSamples - 1, Math.floor(startSample + gateLen * sampleRate));
      events.push({ sample: endSample, type: 'noteOff', note: step.note });
    }
  }

  events.sort((a, b) => a.sample - b.sample);

  const blockSize = 128;
  const tmpL = new Float32Array(blockSize);
  const tmpR = new Float32Array(blockSize);
  let evIdx = 0;

  for (let pos = 0; pos < totalSamples; pos += blockSize) {
    const len = Math.min(blockSize, totalSamples - pos);
    while (evIdx < events.length && events[evIdx].sample < pos + len) {
      const ev = events[evIdx++];
      if (ev.type === 'sidechain') {
        engine.triggerSidechain();
      } else if (ev.type === 'noteOn' && ev.note !== undefined) {
        engine.noteOn(ev.note, ev.velocity ?? 0.85);
      } else if (ev.type === 'noteOff' && ev.note !== undefined) {
        engine.noteOff(ev.note);
      }
    }

    const sliceL = len === blockSize ? tmpL : tmpL.subarray(0, len);
    const sliceR = len === blockSize ? tmpR : tmpR.subarray(0, len);
    engine.processBlock(sliceL, sliceR);
    left.set(sliceL, pos);
    right.set(sliceR, pos);
  }

  return encodeWav16Stereo(left, right, sampleRate);
}

export function renderOneShotToWav(
  patch: SubtractorPatch,
  midiNote = 36,
  durationSec = 1.6,
  bpm = 140,
  sampleRate = 44100
): ArrayBuffer {
  const engine = new SubtraktorDspEngine(sampleRate, patch);
  engine.setBpm(bpm);
  engine.resetLfo1();

  const totalSamples = Math.ceil(durationSec * sampleRate);
  const releaseSample = Math.floor(durationSec * 0.72 * sampleRate);
  const left = new Float32Array(totalSamples);
  const right = new Float32Array(totalSamples);

  engine.noteOn(midiNote, 0.95);
  let released = false;

  const blockSize = 128;
  const tmpL = new Float32Array(blockSize);
  const tmpR = new Float32Array(blockSize);

  for (let pos = 0; pos < totalSamples; pos += blockSize) {
    const len = Math.min(blockSize, totalSamples - pos);
    if (!released && pos >= releaseSample) {
      engine.noteOff(midiNote);
      released = true;
    }
    const sliceL = len === blockSize ? tmpL : tmpL.subarray(0, len);
    const sliceR = len === blockSize ? tmpR : tmpR.subarray(0, len);
    engine.processBlock(sliceL, sliceR);
    left.set(sliceL, pos);
    right.set(sliceR, pos);
  }

  return encodeWav16Stereo(left, right, sampleRate);
}

export function downloadWav(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
