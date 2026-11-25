/**
 * Real-Time Web Audio Engine, Lookahead Sequencer, Mixer & FX Bus
 * for PRODUCCY Mobile DAW & Flagship Drum Rack.
 */

import {
  applyPadProcessing,
  extractWaveformPeaks,
  generateStereoReverbIR,
  pitchRatio,
  synthesizeDrumHit,
} from './drumDspCore';
import type {
  DawProject,
  DelayDivision,
  MasterBusConfig,
  NoteRepeatRate,
  PadSampleMeta,
} from '../types';

interface ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  chokeGroup: number;
  padId: number;
  endTime: number;
}

interface PadChannelNodes {
  input: GainNode;
  panner: StereoPannerNode;
  gain: GainNode;
  reverbSend: GainNode;
  delaySend: GainNode;
}

export interface PlaybackPosition {
  step: number;
  patternIndex: number;
  clipIndex: number;
  isPlaying: boolean;
}

export interface LiveMeters {
  masterL: number;
  masterR: number;
  padPeaks: Float32Array;
  scope: Float32Array;
}

function makeSoftClipCurve(amount = 1.0): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = Math.tanh(x * (1.25 * amount)) / Math.tanh(1.25 * amount);
  }
  return curve;
}

function delayDivisionToBeats(div: DelayDivision): number {
  switch (div) {
    case '1/16':
      return 0.25;
    case '1/8':
      return 0.5;
    case '1/8D':
      return 0.75;
    case '1/4':
      return 1.0;
  }
}

function noteRepeatToSec(rate: NoteRepeatRate, bpm: number): number {
  const beatSec = 60 / Math.max(40, bpm);
  switch (rate) {
    case '1/4':
      return beatSec;
    case '1/8':
      return beatSec * 0.5;
    case '1/16':
      return beatSec * 0.25;
    case '1/32':
      return beatSec * 0.125;
    case '1/16T':
      return beatSec / 6;
    default:
      return beatSec * 0.25;
  }
}

export class DrumRackEngine {
  private ctx: AudioContext | null = null;
  private project: DawProject;

  // Per-pad channels & cached rendered buffers
  private padChannels: PadChannelNodes[] = [];
  private padBuffers: (AudioBuffer | null)[] = new Array(16).fill(null);
  private customRawSamples: (Float32Array | null)[] = new Array(16).fill(null);
  private padPeaks = new Float32Array(16);
  private activeVoices: ActiveVoice[] = [];

  // Master & Send FX nodes
  private masterSum: GainNode | null = null;
  private eqLow: BiquadFilterNode | null = null;
  private eqMid: BiquadFilterNode | null = null;
  private eqHigh: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private compMakeup: GainNode | null = null;
  private limiter: WaveShaperNode | null = null;
  private masterGain: GainNode | null = null;
  private analyserL: AnalyserNode | null = null;
  private analyserR: AnalyserNode | null = null;
  private scopeAnalyser: AnalyserNode | null = null;
  private analyserBufL = new Float32Array(256);
  private analyserBufR = new Float32Array(256);
  private scopeBuf = new Float32Array(128);

  // Send FX
  private reverbInput: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbReturn: GainNode | null = null;
  private lastReverbKey = '';

  private delayInput: GainNode | null = null;
  private delayNodeL: DelayNode | null = null;
  private delayNodeR: DelayNode | null = null;
  private delayFeedbackL: GainNode | null = null;
  private delayFeedbackR: GainNode | null = null;
  private delayFilter: BiquadFilterNode | null = null;
  private delayReturn: GainNode | null = null;

  // Sequencer state
  private isPlaying = false;
  private metronomeOn = false;
  private timerId: number | null = null;
  private nextStepTime = 0;
  private currentStep = 0;
  private songClipIndex = 0;
  private songBarInClip = 0;
  private lastScheduledStepTime = 0;
  private lastScheduledStepIndex = 0;
  private onPositionChange?: (pos: PlaybackPosition) => void;
  private onPadTriggered?: (padId: number, velocity: number) => void;

  // Note repeat state
  private repeatIntervals = new Map<number, number>();

  constructor(initialProject: DawProject) {
    this.project = initialProject;
  }

