/**
 * Offline 44.1 kHz 16-bit Stereo WAV & Multi-Stem Renderer for PRODUCCY Mobile DAW.
 * Renders Drums (16 pads) + Melodic Synth Track + Choke Groups + Stereo Delay + Master Limiter.
 * Pure Float32Array offline mixdown — works identically in Browser & Node/Vitest.
 */

import { encodeWav16Stereo } from '../../audio/wavExport';
import { applyPadProcessing, pitchRatio, synthesizeDrumHit } from './drumDspCore';
import { synthesizeMelodicEvent } from './melodicDspCore';
import type { DawProject, DrumPattern, StemExportTarget } from '../types';

interface RenderEvent {
  sample: number;
  padId: number;
  velocity: number;
  pitchOffset: number;
  panOffset: number;
  chokeGroup: number;
}

interface MelodicRenderEvent {
  sample: number;
  notes: number[];
  velocity: number;
  gateSec: number;
}

function resampleLinear(src: Float32Array, rate: number): Float32Array {
  if (Math.abs(rate - 1) < 0.001) return src;
  const outLen = Math.max(64, Math.floor(src.length / rate));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * rate;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = idx < src.length ? src[idx] : 0;
    const s1 = idx + 1 < src.length ? src[idx + 1] : 0;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}

function padMatchesStem(padEngine: string, stem: StemExportTarget): boolean {
  if (stem === 'master') return true;
  if (stem === 'synth') return false;
  const isLow = padEngine === 'kick' || padEngine === '808' || padEngine === 'logdrum';
  return stem === 'drums-low' ? isLow : !isLow;
}

/**
 * Renders either the active pattern or full Song Arrangement into a 44.1 kHz 16-bit Stereo WAV.
 * Supports full master mixdown or isolated pro stems ('drums-low', 'drums-top', 'synth').
 */
