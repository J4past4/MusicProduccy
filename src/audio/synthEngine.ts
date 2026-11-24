/**
 * Main Web Audio Engine Controller for SUBTRAKTOR-140.
 * Manages AudioContext, AudioWorkletNode (with automatic ScriptProcessorNode fallback
 * for CSP/sandboxed side-panel iframes), AnalyserNode, UK Drum Backing,
 * lookahead 140 BPM Step Sequencer, and Web MIDI hardware input.
 */

import { SubtraktorDspEngine } from './dspCore';
import { UkDrumEngine, type DrumGroove } from './drumEngine';
import type { SequencerStep, SubtractorPatch } from './types';
import workletUrl from './subtraktor.worklet.ts?worker&url';

export interface MidiStatus {
  supported: boolean;
  connectedDevices: string[];
  lastActivity: number;
}

export class SubtraktorSynthEngine {
  private ctx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private fallbackDsp: SubtraktorDspEngine | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private drumEngine: UkDrumEngine | null = null;

  private currentPatch: SubtractorPatch;
  private bpm = 140;
  private swing = 0.08;
  private drumGroove: DrumGroove = '4x4';
  private drumVolume = 0.65;

  // Sequencer state
  private isPlaying = false;
  private steps: SequencerStep[] = [];
  private currentStep = 0;
  private nextStepTime = 0;
  private schedulerTimer: number | null = null;
  private activeSeqNotes: Set<number> = new Set();
  private onStepChange?: (step: number) => void;

  // MIDI state
  private midiAccess: MIDIAccess | null = null;
  private onMidiNote?: (note: number, on: boolean) => void;
  private onMidiStatusChange?: (status: MidiStatus) => void;
  private onMidiWheel?: (type: 'pitch' | 'mod', value: number) => void;

  private readyPromise: Promise<void> | null = null;

  constructor(initialPatch: SubtractorPatch) {
    this.currentPatch = { ...initialPatch };
  }

  async ensureStarted(): Promise<void> {
    if (this.ctx && (this.workletNode || this.scriptNode)) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      return;
    }

    if (this.readyPromise) {
      await this.readyPromise;
      return;
    }

