import React from 'react';
import type { BassPattern, SequencerStep } from '../audio/types';
import type { DrumGroove } from '../audio/drumEngine';
import { Knob } from './Knob';

interface SequencerDockProps {
  isPlaying: boolean;
  currentStep: number;
  bpm: number;
  swing: number;
  drumGroove: DrumGroove;
  drumVolume: number;
  patterns: BassPattern[];
  selectedPatternId: string;
  steps: SequencerStep[];
  onTogglePlay: () => void;
  onSelectPattern: (id: string) => void;
  onBpmChange: (bpm: number) => void;
  onSwingChange: (swing: number) => void;
  onDrumGrooveChange: (groove: DrumGroove) => void;
  onDrumVolumeChange: (vol: number) => void;
  onUpdateStep: (index: number, patch: Partial<SequencerStep>) => void;
  onClearSteps: () => void;
  onRandomizeSteps: () => void;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BASS_NOTES: Array<{ midi: number; label: string }> = [];
for (let m = 33; m <= 60; m++) {
  const name = NOTE_NAMES[m % 12];
  const oct = Math.floor(m / 12) - 1;
  BASS_NOTES.push({ midi: m, label: `${name}${oct}` });
}

export const SequencerDock: React.FC<SequencerDockProps> = ({
  isPlaying,
  currentStep,
  bpm,
  swing,
  drumGroove,
  drumVolume,
  patterns,
  selectedPatternId,
  steps,
  onTogglePlay,
  onSelectPattern,
  onBpmChange,
  onSwingChange,
  onDrumGrooveChange,
  onDrumVolumeChange,
  onUpdateStep,
  onClearSteps,
  onRandomizeSteps,
}) => {
  return (
    <section className="rack-unit" aria-label="140 BPM UK Bassline Sequencer and 4x4 Drums">
      <div className="rack-screw tl" />
      <div className="rack-screw tr" />
      <div className="rack-screw bl" />
      <div className="rack-screw br" />

      <div className="seq-header">
        <div className="seq-transport">
          <button
            type="button"
            className={`hw-btn ${isPlaying ? 'primary' : ''}`}
            onClick={onTogglePlay}
            style={{ minWidth: 84 }}
          >
            {isPlaying ? '■ Stop' : '▶ Play 140'}
          </button>

          <select
            className="patch-select"
            style={{ maxWidth: 210 }}
            value={selectedPatternId}
            onChange={(e) => onSelectPattern(e.target.value)}
            aria-label="Select Bassline Pattern"
          >
            {patterns.map((pat) => (
              <option key={pat.id} value={pat.id}>
                {pat.name} ({pat.style})
              </option>
            ))}
          </select>

          <div className="seg-group" style={{ width: 220 }}>
            {(['4x4', '2step', 'halftime', 'off'] as DrumGroove[]).map((g) => (
              <button
                key={g}
                type="button"
                className={`seg-btn ${drumGroove === g ? 'active' : ''}`}
                onClick={() => onDrumGrooveChange(g)}
              >
                {g === '4x4' ? '4x4 Niche' : g === '2step' ? '2-Step' : g === 'halftime' ? 'Half' : 'No Drum'}
              </button>
            ))}
          </div>
        </div>

        <div className="seq-transport">
          <Knob
            label="BPM"
            value={bpm}
            min={124}
            max={156}
            step={1}
            defaultValue={140}
            size={34}
            displayValue={`${Math.round(bpm)}`}
            onChange={onBpmChange}
          />
          <Knob
            label="Swing"
            value={swing}
            min={0}
            max={0.32}
            defaultValue={0.08}
            size={34}
            displayValue={`${Math.round(swing * 100)}%`}
            onChange={onSwingChange}
          />
          <Knob
            label="Drums"
            value={drumVolume}
            min={0}
            max={1}
            defaultValue={0.65}
            size={34}
            onChange={onDrumVolumeChange}
          />
          <button type="button" className="hw-btn" onClick={onRandomizeSteps}>
            Rand Groove
          </button>
          <button type="button" className="hw-btn" onClick={onClearSteps}>
            Clear
          </button>
        </div>
      </div>

      <div className="seq-grid">
        {steps.map((st, idx) => (
          <div
            key={idx}
            className={`seq-step ${idx % 4 === 0 ? 'beat-start' : ''} ${
              currentStep === idx ? 'playing' : ''
            }`}
          >
            <span className="seq-step-num">{String(idx + 1).padStart(2, '0')}</span>
            <button
              type="button"
              className={`seq-gate-btn ${st.active ? 'active' : ''}`}
              onClick={() => onUpdateStep(idx, { active: !st.active })}
            >
              {st.active ? 'ON' : '·'}
            </button>
            <select
              className="seq-note-select"
              value={st.note}
              onChange={(e) => onUpdateStep(idx, { note: Number(e.target.value), active: true })}
              aria-label={`Step ${idx + 1} Note`}
            >
              {BASS_NOTES.map((n) => (
                <option key={n.midi} value={n.midi}>
                  {n.label}
                </option>
              ))}
            </select>
            <div className="seq-flags">
              <button
                type="button"
                className={`seq-flag-btn slide ${st.slide ? 'on' : ''}`}
                onClick={() => onUpdateStep(idx, { slide: !st.slide })}
                title="Legato Slide / Glide"
              >
                SL
              </button>
              <button
                type="button"
                className={`seq-flag-btn accent ${st.accent ? 'on' : ''}`}
                onClick={() => onUpdateStep(idx, { accent: !st.accent })}
                title="Velocity Accent"
              >
                AC
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