  public setCallbacks(
    onPositionChange?: (pos: PlaybackPosition) => void,
    onPadTriggered?: (padId: number, velocity: number) => void
  ): void {
    this.onPositionChange = onPositionChange;
    this.onPadTriggered = onPadTriggered;
  }

  public updateProject(nextProject: DawProject, dirtyPadIds?: number[]): void {
    const prevMaster = this.project.master;
    const prevBpm = this.project.bpm;
    this.project = nextProject;

    if (!this.ctx) return;

    if (dirtyPadIds && dirtyPadIds.length > 0) {
      for (const id of dirtyPadIds) {
        this.rebuildPadBuffer(id);
      }
    }
    this.syncMixerNodes();

    if (
      prevMaster !== nextProject.master ||
      prevBpm !== nextProject.bpm
    ) {
      this.syncMasterBus(nextProject.master, nextProject.bpm);
    }
  }

  public invalidateAllPadBuffers(): void {
    if (!this.ctx) return;
    for (let i = 0; i < 16; i++) {
      this.rebuildPadBuffer(i);
    }
  }

  public setMetronome(enabled: boolean): void {
    this.metronomeOn = enabled;
  }

  public getCustomRawSample(padId: number): Float32Array | null {
    return this.customRawSamples[padId] ?? null;
  }

  public getCustomRawSamplesSnapshot(): (Float32Array | null)[] {
    return this.customRawSamples.slice();
  }

  public async ensureAudioReady(): Promise<AudioContext> {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
      this.buildAudioGraph(this.ctx);
      this.invalidateAllPadBuffers();
      this.syncMixerNodes();
      this.syncMasterBus(this.project.master, this.project.bpm);
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    return this.ctx;
  }

  private buildAudioGraph(ctx: AudioContext): void {
    this.masterSum = ctx.createGain();
    this.masterSum.gain.value = 0.85;

    // 3-Band Master EQ
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 95;

    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1250;
    this.eqMid.Q.value = 0.9;

    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 8200;

    // Bus Glue Compressor
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.attack.value = 0.008;
    this.compressor.release.value = 0.14;
    this.compressor.knee.value = 10;

    this.compMakeup = ctx.createGain();
    this.compMakeup.gain.value = 1;

    // Soft-Clip Brickwall Limiter
    this.limiter = ctx.createWaveShaper();
    this.limiter.curve = makeSoftClipCurve(1.0);
    this.limiter.oversample = '2x';

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.project.master.volume;

    // Metering & Scope
    const splitter = ctx.createChannelSplitter(2);
    this.analyserL = ctx.createAnalyser();
    this.analyserR = ctx.createAnalyser();
    this.scopeAnalyser = ctx.createAnalyser();
    this.analyserL.fftSize = 256;
    this.analyserR.fftSize = 256;
    this.scopeAnalyser.fftSize = 256;

    // Connect Master Chain
    this.masterSum.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.compressor);
    this.compressor.connect(this.compMakeup);
    this.compMakeup.connect(this.limiter);
    this.limiter.connect(this.masterGain);
    this.masterGain.connect(ctx.destination);
    this.masterGain.connect(splitter);
    this.masterGain.connect(this.scopeAnalyser);
    splitter.connect(this.analyserL, 0);
    splitter.connect(this.analyserR, 1);

    // Stereo Algorithmic Reverb Send
    this.reverbInput = ctx.createGain();
    this.reverbConvolver = ctx.createConvolver();
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.65;
    this.reverbInput.connect(this.reverbConvolver);
    this.reverbConvolver.connect(this.reverbReturn);
    this.reverbReturn.connect(this.masterSum);

    // Tempo-Synced Ping-Pong Stereo Delay Send
    this.delayInput = ctx.createGain();
    this.delayFilter = ctx.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.value = 4600;
    this.delayNodeL = ctx.createDelay(2.0);
    this.delayNodeR = ctx.createDelay(2.0);
    this.delayFeedbackL = ctx.createGain();
    this.delayFeedbackR = ctx.createGain();
    const delayMerger = ctx.createChannelMerger(2);
    this.delayReturn = ctx.createGain();
    this.delayReturn.gain.value = 0.58;

    this.delayInput.connect(this.delayFilter);
    this.delayFilter.connect(this.delayNodeL);
    this.delayNodeL.connect(this.delayFeedbackL);
    this.delayFeedbackL.connect(this.delayNodeR);
    this.delayNodeR.connect(this.delayFeedbackR);
    this.delayFeedbackR.connect(this.delayNodeL);