    this.readyPromise = (async () => {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.92;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.78;

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      this.drumEngine = new UkDrumEngine(this.ctx, this.masterGain);
      this.drumEngine.setVolume(this.drumVolume);

      // Try AudioWorklet first; fall back seamlessly to ScriptProcessorNode
      // in CSP-restricted / single-file side-panel iframes.
      let workletReady = false;
      if (this.ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        try {
          await this.ctx.audioWorklet.addModule(workletUrl);
          this.workletNode = new AudioWorkletNode(this.ctx, 'subtraktor-processor', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
          });
          this.workletNode.connect(this.masterGain);
          this.workletNode.port.postMessage({
            type: 'init',
            patch: this.currentPatch,
            bpm: this.bpm,
          });
          workletReady = true;
        } catch {
          workletReady = false;
        }
      }

      if (!workletReady) {
        const dsp = new SubtraktorDspEngine(this.ctx.sampleRate, this.currentPatch);
        dsp.setBpm(this.bpm);
        this.fallbackDsp = dsp;

        const sp = this.ctx.createScriptProcessor(512, 0, 2);
        sp.onaudioprocess = (ev) => {
          const outL = ev.outputBuffer.getChannelData(0);
          const outR = ev.outputBuffer.getChannelData(1);
          dsp.processBlock(outL, outR);
        };
        sp.connect(this.masterGain);
        this.scriptNode = sp;
      }
    })();

    await this.readyPromise;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  isReady(): boolean {
    return this.ctx !== null && (this.workletNode !== null || this.scriptNode !== null);
  }

  setPatch(patch: SubtractorPatch): void {
    this.currentPatch = { ...patch };
    this.workletNode?.port.postMessage({ type: 'setPatch', patch: this.currentPatch });
    this.fallbackDsp?.setPatch(this.currentPatch);
  }

  setParam<K extends keyof SubtractorPatch>(key: K, value: SubtractorPatch[K]): void {
    this.currentPatch[key] = value;
    this.workletNode?.port.postMessage({ type: 'setParam', key, value });
    this.fallbackDsp?.setParam(key, value);
  }

  setBpm(bpm: number): void {
    this.bpm = Math.max(60, Math.min(220, bpm));
    this.workletNode?.port.postMessage({ type: 'setBpm', bpm: this.bpm });
    this.fallbackDsp?.setBpm(this.bpm);
  }

  setSwing(swing: number): void {
    this.swing = Math.max(0, Math.min(0.4, swing));
  }

  setDrumGroove(groove: DrumGroove): void {
    this.drumGroove = groove;
  }

  setDrumVolume(vol: number): void {
    this.drumVolume = vol;
    this.drumEngine?.setVolume(vol);
  }

  setPitchBend(value: number): void {
    this.workletNode?.port.postMessage({ type: 'setPitchBend', value });
    this.fallbackDsp?.setPitchBend(value);
  }

  setModWheel(value: number): void {
    this.workletNode?.port.postMessage({ type: 'setModWheel', value });
    this.fallbackDsp?.setModWheel(value);
  }

  async noteOn(note: number, velocity = 0.88): Promise<void> {
    await this.ensureStarted();
    this.workletNode?.port.postMessage({ type: 'noteOn', note, velocity });
    this.fallbackDsp?.noteOn(note, velocity);
  }

  noteOff(note: number): void {
    this.workletNode?.port.postMessage({ type: 'noteOff', note });
    this.fallbackDsp?.noteOff(note);
  }

  allNotesOff(): void {
    this.workletNode?.port.postMessage({ type: 'allNotesOff' });
    this.fallbackDsp?.allNotesOff();
  }

  panic(): void {
    this.stopSequencer();
    this.workletNode?.port.postMessage({ type: 'panic' });
    this.fallbackDsp?.panic();
  }

  // ---- 140 BPM Step Sequencer ----
  setSequencerSteps(steps: SequencerStep[]): void {
    this.steps = steps;
  }

  setStepChangeCallback(cb: (step: number) => void): void {
    this.onStepChange = cb;
  }

  async startSequencer(): Promise<void> {
    await this.ensureStarted();
    if (!this.ctx || this.isPlaying) return;

    this.isPlaying = true;
    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.04;
    this.workletNode?.port.postMessage({ type: 'resetLfo1' });
    this.fallbackDsp?.resetLfo1();

    const lookaheadMs = 20;
    const scheduleAheadSec = 0.1;

    this.schedulerTimer = window.setInterval(() => {
      if (!this.ctx || !this.isPlaying) return;
      while (this.nextStepTime < this.ctx.currentTime + scheduleAheadSec) {
        this.scheduleStep(this.currentStep, this.nextStepTime);
        const stepDur = 60 / this.bpm / 4;
        this.nextStepTime += stepDur;
        this.currentStep = (this.currentStep + 1) % 16;
      }
    }, lookaheadMs);
  }

  stopSequencer(): void {
    this.isPlaying = false;
    if (this.schedulerTimer !== null) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    this.activeSeqNotes.forEach((n) => this.noteOff(n));
    this.activeSeqNotes.clear();
    this.allNotesOff();
    this.onStepChange?.(-1);
  }

  private scheduleStep(stepIdx: number, baseTime: number): void {
    if (!this.ctx) return;
    const stepDur = 60 / this.bpm / 4;
    const swingOffset = stepIdx % 2 === 1 ? this.swing * stepDur : 0;
    const fireTime = baseTime + swingOffset;
    const delayMs = Math.max(0, (fireTime - this.ctx.currentTime) * 1000);

    const kicked = this.drumEngine?.triggerStep(stepIdx, fireTime, this.drumGroove) ?? false;
    const step = this.steps[stepIdx];

    window.setTimeout(() => {
      if (!this.isPlaying) return;
      this.onStepChange?.(stepIdx);

      if (kicked || (this.drumGroove === 'off' && stepIdx % 4 === 0)) {
        if (this.currentPatch.fxSidechainAmount > 0.01) {
          this.workletNode?.port.postMessage({ type: 'triggerSidechain' });
          this.fallbackDsp?.triggerSidechain();
        }
      }

      if (step && step.active) {
        const vel = Math.min(1, step.velocity * (step.accent ? 1.25 : 1));
        this.workletNode?.port.postMessage({ type: 'noteOn', note: step.note, velocity: vel });
        this.fallbackDsp?.noteOn(step.note, vel);
        this.activeSeqNotes.add(step.note);

        const gateMs = (step.slide ? stepDur * 1.12 : stepDur * 0.78) * 1000;
        const noteToRelease = step.note;
        window.setTimeout(() => {
          this.workletNode?.port.postMessage({ type: 'noteOff', note: noteToRelease });
          this.fallbackDsp?.noteOff(noteToRelease);
          this.activeSeqNotes.delete(noteToRelease);
        }, gateMs);
      }
    }, delayMs);
  }

  // ---- Web MIDI API ----
  async initMidi(
    onNote: (note: number, on: boolean) => void,
    onStatus: (status: MidiStatus) => void,
    onWheel: (type: 'pitch' | 'mod', value: number) => void
  ): Promise<void> {
    this.onMidiNote = onNote;
    this.onMidiStatusChange = onStatus;
    this.onMidiWheel = onWheel;

    if (!navigator.requestMIDIAccess) {
      onStatus({ supported: false, connectedDevices: [], lastActivity: 0 });
      return;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess();
      this.bindMidiInputs();
      this.midiAccess.onstatechange = () => this.bindMidiInputs();
    } catch {
      onStatus({ supported: false, connectedDevices: [], lastActivity: 0 });
    }
  }

  private bindMidiInputs(): void {
    if (!this.midiAccess) return;
    const devices: string[] = [];
    this.midiAccess.inputs.forEach((input) => {
      if (input.state === 'connected') {
        devices.push(input.name || 'MIDI Device');
        input.onmidimessage = (ev: MIDIMessageEvent) => this.handleMidiMessage(ev);
      }
    });
    this.onMidiStatusChange?.({
      supported: true,
      connectedDevices: devices,
      lastActivity: Date.now(),
    });
  }

  private handleMidiMessage(ev: MIDIMessageEvent): void {
    const data = ev.data;
    if (!data || data.length < 2) return;
    const status = data[0] & 0xf0;
    const d1 = data[1];
    const d2 = data.length > 2 ? data[2] : 0;

    if (status === 0x90 && d2 > 0) {
      void this.noteOn(d1, d2 / 127);
      this.onMidiNote?.(d1, true);
    } else if (status === 0x80 || (status === 0x90 && d2 === 0)) {
      this.noteOff(d1);
      this.onMidiNote?.(d1, false);
    } else if (status === 0xe0) {
      const bend = ((d2 << 7) | d1) / 8192 - 1;
      this.setPitchBend(bend);
      this.onMidiWheel?.('pitch', bend);
    } else if (status === 0xb0 && d1 === 1) {
      const mod = d2 / 127;
      this.setModWheel(mod);
      this.onMidiWheel?.('mod', mod);
    }
  }

  dispose(): void {
    this.stopSequencer();
    this.scriptNode?.disconnect();
    this.workletNode?.disconnect();
    this.ctx?.close();
    this.ctx = null;
    this.workletNode = null;
    this.scriptNode = null;
    this.fallbackDsp = null;
  }
}
