import React, { useEffect, useRef, useState } from 'react';
import {
  CHOKE_LABELS,
  ENGINE_LABELS,
  type DrumPadConfig,
  type DrumPattern,
  type NoteRepeatRate,
  type SixteenLevelsMode,
} from '../types';
import { FACTORY_KITS } from '../data/factoryKits';
import { padCutoffToHz } from '../audio/drumDspCore';
import { TouchSlider } from './TouchSlider';

// MPC-style bottom-to-top 4x4 pad ordering
const PAD_GRID_ORDER = [
  12, 13, 14, 15,
  8, 9, 10, 11,
  4, 5, 6, 7,
  0, 1, 2, 3,
];

const REPEAT_CYCLE: NoteRepeatRate[] = ['off', '1/8', '1/16', '1/32', '1/16T'];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function formatPitchOffset(semi: number): string {
  return semi > 0 ? `+${semi}st` : `${semi}st`;
}

function formatPitchNote(semi: number): string {
  const midi = 60 + semi;
  const note = NOTE_NAMES[((midi % 12) + 12) % 12];
  const oct = Math.floor(midi / 12) - 1;
  return `${note}${oct}`;
}

interface PadsViewProps {
  kitId: string;
  pads: DrumPadConfig[];
  patterns: DrumPattern[];
  activePatternIndex: number;
  selectedPadId: number;
  padFlash: Record<number, number>;
  fullLevel: boolean;
  sixteenLevels: SixteenLevelsMode;
  noteRepeat: NoteRepeatRate;
  padActionMode: 'play' | 'mute' | 'solo';
  swing: number;
  scopeData: Float32Array;
  onSelectKit: (kitId: string) => void;
  onSelectPattern: (index: number) => void;
  onSelectPad: (padId: number) => void;
  onPadDown: (padId: number, velocity: number, pitchOffset?: number) => void;
  onPadUp: (padId: number) => void;
  onToggleFullLevel: () => void;
  onCycleSixteenLevels: () => void;
  onCycleNoteRepeat: () => void;
  onSetPadActionMode: (mode: 'play' | 'mute' | 'solo') => void;
  onTogglePadMute: (padId: number) => void;
  onTogglePadSolo: (padId: number) => void;
  onUpdatePad: (padId: number, patch: Partial<DrumPadConfig>) => void;
  onOpenEditor: () => void;
  onPerformanceFx: (active: boolean, x: number, y: number) => void;
}