export function renderDawProjectToWav(
  project: DawProject,
  mode: 'pattern' | 'song',
  customSamples: (Float32Array | null)[] = [],
  sampleRate = 44100,
  stem: StemExportTarget = 'master'
): ArrayBuffer {
  const secPerStep = 60 / Math.max(40, project.bpm) / 4;
  const anySolo = project.pads.some((p) => p.solo) || Boolean(project.melodic?.solo);

  // Build ordered sequence of (pattern, totalStepsToPlay)
  const segments: { pattern: DrumPattern; stepsCount: number }[] = [];
  if (mode === 'song' && project.songClips.length > 0) {
    for (const clip of project.songClips) {
      const pat = project.patterns.find((p) => p.id === clip.patternId) ?? project.patterns[0];
      if (pat) {
        segments.push({ pattern: pat, stepsCount: Math.max(1, clip.bars) * 16 });
      }
    }
  } else {
    const pat = project.patterns[project.activePatternIndex] ?? project.patterns[0];
    if (pat) {
      segments.push({ pattern: pat, stepsCount: pat.length });
    }
  }

  const totalSteps = segments.reduce((acc, s) => acc + s.stepsCount, 0);
  const tailSamples = Math.floor(sampleRate * 1.25);
  const totalSamples = Math.max(sampleRate, Math.ceil(totalSteps * secPerStep * sampleRate) + tailSamples);

  const events: RenderEvent[] = [];
  const melodicEvents: MelodicRenderEvent[] = [];
  const melodicAudible =
    (stem === 'master' || stem === 'synth') &&
    Boolean(project.melodic) &&
    (anySolo ? project.melodic.solo && !project.melodic.mute : !project.melodic.mute);

  let globalStep = 0;

  for (const seg of segments) {
    for (let s = 0; s < seg.stepsCount; s++) {
      const stepIdx = s % seg.pattern.length;
      const swingOffset = stepIdx % 2 === 1 ? project.swing * secPerStep * 0.55 : 0;
      const baseTime = globalStep * secPerStep + swingOffset;

      if (stem !== 'synth') {
        for (let padId = 0; padId < 16; padId++) {
          const pad = project.pads[padId];
          if (!pad || !padMatchesStem(pad.engine, stem)) continue;
          const audible = anySolo ? pad.solo && !pad.mute : !pad.mute;
          if (!audible) continue;

          const cell = seg.pattern.steps[padId]?.[stepIdx];
          if (!cell || !cell.active) continue;

          const ratchet = cell.ratchet || 1;
          for (let r = 0; r < ratchet; r++) {
            const hitTime = Math.max(0, baseTime + cell.nudge * secPerStep + (r * secPerStep) / ratchet);
            const rVel = ratchet > 1 ? cell.velocity * (0.78 + 0.22 * (r / (ratchet - 1))) : cell.velocity;
            events.push({
              sample: Math.floor(hitTime * sampleRate),
              padId,
              velocity: rVel,
              pitchOffset: cell.pitch,
              panOffset: cell.pan,
              chokeGroup: pad.chokeGroup,
            });
          }
        }
      }

      if (melodicAudible) {
        const mStep = seg.pattern.melodicSteps?.[stepIdx];
        if (mStep && mStep.active && mStep.notes.length > 0) {
          melodicEvents.push({
            sample: Math.floor(baseTime * sampleRate),
            notes: mStep.notes,
            velocity: mStep.velocity,
            gateSec: Math.max(0.06, (mStep.lengthSteps || 2) * secPerStep * 0.92),
          });
        }
      }

      globalStep += 1;
    }
  }

  events.sort((a, b) => a.sample - b.sample);

  const baseBuffers: Float32Array[] = project.pads.map((pad, idx) => {
    const custom = customSamples[idx];
    if (pad.engine === 'sample' && custom) {
      return applyPadProcessing(custom, pad, sampleRate, true);
    }
    return synthesizeDrumHit(pad, sampleRate, 1.0, 0);
  });

  const chokeEndSample = new Int32Array(events.length).fill(totalSamples);
  for (let i = 0; i < events.length; i++) {
    const cg = events[i].chokeGroup;
    if (cg === 0) continue;
    for (let j = i + 1; j < events.length; j++) {
      if (events[j].chokeGroup === cg && events[j].sample > events[i].sample) {
        chokeEndSample[i] = events[j].sample;
        break;
      }
    }
  }

  const dryL = new Float32Array(totalSamples);
  const dryR = new Float32Array(totalSamples);
  const delSendL = new Float32Array(totalSamples);
  const delSendR = new Float32Array(totalSamples);

  // Mix Drum Events
  for (let idx = 0; idx < events.length; idx++) {
    const ev = events[idx];
    const pad = project.pads[ev.padId];
    let buf = baseBuffers[ev.padId];
    let rate = pitchRatio(ev.pitchOffset, 0);
    if (pad.engine === 'sample') {
      rate *= pitchRatio(pad.pitch, pad.fine);
    }
    if (Math.abs(rate - 1) > 0.001) {
      buf = resampleLinear(buf, rate);
    }

    const pan = Math.max(-1, Math.min(1, pad.pan + ev.panOffset));
    const gainL = Math.cos(((pan + 1) * Math.PI) / 4) * pad.volume * ev.velocity;
    const gainR = Math.sin(((pan + 1) * Math.PI) / 4) * pad.volume * ev.velocity;
    const sendAmt = pad.delaySend * 0.45 + pad.reverbSend * 0.25;

    const maxEnd = Math.min(totalSamples, chokeEndSample[idx], ev.sample + buf.length);
    const fadeSamples = Math.min(240, maxEnd - ev.sample);

    for (let pos = ev.sample; pos < maxEnd; pos++) {
      let s = buf[pos - ev.sample];
      if (chokeEndSample[idx] < ev.sample + buf.length) {
        const rem = maxEnd - pos;
        if (rem < fadeSamples) {
          s *= rem / fadeSamples;
        }
      }
      dryL[pos] += s * gainL;
      dryR[pos] += s * gainR;
      if (sendAmt > 0.01) {
        delSendL[pos] += s * gainL * sendAmt;
        delSendR[pos] += s * gainR * sendAmt;
      }
    }
  }

  // Mix Melodic Synth Events
  if (melodicEvents.length > 0 && project.melodic) {
    const mCfg = project.melodic;
    const pan = Math.max(-1, Math.min(1, mCfg.pan));
    const gainL = Math.cos(((pan + 1) * Math.PI) / 4) * mCfg.volume;
    const gainR = Math.sin(((pan + 1) * Math.PI) / 4) * mCfg.volume;
    const sendAmt = mCfg.delaySend * 0.45 + mCfg.reverbSend * 0.3;

    for (const ev of melodicEvents) {
      const buf = synthesizeMelodicEvent(ev.notes, ev.gateSec, ev.velocity, mCfg, sampleRate);
      const maxEnd = Math.min(totalSamples, ev.sample + buf.length);
      for (let pos = ev.sample; pos < maxEnd; pos++) {
        const s = buf[pos - ev.sample];
        dryL[pos] += s * gainL;
        dryR[pos] += s * gainR;
        if (sendAmt > 0.01) {
          delSendL[pos] += s * gainL * sendAmt;
          delSendR[pos] += s * gainR * sendAmt;
        }
      }
    }
  }

  // Offline Stereo Ping-Pong Delay + Soft-Clip Limiter
  const beatSec = 60 / Math.max(40, project.bpm);
  const divBeats =
    project.master.delayDivision === '1/16'
      ? 0.25
      : project.master.delayDivision === '1/8'
      ? 0.5
      : project.master.delayDivision === '1/8D'
      ? 0.75
      : 1.0;
  const delaySamplesL = Math.max(128, Math.floor(beatSec * divBeats * sampleRate));
  const delaySamplesR = Math.max(128, Math.floor(delaySamplesL * 0.75));
  const fb = Math.max(0, Math.min(0.75, project.master.delayFeedback));

  const outL = new Float32Array(totalSamples);
  const outR = new Float32Array(totalSamples);
  const masterVol = project.master.volume * 0.88;
  const limiterOn = project.master.limiterOn;

  for (let i = 0; i < totalSamples; i++) {
    if (i >= delaySamplesL) {
      delSendL[i] += delSendR[i - delaySamplesL] * fb;
    }
    if (i >= delaySamplesR) {
      delSendR[i] += delSendL[i - delaySamplesR] * fb;
    }

    let l = (dryL[i] + delSendL[i] * 0.55) * masterVol;
    let r = (dryR[i] + delSendR[i] * 0.55) * masterVol;

    if (limiterOn) {
      l = Math.tanh(l * 1.15) / Math.tanh(1.15);
      r = Math.tanh(r * 1.15) / Math.tanh(1.15);
    } else {
      l = Math.max(-1, Math.min(1, l));
      r = Math.max(-1, Math.min(1, r));
    }

    outL[i] = l;
    outR[i] = r;
  }

  return encodeWav16Stereo(outL, outR, sampleRate);
}
