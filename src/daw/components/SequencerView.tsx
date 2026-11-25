import React, { useRef, useState } from 'react';
import type { DrumPadConfig, DrumPattern, StepCell, StepParamLane } from '../types';
import { TouchSlider } from './TouchSlider';

interface SequencerViewProps {
  pads: DrumPadConfig[];
  patterns: DrumPattern[];
  activePatternIndex: number;
  selectedPadId: number;
  currentStep: number;
  swing: number;
  onSelectPattern: (index: number) => void;
  onSelectPad: (padId: number) => void;
  onAuditionPad: (padId: number) => void;
  onToggleStep: (padId: number, stepIdx: number) => void;
  onUpdateStep: (padId: number, stepIdx: number, patch: Partial<StepCell>) => void;
  onSetPatternLength: (len: 16 | 32 | 64) => void;
  onSwingChange: (swing: number) => void;
  onEuclidean: (padId: number, pulses: number) => void;
  onHumanize: () => void;
  onDoubleLength: () => void;
  onShiftPad: (padId: number, delta: -1 | 1) => void;
  onClearPad: (padId: number) => void;
  onClearPattern: () => void;
}

const LANE_TABS: { id: StepParamLane; label: string }[] = [
  { id: 'velocity', label: 'VEL' },
  { id: 'pitch', label: 'PITCH' },
  { id: 'ratchet', label: 'ROLL' },
  { id: 'probability', label: 'PROB' },
  { id: 'pan', label: 'PAN' },
  { id: 'nudge', label: 'NUDGE' },
];

