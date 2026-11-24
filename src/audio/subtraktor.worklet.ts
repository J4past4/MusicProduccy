/// <reference lib="webworker" />
import { SubtraktorDspEngine } from './dspCore';
import type { SubtractorPatch } from './types';

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>
  ): boolean;
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: unknown) => AudioWorkletProcessor
): void;

declare const sampleRate: number;

type WorkletMessage =
  | { type: 'init'; patch: SubtractorPatch; bpm: number }
  | { type: 'setPatch'; patch: SubtractorPatch }
  | { type: 'setParam'; key: keyof SubtractorPatch; value: SubtractorPatch[keyof SubtractorPatch] }
  | { type: 'noteOn'; note: number; velocity: number }
  | { type: 'noteOff'; note: number }
  | { type: 'setBpm'; bpm: number }
  | { type: 'setPitchBend'; value: number }
  | { type: 'setModWheel'; value: number }
  | { type: 'triggerSidechain' }
  | { type: 'resetLfo1' }
  | { type: 'allNotesOff' }
  | { type: 'panic' };

class SubtraktorProcessor extends AudioWorkletProcessor {
  private engine: SubtraktorDspEngine | null = null;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      const msg = event.data;
      if (msg.type === 'init') {
        this.engine = new SubtraktorDspEngine(sampleRate, msg.patch);
        this.engine.setBpm(msg.bpm);
        return;
      }
      if (!this.engine) return;
      switch (msg.type) {
        case 'setPatch':
          this.engine.setPatch(msg.patch);
          break;
        case 'setParam':
          this.engine.setParam(msg.key, msg.value as never);
          break;
        case 'noteOn':
          this.engine.noteOn(msg.note, msg.velocity);
          break;
        case 'noteOff':
          this.engine.noteOff(msg.note);
          break;
        case 'setBpm':
          this.engine.setBpm(msg.bpm);
          break;
        case 'setPitchBend':
          this.engine.setPitchBend(msg.value);
          break;
        case 'setModWheel':
          this.engine.setModWheel(msg.value);
          break;
        case 'triggerSidechain':
          this.engine.triggerSidechain();
          break;
        case 'resetLfo1':
          this.engine.resetLfo1();
          break;
        case 'allNotesOff':
          this.engine.allNotesOff();
          break;
        case 'panic':
          this.engine.panic();
          break;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const outL = output[0];
    const outR = output[1] ?? output[0];

    if (!this.engine) {
      outL.fill(0);
      if (outR !== outL) outR.fill(0);
      return true;
    }

    this.engine.processBlock(outL, outR);
    return true;
  }
}

registerProcessor('subtraktor-processor', SubtraktorProcessor);