    this.delayNodeL.connect(delayMerger, 0, 0);
    this.delayNodeR.connect(delayMerger, 0, 1);
    delayMerger.connect(this.delayReturn);
    this.delayReturn.connect(this.masterSum);

    // 16 Per-Pad Mixer Channels
    this.padChannels = [];
    for (let i = 0; i < 16; i++) {
      const input = ctx.createGain();
      const panner = ctx.createStereoPanner();
      const gain = ctx.createGain();
      const reverbSend = ctx.createGain();
      const delaySend = ctx.createGain();

      input.connect(panner);
      panner.connect(gain);
      gain.connect(this.masterSum);
      gain.connect(reverbSend);
      gain.connect(delaySend);
      reverbSend.connect(this.reverbInput);
      delaySend.connect(this.delayInput);

      this.padChannels.push({ input, panner, gain, reverbSend, delaySend });
    }
  }

  private rebuildPadBuffer(padId: number): void {
    if (!this.ctx) return;
    const pad = this.project.pads[padId];
    if (!pad) return;

    const sr = this.ctx.sampleRate;
    let mono: Float32Array;
    if (pad.engine === 'sample' && this.customRawSamples[padId]) {
      mono = applyPadProcessing(this.customRawSamples[padId]!, pad, sr, true);
    } else {
      mono = synthesizeDrumHit(pad, sr, 1.0, 0);
    }

    const buf = this.ctx.createBuffer(1, mono.length, sr);
    buf.getChannelData(0).set(mono);
    this.padBuffers[padId] = buf;
  }

  private syncMixerNodes(): void {
    if (!this.ctx || this.padChannels.length === 0) return;
    const now = this.ctx.currentTime;
    const anySolo = this.project.pads.some((p) => p.solo);

    for (let i = 0; i < 16; i++) {
      const pad = this.project.pads[i];
      const ch = this.padChannels[i];
      if (!pad || !ch) continue;
      const audible = anySolo ? pad.solo && !pad.mute : !pad.mute;
      ch.gain.gain.setTargetAtTime(audible ? pad.volume : 0, now, 0.012);
      ch.panner.pan.setTargetAtTime(pad.pan, now, 0.012);
      ch.reverbSend.gain.setTargetAtTime(pad.reverbSend, now, 0.015);
      ch.delaySend.gain.setTargetAtTime(pad.delaySend, now, 0.015);
    }
  }

  private syncMasterBus(master: MasterBusConfig, bpm: number): void {
    if (!this.ctx || !this.eqLow || !this.eqMid || !this.eqHigh || !this.compressor || !this.compMakeup || !this.masterGain || !this.limiter) {
      return;
    }
    const now = this.ctx.currentTime;
    this.eqLow.gain.setTargetAtTime(master.eqLow, now, 0.02);
    this.eqMid.gain.setTargetAtTime(master.eqMid, now, 0.02);
    this.eqHigh.gain.setTargetAtTime(master.eqHigh, now, 0.02);
    this.compressor.threshold.setTargetAtTime(master.compThreshold, now, 0.02);
    this.compressor.ratio.setTargetAtTime(master.compRatio, now, 0.02);
    const makeupLin = Math.pow(10, master.compMakeup / 20);
    this.compMakeup.gain.setTargetAtTime(makeupLin, now, 0.02);
    this.masterGain.gain.setTargetAtTime(master.volume, now, 0.02);
    this.limiter.curve = master.limiterOn ? makeSoftClipCurve(1.0) : null;

    // Delay time synced to BPM
    if (this.delayNodeL && this.delayNodeR && this.delayFeedbackL && this.delayFeedbackR) {
      const beatSec = 60 / Math.max(40, bpm);
      const delaySec = Math.min(1.8, beatSec * delayDivisionToBeats(master.delayDivision));
      this.delayNodeL.delayTime.setTargetAtTime(delaySec, now, 0.03);
      this.delayNodeR.delayTime.setTargetAtTime(delaySec * 0.75, now, 0.03);
      this.delayFeedbackL.gain.setTargetAtTime(master.delayFeedback, now, 0.02);
      this.delayFeedbackR.gain.setTargetAtTime(master.delayFeedback * 0.9, now, 0.02);
    }

    // Rebuild Reverb IR only when decay/tone changes
    const revKey = `${master.reverbDecay.toFixed(2)}_${master.reverbTone.toFixed(2)}`;
    if (this.reverbConvolver && revKey !== this.lastReverbKey) {
      this.lastReverbKey = revKey;
      const [irL, irR] = generateStereoReverbIR(this.ctx.sampleRate, master.reverbDecay, master.reverbTone);
      const irBuf = this.ctx.createBuffer(2, irL.length, this.ctx.sampleRate);
      irBuf.getChannelData(0).set(irL);
      irBuf.getChannelData(1).set(irR);
      this.reverbConvolver.buffer = irBuf;
    }
  }

  /** Trigger a single pad live or from the scheduler */
  public triggerPad(
    padId: number,
    velocity = 0.9,
    pitchOffset = 0,
    panOffset = 0,
    scheduledTime?: number
  ): void {
    if (!this.ctx) {
      void this.ensureAudioReady().then(() => {
        this.triggerPad(padId, velocity, pitchOffset, panOffset);
      });
      return;
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const pad = this.project.pads[padId];
    const ch = this.padChannels[padId];
    if (!pad || !ch) return;

    if (!this.padBuffers[padId]) {
      this.rebuildPadBuffer(padId);
    }
    const buffer = this.padBuffers[padId];
    if (!buffer) return;

    const when = scheduledTime ?? this.ctx.currentTime;
    const vel = Math.max(0.04, Math.min(1.0, velocity));

    // Choke group handling: smoothly fade out any active voices in the same group
    if (pad.chokeGroup > 0) {
      for (const v of this.activeVoices) {
        if (v.chokeGroup === pad.chokeGroup && v.endTime > when) {
          try {
            v.gain.gain.cancelScheduledValues(when);
            v.gain.gain.setValueAtTime(Math.max(0.001, v.gain.gain.value), when);
            v.gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.007);
            v.source.stop(when + 0.009);
            v.endTime = when + 0.009;
          } catch {
            // Voice already stopped
          }
        }
      }
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    // Apply pitch lock / custom sample pitch
    let rate = pitchRatio(pitchOffset, 0);
    if (pad.engine === 'sample') {
      rate *= pitchRatio(pad.pitch, pad.fine);
    }
    source.playbackRate.setValueAtTime(Math.max(0.125, Math.min(8, rate)), when);

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.setValueAtTime(vel, when);

    if (Math.abs(panOffset) > 0.02) {
      const stepPan = this.ctx.createStereoPanner();
      stepPan.pan.setValueAtTime(Math.max(-1, Math.min(1, panOffset)), when);
      source.connect(voiceGain);
      voiceGain.connect(stepPan);
      stepPan.connect(ch.input);
    } else {
      source.connect(voiceGain);
      voiceGain.connect(ch.input);
    }

    const dur = buffer.duration / Math.max(0.125, rate);
    source.start(when);
    source.stop(when + dur + 0.02);

    const voice: ActiveVoice = {
      source,
      gain: voiceGain,
      chokeGroup: pad.chokeGroup,
      padId,
      endTime: when + dur,
    };
    this.activeVoices.push(voice);

    // Prune finished voices periodically
    if (this.activeVoices.length > 48) {
      const now = this.ctx.currentTime;
      this.activeVoices = this.activeVoices.filter((v) => v.endTime > now);
    }

    // Update live pad peak meter & UI trigger callback
    const delayMs = Math.max(0, (when - this.ctx.currentTime) * 1000);
    if (delayMs < 10) {
      this.padPeaks[padId] = Math.max(this.padPeaks[padId], vel * pad.volume);
      this.onPadTriggered?.(padId, vel);
    } else {
      window.setTimeout(() => {
        this.padPeaks[padId] = Math.max(this.padPeaks[padId], vel * pad.volume);
        this.onPadTriggered?.(padId, vel);
      }, delayMs);
    }
  }

  /** Load a user audio file (.wav/.mp3/.ogg/.flac/.m4a) onto a pad */
  public async loadCustomSample(padId: number, file: File): Promise<PadSampleMeta> {
    const ctx = await this.ensureAudioReady();
    const arrayBuffer = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);

    // Mix down to mono Float32Array for unified DSP & offline WAV export
    const length = decoded.length;
    const mono = new Float32Array(length);
    const ch0 = decoded.getChannelData(0);
    if (decoded.numberOfChannels > 1) {
      const ch1 = decoded.getChannelData(1);
      for (let i = 0; i < length; i++) {
        mono[i] = (ch0[i] + ch1[i]) * 0.5;
      }
    } else {
      mono.set(ch0);
    }

    this.customRawSamples[padId] = mono;
    const peaks = extractWaveformPeaks(mono, 96);

    return {
      name: file.name.replace(/\.[^/.]+$/, '').slice(0, 22),
      sampleRate: decoded.sampleRate,
      duration: decoded.duration,
      start: 0,
      end: 1,
      reverse: false,
      oneShot: true,
      peaks,
    };
  }

  /** Start quantized Note Repeat while holding a pad */
  public startNoteRepeat(
    padId: number,
    rate: NoteRepeatRate,
    velocity: number,
    pitchOffset = 0
  ): void {
    this.stopNoteRepeat(padId);
    this.triggerPad(padId, velocity, pitchOffset);
    if (rate === 'off') return;
    const intervalMs = Math.max(35, noteRepeatToSec(rate, this.project.bpm) * 1000);
    const id = window.setInterval(() => {
      this.triggerPad(padId, velocity, pitchOffset);
    }, intervalMs);
    this.repeatIntervals.set(padId, id);
  }

  public stopNoteRepeat(padId: number): void {
    const id = this.repeatIntervals.get(padId);
    if (id !== undefined) {
      window.clearInterval(id);
      this.repeatIntervals.delete(padId);
    }
  }

  public stopAllNoteRepeats(): void {
    for (const id of this.repeatIntervals.values()) {
      window.clearInterval(id);
    }
    this.repeatIntervals.clear();
  }

  // -------------------------------------------------------------------------
  // Transport & Precision Lookahead Sequencer
  // -------------------------------------------------------------------------

  public async start(): Promise<void> {
    const ctx = await this.ensureAudioReady();
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.currentStep = 0;
    this.songClipIndex = 0;
    this.songBarInClip = 0;
    this.nextStepTime = ctx.currentTime + 0.04;
    this.lastScheduledStepTime = this.nextStepTime;
    this.lastScheduledStepIndex = 0;

    this.timerId = window.setInterval(() => this.schedulerTick(), 22);
    this.onPositionChange?.({
      step: 0,
      patternIndex: this.getActivePlaybackPatternIndex(),
      clipIndex: this.songClipIndex,
      isPlaying: true,
    });
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.stopAllNoteRepeats();
    this.currentStep = 0;
    this.songClipIndex = 0;
    this.songBarInClip = 0;
    this.onPositionChange?.({
      step: -1,
      patternIndex: this.project.activePatternIndex,
      clipIndex: 0,
      isPlaying: false,
    });
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /** Returns the nearest quantized step and micro-timing nudge for live recording */
  public getQuantizedStepForNow(): { step: number; nudge: number } {
    if (!this.ctx || !this.isPlaying) {
      return { step: 0, nudge: 0 };
    }
    const secPerStep = 60 / Math.max(40, this.project.bpm) / 4;
    const pat = this.project.patterns[this.getActivePlaybackPatternIndex()];
    const len = pat ? pat.length : 16;
    const delta = (this.ctx.currentTime - this.lastScheduledStepTime) / secPerStep;
    const rounded = Math.round(delta);
    const step = ((this.lastScheduledStepIndex + rounded) % len + len) % len;
    const nudge = Math.max(-0.4, Math.min(0.4, Number((delta - rounded).toFixed(2))));
    return { step, nudge };
  }

  private getActivePlaybackPatternIndex(): number {
    if (this.project.playMode === 'song' && this.project.songClips.length > 0) {
      const clip = this.project.songClips[this.songClipIndex % this.project.songClips.length];
      const idx = this.project.patterns.findIndex((p) => p.id === clip.patternId);
      return idx >= 0 ? idx : 0;
    }
    return this.project.activePatternIndex;
  }

  private schedulerTick(): void {
    if (!this.ctx || !this.isPlaying) return;
    const lookaheadSec = 0.1;

    while (this.nextStepTime < this.ctx.currentTime + lookaheadSec) {
      const patIdx = this.getActivePlaybackPatternIndex();
      const pattern = this.project.patterns[patIdx];
      if (!pattern) break;

      const stepIdx = this.currentStep % pattern.length;
      const secPerStep = 60 / Math.max(40, this.project.bpm) / 4;
      const swingOffset = stepIdx % 2 === 1 ? this.project.swing * secPerStep * 0.55 : 0;
      const stepTime = this.nextStepTime + swingOffset;

      this.lastScheduledStepTime = stepTime;
      this.lastScheduledStepIndex = stepIdx;

      // Metronome click on quarter notes
      if (this.metronomeOn && stepIdx % 4 === 0) {
        this.playMetronomeClick(stepTime, stepIdx % 16 === 0);
      }

      // Schedule all 16 pads for this step
      for (let padId = 0; padId < 16; padId++) {
        const cell = pattern.steps[padId]?.[stepIdx];
        if (!cell || !cell.active) continue;
        if (cell.probability < 0.999 && Math.random() > cell.probability) continue;

        const baseHitTime = Math.max(this.ctx.currentTime, stepTime + cell.nudge * secPerStep);
        const ratchet = cell.ratchet || 1;
        for (let r = 0; r < ratchet; r++) {
          const hitTime = baseHitTime + (r * secPerStep) / ratchet;
          const rVel = ratchet > 1 ? cell.velocity * (0.78 + 0.22 * (r / (ratchet - 1))) : cell.velocity;
          this.triggerPad(padId, rVel, cell.pitch, cell.pan, hitTime);
        }
      }

      // Schedule UI playhead update synced to audio clock
      const uiStep = stepIdx;
      const uiPatIdx = patIdx;
      const uiClipIdx = this.songClipIndex;
      const delayMs = Math.max(0, (stepTime - this.ctx.currentTime) * 1000);
      window.setTimeout(() => {
        if (this.isPlaying) {
          this.onPositionChange?.({
            step: uiStep,
            patternIndex: uiPatIdx,
            clipIndex: uiClipIdx,
            isPlaying: true,
          });
        }
      }, delayMs);

      // Advance step pointer
      this.nextStepTime += secPerStep;
      this.currentStep += 1;

      if (this.project.playMode === 'song' && this.project.songClips.length > 0) {
        // Count 16-step bars inside current song clip
        if (this.currentStep % 16 === 0) {
          this.songBarInClip += 1;
          const clip = this.project.songClips[this.songClipIndex % this.project.songClips.length];
          if (this.songBarInClip >= clip.bars) {
            this.songBarInClip = 0;
            this.songClipIndex = (this.songClipIndex + 1) % this.project.songClips.length;
            this.currentStep = 0;
          }
        }
      } else if (this.currentStep >= pattern.length) {
        this.currentStep = 0;
      }
    }
  }

  private playMetronomeClick(time: number, accent: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(accent ? 1560 : 980, time);
    gain.gain.setValueAtTime(accent ? 0.22 : 0.13, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.025);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.03);
  }

  /** Poll live L/R master peak levels, per-pad peaks, and master scope waveform */
  public getLiveMeters(): LiveMeters {
    let masterL = 0;
    let masterR = 0;

    if (this.analyserL && this.analyserR && this.scopeAnalyser) {
      this.analyserL.getFloatTimeDomainData(this.analyserBufL);
      this.analyserR.getFloatTimeDomainData(this.analyserBufR);
      this.scopeAnalyser.getFloatTimeDomainData(this.scopeBuf);

      for (let i = 0; i < this.analyserBufL.length; i++) {
        const aL = Math.abs(this.analyserBufL[i]);
        const aR = Math.abs(this.analyserBufR[i]);
        if (aL > masterL) masterL = aL;
        if (aR > masterR) masterR = aR;
      }
    }

    // Smooth exponential decay on per-pad peaks
    for (let i = 0; i < 16; i++) {
      this.padPeaks[i] *= 0.86;
      if (this.padPeaks[i] < 0.005) this.padPeaks[i] = 0;
    }

    return {
      masterL: Math.min(1, masterL),
      masterR: Math.min(1, masterR),
      padPeaks: this.padPeaks,
      scope: this.scopeBuf,
    };
  }

  public dispose(): void {
    this.stop();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