export const SequencerView: React.FC<SequencerViewProps> = ({
  pads,
  patterns,
  activePatternIndex,
  selectedPadId,
  currentStep,
  swing,
  onSelectPattern,
  onSelectPad,
  onAuditionPad,
  onToggleStep,
  onUpdateStep,
  onSetPatternLength,
  onSwingChange,
  onEuclidean,
  onHumanize,
  onDoubleLength,
  onShiftPad,
  onClearPad,
  onClearPattern,
}) => {
  const [seqMode, setSeqMode] = useState<'matrix' | 'lanes'>('matrix');
  const [barPage, setBarPage] = useState<number>(0);
  const [activeLane, setActiveLane] = useState<StepParamLane>('velocity');
  const [showEuclid, setShowEuclid] = useState<boolean>(false);
  const paintModeRef = useRef<boolean | null>(null);

  const pattern = patterns[activePatternIndex] ?? patterns[0];
  const totalBars = Math.max(1, pattern.length / 16);
  const safeBar = Math.min(barPage, totalBars - 1);
  const barOffset = safeBar * 16;
  const selectedPad = pads[selectedPadId] ?? pads[0];

  const handleLanePointer = (
    e: React.PointerEvent<HTMLDivElement>,
    stepIdx: number
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const norm = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));

    if (activeLane === 'velocity') {
      onUpdateStep(selectedPadId, stepIdx, { active: true, velocity: Math.max(0.1, Number(norm.toFixed(2))) });
    } else if (activeLane === 'pitch') {
      const semi = Math.round(norm * 24 - 12);
      onUpdateStep(selectedPadId, stepIdx, { active: true, pitch: semi });
    } else if (activeLane === 'ratchet') {
      const r = (Math.min(4, Math.max(1, Math.ceil(norm * 4))) as 1 | 2 | 3 | 4);
      onUpdateStep(selectedPadId, stepIdx, { active: true, ratchet: r });
    } else if (activeLane === 'probability') {
      const prob = Math.max(0.1, Math.round(norm * 10) / 10);
      onUpdateStep(selectedPadId, stepIdx, { active: true, probability: prob });
    } else if (activeLane === 'pan') {
      const pan = Number((norm * 2 - 1).toFixed(2));
      onUpdateStep(selectedPadId, stepIdx, { active: true, pan });
    } else if (activeLane === 'nudge') {
      const nudge = Number(((norm * 2 - 1) * 0.45).toFixed(2));
      onUpdateStep(selectedPadId, stepIdx, { active: true, nudge });
    }
  };

  const getLaneVisual = (cell: StepCell): { heightPct: number; label: string } => {
    switch (activeLane) {
      case 'velocity':
        return { heightPct: cell.velocity * 100, label: `${Math.round(cell.velocity * 100)}` };
      case 'pitch':
        return {
          heightPct: ((cell.pitch + 12) / 24) * 100,
          label: cell.pitch > 0 ? `+${cell.pitch}` : `${cell.pitch}`,
        };
      case 'ratchet':
        return { heightPct: (cell.ratchet / 4) * 100, label: `${cell.ratchet}x` };
      case 'probability':
        return { heightPct: cell.probability * 100, label: `${Math.round(cell.probability * 100)}%` };
      case 'pan':
        return {
          heightPct: ((cell.pan + 1) / 2) * 100,
          label: Math.abs(cell.pan) < 0.08 ? 'C' : cell.pan < 0 ? `L${Math.round(-cell.pan * 50)}` : `R${Math.round(cell.pan * 50)}`,
        };
      case 'nudge':
        return {
          heightPct: ((cell.nudge / 0.45 + 1) / 2) * 100,
          label: `${Math.round(cell.nudge * 100)}`,
        };
    }
  };

  return (
    <section className="daw-view daw-seq-view" aria-label="Step Sequencer">
      {/* Sequencer Header Controls */}
      <div className="daw-seq-topbar">
        <div className="daw-seg-control">
          <button
            id="daw-seq-mode-matrix"
            type="button"
            className={seqMode === 'matrix' ? 'is-active' : ''}
            onClick={() => setSeqMode('matrix')}
          >
            MATRIX
          </button>
          <button
            id="daw-seq-mode-lanes"
            type="button"
            className={seqMode === 'lanes' ? 'is-active' : ''}
            onClick={() => setSeqMode('lanes')}
          >
            LANES
          </button>
        </div>

        <div className="daw-pattern-pills">
          {patterns.slice(0, 4).map((p, idx) => (
            <button
              key={p.id}
              type="button"
              className={`daw-pat-pill ${idx === activePatternIndex ? 'is-active' : ''}`}
              onClick={() => onSelectPattern(idx)}
            >
              {p.id}
            </button>
          ))}
        </div>

        <div className="daw-seg-control">
          {([16, 32, 64] as const).map((len) => (
            <button
              key={len}
              type="button"
              className={pattern.length === len ? 'is-active' : ''}
              onClick={() => {
                onSetPatternLength(len);
                if (safeBar >= len / 16) setBarPage(0);
              }}
            >
              {len}
            </button>
          ))}
        </div>
      </div>

      {/* Bar Page + Swing Strip */}
      <div className="daw-seq-subbar">
        <div className="daw-bar-pages">
          {Array.from({ length: totalBars }, (_, b) => {
            const playingInBar =
              currentStep >= b * 16 && currentStep < (b + 1) * 16;
            return (
              <button
                key={b}
                type="button"
                className={`daw-bar-btn ${safeBar === b ? 'is-active' : ''} ${playingInBar ? 'is-playing' : ''}`}
                onClick={() => setBarPage(b)}
              >
                BAR {b + 1}
              </button>
            );
          })}
        </div>

        <div className="daw-swing-wrap">
          <TouchSlider
            label="SWING"
            value={swing}
            min={0}
            max={0.6}
            step={0.01}
            defaultValue={0}
            compact
            displayValue={`${Math.round(swing * 100)}%`}
            onChange={onSwingChange}
          />
        </div>
      </div>

      {/* Main Sequencer Body */}
      {seqMode === 'matrix' ? (
        <div
          className="daw-matrix-scroll"
          onPointerUp={() => {
            paintModeRef.current = null;
          }}
          onPointerLeave={() => {
            paintModeRef.current = null;
          }}
        >
          {/* Step Ruler */}
          <div className="daw-matrix-ruler">
            <div className="daw-matrix-ruler__pad">TRACK</div>
            <div className="daw-matrix-ruler__steps">
              {Array.from({ length: 16 }, (_, s) => {
                const absStep = barOffset + s;
                const isPlayhead = currentStep === absStep;
                return (
                  <span
                    key={s}
                    className={`daw-ruler-num ${s % 4 === 0 ? 'is-beat' : ''} ${isPlayhead ? 'is-now' : ''}`}
                  >
                    {s % 4 === 0 ? Math.floor(absStep / 4) + 1 : '·'}
                  </span>
                );
              })}
            </div>
          </div>

          {pads.map((pad) => {
            const row = pattern.steps[pad.id];
            const isSelected = pad.id === selectedPadId;
            return (
              <div
                key={pad.id}
                className={`daw-matrix-row ${isSelected ? 'is-selected' : ''} ${pad.mute ? 'is-muted' : ''}`}
              >
                <button
                  type="button"
                  className="daw-matrix-padbtn"
                  onClick={() => {
                    onSelectPad(pad.id);
                    onAuditionPad(pad.id);
                  }}
                >
                  <span className={`daw-color-bar daw-color-bar--${pad.color}`} />
                  <span className="daw-matrix-padbtn__name">{pad.shortName}</span>
                </button>

                <div className="daw-matrix-steps">
                  {Array.from({ length: 16 }, (_, s) => {
                    const absStep = barOffset + s;
                    const cell = row[absStep];
                    const isNow = currentStep === absStep;
                    const beatAlt = Math.floor(s / 4) % 2 === 1;
                    return (
                      <button
                        key={s}
                        type="button"
                        className={`daw-step-btn daw-step-btn--${pad.color} ${beatAlt ? 'is-alt' : ''} ${cell.active ? 'is-on' : ''} ${isNow ? 'is-now' : ''}`}
                        style={
                          cell.active
                            ? ({ '--step-vel': 0.35 + cell.velocity * 0.65 } as React.CSSProperties)
                            : undefined
                        }
                        onPointerDown={(e) => {
                          e.preventDefault();
                          const nextState = !cell.active;
                          paintModeRef.current = nextState;
                          onToggleStep(pad.id, absStep);
                        }}
                        onPointerEnter={() => {
                          if (paintModeRef.current !== null && cell.active !== paintModeRef.current) {
                            onUpdateStep(pad.id, absStep, { active: paintModeRef.current });
                          }
                        }}
                        aria-label={`${pad.name} step ${absStep + 1}`}
                      >
                        {cell.active && cell.ratchet > 1 && (
                          <span className="daw-step-badge">{cell.ratchet}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LANES MODE: Logic Step Sequencer / FL Graph Editor */
        <div className="daw-lanes-body">
          {/* Horizontal Pad Selector Strip */}
          <div className="daw-pad-strip">
            {pads.map((pad) => (
              <button
                key={pad.id}
                type="button"
                className={`daw-pad-chip ${pad.id === selectedPadId ? 'is-active' : ''}`}
                onClick={() => {
                  onSelectPad(pad.id);
                  onAuditionPad(pad.id);
                }}
              >
                <span className={`daw-color-dot daw-color-dot--${pad.color}`} />
                {pad.shortName}
              </button>
            ))}
          </div>

          {/* 16 Step Gate Buttons for Selected Pad */}
          <div className="daw-lane-gates">
            {Array.from({ length: 16 }, (_, s) => {
              const absStep = barOffset + s;
              const cell = pattern.steps[selectedPadId][absStep];
              const isNow = currentStep === absStep;
              return (
                <button
                  key={s}
                  type="button"
                  className={`daw-gate-btn daw-step-btn--${selectedPad.color} ${cell.active ? 'is-on' : ''} ${isNow ? 'is-now' : ''} ${s % 4 === 0 ? 'is-beat' : ''}`}
                  onClick={() => onToggleStep(selectedPadId, absStep)}
                >
                  <span>{absStep + 1}</span>
                </button>
              );
            })}
          </div>

          {/* Parameter Lane Selector */}
          <div className="daw-lane-tabs">
            {LANE_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`daw-lane-tab ${activeLane === t.id ? 'is-active' : ''}`}
                onClick={() => setActiveLane(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Swipeable 16-Column Parameter Graph */}
          <div className="daw-lane-graph">
            {Array.from({ length: 16 }, (_, s) => {
              const absStep = barOffset + s;
              const cell = pattern.steps[selectedPadId][absStep];
              const { heightPct, label } = getLaneVisual(cell);
              const isNow = currentStep === absStep;

              return (
                <div
                  key={s}
                  className={`daw-lane-col ${cell.active ? 'is-active' : ''} ${isNow ? 'is-now' : ''}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    handleLanePointer(e, absStep);
                  }}
                  onPointerMove={(e) => {
                    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                    handleLanePointer(e, absStep);
                  }}
                >
                  <div className="daw-lane-col__barwrap">
                    <div
                      className={`daw-lane-col__bar daw-color-bg--${selectedPad.color}`}
                      style={{ height: `${Math.max(4, Math.min(100, heightPct))}%` }}
                    />
                  </div>
                  <span className="daw-lane-col__val">{cell.active ? label : '·'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Euclidean Pop-up Drawer */}
      {showEuclid && (
        <div className="daw-euclid-drawer">
          <span className="daw-euclid-drawer__label">EUCLID ({selectedPad.shortName}):</span>
          {[3, 4, 5, 6, 7, 8, 9, 11, 13].map((pulses) => (
            <button
              key={pulses}
              type="button"
              className="daw-tool-btn"
              onClick={() => {
                onEuclidean(selectedPadId, pulses);
                setShowEuclid(false);
              }}
            >
              {pulses}
            </button>
          ))}
        </div>
      )}

      {/* Pattern Tools Footer */}
      <div className="daw-seq-tools">
        <button
          id="daw-btn-euclid"
          type="button"
          className={`daw-tool-btn ${showEuclid ? 'is-active' : ''}`}
          onClick={() => setShowEuclid((v) => !v)}
        >
          EUCLID
        </button>
        <button id="daw-btn-humanize" type="button" className="daw-tool-btn" onClick={onHumanize}>
          HUMANIZE
        </button>
        <button
          id="daw-btn-double"
          type="button"
          className="daw-tool-btn"
          onClick={onDoubleLength}
          disabled={pattern.length >= 64}
        >
          2× LEN
        </button>
        <button
          type="button"
          className="daw-tool-btn"
          onClick={() => onShiftPad(selectedPadId, -1)}
          title="Shift selected pad left"
        >
          ←
        </button>
        <button
          type="button"
          className="daw-tool-btn"
          onClick={() => onShiftPad(selectedPadId, 1)}
          title="Shift selected pad right"
        >
          →
        </button>
        <button
          type="button"
          className="daw-tool-btn daw-tool-btn--danger"
          onClick={() => onClearPad(selectedPadId)}
        >
          CLR PAD
        </button>
        <button
          type="button"
          className="daw-tool-btn daw-tool-btn--danger"
          onClick={onClearPattern}
        >
          CLR ALL
        </button>
      </div>
    </section>
  );
};
