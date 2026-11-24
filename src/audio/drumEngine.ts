/**
 * Synthesized 140 BPM UK Bassline / 4x4 Niche / 2-Step UKG Drum Backing Engine.
 * Zero external samples needed — tight club-ready drums synthesized via Web Audio.
 */

export type DrumGroove = '4x4' | '2step' | 'halftime' | 'off';

export class UkDrumEngine {
  private ctx: AudioContext;
  private outGain: GainNode;
  private noiseBuffer: AudioBuffer;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.outGain = ctx.createGain();
    this.outGain.gain.value = 0.65;
    this.outGain.connect(destination);

    // Pre-generate 1 second white noise buffer for hats/claps
    const len = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }

  setVolume(vol: number): void {
    this.outGain.gain.setTargetAtTime(Math.max(0, Math.min(1.2, vol)), this.ctx.currentTime, 0.015);
  }

  /**
   * Triggers drum hits for a 16-step bar (step 0..15).
   * Returns true if a kick hit occurred (used to trigger 4x4 sidechain pump!).
   */
  triggerStep(step: number, time: number, groove: DrumGroove): boolean {
    if (groove === 'off') return false;
    let kicked = false;

    if (groove === '4x4') {
      // Classic Sheffield Niche / UK Bassline 4x4 groove
      if (step % 4 === 0) {
        this.playKick(time, 1.0);
        kicked = true;
      }
      if (step === 4 || step === 12) {
        this.playClap(time, 0.82);
      }
      if (step % 4 === 2) {
        this.playOpenHat(time, 0.45);
      } else if (step % 2 === 1) {
        this.playClosedHat(time, step === 7 || step === 15 ? 0.36 : 0.2);
      }
      if (step === 14) {
        this.playRim(time, 0.32);
      }
    } else if (groove === '2step') {
      // Classic UK Garage 2-step skippy groove
      if (step === 0 || step === 10) {
        this.playKick(time, 0.98);
        kicked = true;
      }
      if (step === 4 || step === 12) {
        this.playClap(time, 0.85);
      }
      if (step === 7 || step === 14) {
        this.playRim(time, 0.4);
      }
      if (step === 2 || step === 6 || step === 10 || step === 14) {
        this.playOpenHat(time, 0.38);
      }
      if (step === 3 || step === 9 || step === 11 || step === 15) {
        this.playClosedHat(time, 0.28);
      }
    } else if (groove === 'halftime') {
      // 140 BPM Grime / Dubstep / Half-time Bassline
      if (step === 0 || step === 10) {
        this.playKick(time, 1.0);
        kicked = true;
      }
      if (step === 8) {
        this.playClap(time, 0.92);
      }
      if (step % 2 === 0) {
        this.playClosedHat(time, step % 4 === 2 ? 0.34 : 0.2);
      }
      if (step === 14) {
        this.playOpenHat(time, 0.32);
      }
    }

    return kicked;
  }

  private playKick(time: number, amp: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(165, time);
    osc.frequency.exponentialRampToValueAtTime(52, time + 0.045);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.16);

    gain.gain.setValueAtTime(amp * 0.95, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.19);

    osc.connect(gain);
    gain.connect(this.outGain);
    osc.start(time);
    osc.stop(time + 0.2);

    // Tight punchy click transient
    const click = this.ctx.createBufferSource();
    click.buffer = this.noiseBuffer;
    const clickFilter = this.ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.setValueAtTime(2400, time);
    clickFilter.Q.value = 1.2;
    const clickGain = this.ctx.createGain();
    clickGain.gain.setValueAtTime(amp * 0.25, time);
    clickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.015);
    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this.outGain);
    click.start(time);
    click.stop(time + 0.02);
  }

  private playClap(time: number, amp: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.setValueAtTime(1350, time);
    hp.Q.value = 0.9;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(amp * 0.55, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.outGain);
    src.start(time);
    src.stop(time + 0.15);

    // Snappy snare body tone
    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(210, time);
    body.frequency.exponentialRampToValueAtTime(125, time + 0.06);
    const bodyGain = this.ctx.createGain();
    bodyGain.gain.setValueAtTime(amp * 0.3, time);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.075);
    body.connect(bodyGain);
    bodyGain.connect(this.outGain);
    body.start(time);
    body.stop(time + 0.08);
  }

  private playClosedHat(time: number, amp: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(8200, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(amp * 0.45, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.042);

    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.outGain);
    src.start(time);
    src.stop(time + 0.048);
  }

  private playOpenHat(time: number, amp: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(6800, time);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(amp * 0.42, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.17);

    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.outGain);
    src.start(time);
    src.stop(time + 0.18);
  }

  private playRim(time: number, amp: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(820, time);
    osc.frequency.exponentialRampToValueAtTime(340, time + 0.025);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(amp * 0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.032);
    osc.connect(gain);
    gain.connect(this.outGain);
    osc.start(time);
    osc.stop(time + 0.035);
  }
}