export const PadsView: React.FC<PadsViewProps> = ({
  kitId,
  pads,
  patterns,
  activePatternIndex,
  selectedPadId,
  padFlash,
  fullLevel,
  sixteenLevels,
  noteRepeat,
  padActionMode,
  scopeData,
  onSelectKit,
  onSelectPattern,
  onSelectPad,
  onPadDown,
  onPadUp,
  onToggleFullLevel,
  onCycleSixteenLevels,
  onCycleNoteRepeat,
  onSetPadActionMode,
  onTogglePadMute,
  onTogglePadSolo,
  onUpdatePad,
  onOpenEditor,
  onPerformanceFx,
}) => {
  const scopeCanvasRef = useRef<HTMLCanvasElement>(null);
  const [fxPadOpen, setFxPadOpen] = useState(false);
  const [xyActive, setXyActive] = useState(false);
  const [xyPos, setXyPos] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.25 });
  const selectedPad = pads[selectedPadId] ?? pads[0];
  const anySolo = pads.some((p) => p.solo);

  const updateXy = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const y = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
    setXyPos({ x, y });
    onPerformanceFx(true, x, y);
  };

  // Draw live master oscilloscope mini-monitor
  useEffect(() => {
    const canvas = scopeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Center line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Waveform trace
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const len = scopeData.length;
    for (let i = 0; i < len; i++) {
      const x = (i / Math.max(1, len - 1)) * w;
      const y = h / 2 - scopeData[i] * (h * 0.44);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [scopeData]);

  const handleGridPointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    gridIndex: number,
    padId: number
  ) => {
    e.preventDefault();
    if (padActionMode === 'mute') {
      onTogglePadMute(padId);
      return;
    }
    if (padActionMode === 'solo') {
      onTogglePadSolo(padId);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const relY = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
    const touchVel = fullLevel ? 0.96 : 0.34 + relY * 0.66;

    if (sixteenLevels === 'pitch') {
      // Bottom-left = -7st, top-right = +8st
      const semi = gridIndex - 7;
      onPadDown(selectedPadId, touchVel, semi);
      return;
    }
    if (sixteenLevels === 'velocity') {
      const vel = 0.12 + (gridIndex / 15) * 0.88;
      onPadDown(selectedPadId, vel, 0);
      return;
    }

    onSelectPad(padId);
    onPadDown(padId, touchVel, 0);
  };

  const handleGridPointerUp = (padId: number) => {
    onPadUp(sixteenLevels === 'off' ? padId : selectedPadId);
  };

  const filterHz = padCutoffToHz(selectedPad.filterCutoff);
  const filterLabel = filterHz >= 1000 ? `${(filterHz / 1000).toFixed(1)}k` : `${Math.round(filterHz)}Hz`;

  return (
    <section className="daw-view daw-pads-view" aria-label="16-Pad Drum Rack">
      {/* Kit Selector + Pattern Bank + Live Scope */}
      <div className="daw-pads-topbar">
        <label className="daw-kit-select-wrap">
          <span className="daw-sr-only">Drum Kit</span>
          <select
            id="daw-kit-select"
            className="daw-kit-select"
            value={kitId}
            onChange={(e) => onSelectKit(e.target.value)}
          >
            {FACTORY_KITS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>

        <div className="daw-pattern-pills" role="tablist" aria-label="Patterns">
          {patterns.slice(0, 4).map((pat, idx) => {
            const hasHits = pat.steps.some((row) => row.some((c) => c.active));
            return (
              <button
                key={pat.id}
                type="button"
                className={`daw-pat-pill ${idx === activePatternIndex ? 'is-active' : ''} ${hasHits ? 'has-data' : ''}`}
                onClick={() => onSelectPattern(idx)}
              >
                {pat.id}
              </button>
            );
          })}
        </div>

        <canvas
          ref={scopeCanvasRef}
          className="daw-mini-scope"
          width={86}
          height={26}
          aria-label="Master Waveform"
        />
      </div>

      {/* Performance Mode Toolbar */}
      <div className="daw-perf-strip">
        <button
          id="daw-btn-full-lvl"
          type="button"
          className={`daw-mode-btn ${fullLevel ? 'is-amber' : ''}`}
          onClick={onToggleFullLevel}
        >
          FULL LVL
        </button>

        <button
          id="daw-btn-16-lvl"
          type="button"
          className={`daw-mode-btn ${sixteenLevels !== 'off' ? 'is-cyan' : ''}`}
          onClick={onCycleSixteenLevels}
        >
          16 LVL{sixteenLevels !== 'off' ? `: ${sixteenLevels === 'pitch' ? 'PITCH' : 'VEL'}` : ''}
        </button>

        <button
          id="daw-btn-note-repeat"
          type="button"
          className={`daw-mode-btn ${noteRepeat !== 'off' ? 'is-coral' : ''}`}
          onClick={onCycleNoteRepeat}
          title={`Hold pad to roll (${REPEAT_CYCLE.join(' / ')})`}
        >
          ROLL{noteRepeat !== 'off' ? ` ${noteRepeat}` : ''}
        </button>

        <button
          id="daw-btn-mode-mute"
          type="button"
          className={`daw-mode-btn ${padActionMode === 'mute' ? 'is-red' : ''}`}
          onClick={() => onSetPadActionMode(padActionMode === 'mute' ? 'play' : 'mute')}
        >
          MUTE
        </button>

        <button
          id="daw-btn-mode-solo"
          type="button"
          className={`daw-mode-btn ${padActionMode === 'solo' ? 'is-emerald' : ''}`}
          onClick={() => onSetPadActionMode(padActionMode === 'solo' ? 'play' : 'solo')}
        >
          SOLO
        </button>
      </div>

      {/* Flagship 4x4 Velocity-Sensitive Drum Pad Grid */}
      <div className="daw-pad-grid">
        {PAD_GRID_ORDER.map((padId) => {
          // 0..15 ascending bottom-to-top for 16 Levels
          const levelIndex = padId;
          const pad = pads[padId];
          const isSelected = sixteenLevels === 'off' && padId === selectedPadId;
          const flash = padFlash[sixteenLevels === 'off' ? padId : selectedPadId] ?? 0;
          const dimmed = sixteenLevels === 'off' && (pad.mute || (anySolo && !pad.solo));

          let labelMain = pad.shortName;
          let labelSub = ENGINE_LABELS[pad.engine];
          let padColor = pad.color;

          if (sixteenLevels === 'pitch') {
            const semi = levelIndex - 7;
            labelMain = formatPitchNote(semi);
            labelSub = formatPitchOffset(semi);
            padColor = selectedPad.color;
          } else if (sixteenLevels === 'velocity') {
            const pct = Math.round((0.12 + (levelIndex / 15) * 0.88) * 100);
            labelMain = `${pct}%`;
            labelSub = selectedPad.shortName;
            padColor = selectedPad.color;
          }

          return (
            <button
              key={padId}
              id={`daw-pad-${padId}`}
              type="button"
              className={`daw-pad daw-pad--${padColor} ${isSelected ? 'is-selected' : ''} ${dimmed ? 'is-dimmed' : ''} ${flash > 0.08 ? 'is-hit' : ''}`}
              style={
                flash > 0.08
                  ? ({ '--pad-flash': Math.min(1, flash) } as React.CSSProperties)
                  : undefined
              }
              onPointerDown={(e) => handleGridPointerDown(e, levelIndex, padId)}
              onPointerUp={() => handleGridPointerUp(padId)}
              onPointerCancel={() => handleGridPointerUp(padId)}
              onPointerLeave={() => handleGridPointerUp(padId)}
            >
              <div className="daw-pad__led" />
              <div className="daw-pad__top">
                <span className="daw-pad__num">{padId + 1}</span>
                {sixteenLevels === 'off' && (
                  <span className="daw-pad__badges">
                    {pad.chokeGroup > 0 && (
                      <span className="daw-pad__choke">{CHOKE_LABELS[pad.chokeGroup]}</span>
                    )}
                    {pad.mute && <span className="daw-pad__state daw-pad__state--m">M</span>}
                    {pad.solo && <span className="daw-pad__state daw-pad__state--s">S</span>}
                  </span>
                )}
              </div>
              <div className="daw-pad__center">
                <span className="daw-pad__name">{labelMain}</span>
                <span className="daw-pad__sub">{labelSub}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Pad Quick-Sculpt Macro Bar OR Live XY DJ Performance FX Pad */}
      <div className="daw-macro-bar">
        <div className="daw-macro-bar__head">
          <div className="daw-macro-bar__title">
            <span className={`daw-color-dot daw-color-dot--${selectedPad.color}`} />
            <strong>{fxPadOpen ? 'LIVE XY MASTER FX' : selectedPad.name}</strong>
            <span className="daw-macro-bar__eng">
              {fxPadOpen ? 'DJ FILTER + SPACE' : ENGINE_LABELS[selectedPad.engine]}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '5px' }}>
            <button
              id="daw-btn-xy-fx"
              type="button"
              className={`daw-pill-btn ${fxPadOpen ? 'daw-pill-btn--amber' : ''}`}
              onClick={() => {
                if (fxPadOpen) {
                  setXyActive(false);
                  onPerformanceFx(false, 0.5, 0);
                }
                setFxPadOpen((v) => !v);
              }}
            >
              {fxPadOpen ? 'MACROS' : 'XY FX'}
            </button>
            <button
              id="daw-btn-open-pad-edit"
              type="button"
              className="daw-pill-btn daw-pill-btn--amber"
              onClick={onOpenEditor}
            >
              DEEP EDIT
            </button>
          </div>
        </div>

        {fxPadOpen ? (
          <div
            className={`daw-xy-pad ${xyActive ? 'is-active' : ''}`}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              setXyActive(true);
              updateXy(e);
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              updateXy(e);
            }}
            onPointerUp={() => {
              setXyActive(false);
              onPerformanceFx(false, 0.5, 0);
            }}
            onPointerCancel={() => {
              setXyActive(false);
              onPerformanceFx(false, 0.5, 0);
            }}
          >
            <span className="daw-xy-pad__corner daw-xy-pad__corner--tl">LPF + SPACE</span>
            <span className="daw-xy-pad__corner daw-xy-pad__corner--tr">HPF + SPACE</span>
            <span className="daw-xy-pad__corner daw-xy-pad__corner--bl">LPF DRY</span>
            <span className="daw-xy-pad__corner daw-xy-pad__corner--br">HPF DRY</span>
            <div className="daw-xy-pad__cross-x" />
            <div
              className="daw-xy-pad__puck"
              style={{ left: `${xyPos.x * 100}%`, bottom: `${xyPos.y * 100}%` }}
            />
          </div>
        ) : (
          <div className="daw-macro-bar__sliders">
          <TouchSlider
            label="PITCH"
            value={selectedPad.pitch}
            min={-24}
            max={24}
            step={1}
            defaultValue={0}
            bipolar
            compact
            displayValue={formatPitchOffset(selectedPad.pitch)}
            onChange={(v) => onUpdatePad(selectedPad.id, { pitch: v })}
          />
          <TouchSlider
            label="DECAY"
            value={selectedPad.decay}
            min={0.05}
            max={1}
            step={0.01}
            defaultValue={0.45}
            compact
            displayValue={`${Math.round(selectedPad.decay * 100)}%`}
            onChange={(v) => onUpdatePad(selectedPad.id, { decay: v })}
          />
          <TouchSlider
            label="FILTER"
            value={selectedPad.filterCutoff}
            min={0.05}
            max={1}
            step={0.01}
            defaultValue={0.96}
            compact
            displayValue={filterLabel}
            onChange={(v) => onUpdatePad(selectedPad.id, { filterCutoff: v })}
          />
          <TouchSlider
            label="DRIVE"
            value={selectedPad.drive}
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.08}
            compact
            displayValue={`${Math.round(selectedPad.drive * 100)}%`}
            onChange={(v) => onUpdatePad(selectedPad.id, { drive: v })}
          />
        </div>
        )}
      </div>
    </section>
  );
};
