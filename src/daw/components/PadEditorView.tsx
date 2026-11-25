import React, { useEffect, useMemo, useRef } from 'react';
import {
  CHOKE_LABELS,
  ENGINE_LABELS,
  type ChokeGroup,
  type DrumPadConfig,
  type DrumSynthEngineType,
  type FilterMode,
} from '../types';
import {
  extractWaveformPeaks,
  padCutoffToHz,
  padDecayToSec,
  synthesizeDrumHit,
} from '../audio/drumDspCore';
import { TouchSlider } from './TouchSlider';

const ENGINE_LIST: DrumSynthEngineType[] = [
  'kick',
  '808',
  'snare',
  'clap',
  'hat',
  'cymbal',
  'tom',
  'perc',
  'fm',
  'logdrum',
  'sample',
];

const COLOR_HEX: Record<DrumPadConfig['color'], string> = {
  coral: '#f97316',
  amber: '#eab308',
  cyan: '#06b6d4',
  gold: '#d97706',
  emerald: '#10b981',
  rose: '#f43f5e',
  slate: '#94a3b8',
};

interface PadEditorViewProps {
  pads: DrumPadConfig[];
  selectedPadId: number;
  onSelectPad: (padId: number) => void;
  onAuditionPad: (padId: number) => void;
  onUpdatePad: (padId: number, patch: Partial<DrumPadConfig>) => void;
  onLoadSampleFile: (padId: number, file: File) => void;
}

export const PadEditorView: React.FC<PadEditorViewProps> = ({
  pads,
  selectedPadId,
  onSelectPad,
  onAuditionPad,
  onUpdatePad,
  onLoadSampleFile,
}) => {
  const pad = pads[selectedPadId] ?? pads[0];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute real live waveform peaks directly from DSP engine (or sample metadata)
  const { peaks, durationMs } = useMemo(() => {
    if (pad.engine === 'sample' && pad.sampleMeta) {
      return {
        peaks: pad.sampleMeta.peaks,
        durationMs: Math.round(pad.sampleMeta.duration * (pad.trimEnd - pad.trimStart) * 1000),
      };
    }
    // Render at 16kHz for ultra-fast interactive preview while tweaking knobs
    const previewBuf = synthesizeDrumHit(pad, 16000, 1.0, 0);
    return {
      peaks: extractWaveformPeaks(previewBuf, 96),
      durationMs: Math.round((previewBuf.length / 16000) * 1000),
    };
  }, [pad]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(240, Math.floor(rect.width * dpr));
    const h = Math.max(76, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);

    // Subtle horizontal grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Waveform mirrored bars
    const accent = COLOR_HEX[pad.color] || '#f59e0b';
    const barW = w / peaks.length;
    const midY = h / 2;

    for (let i = 0; i < peaks.length; i++) {
      const amp = peaks[i] * (h * 0.44);
      const x = i * barW;
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x + 0.5, midY - amp, Math.max(1.5, barW - 1.2), amp * 2);
    }
    ctx.globalAlpha = 1;

    // Trim region overlays (when custom sample or trimmed)
    if (pad.trimStart > 0.01) {
      const xStart = pad.trimStart * w;
      ctx.fillStyle = 'rgba(12,14,18,0.68)';
      ctx.fillRect(0, 0, xStart, h);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xStart, 0);
      ctx.lineTo(xStart, h);
      ctx.stroke();
    }
    if (pad.trimEnd < 0.99) {
      const xEnd = pad.trimEnd * w;
      ctx.fillStyle = 'rgba(12,14,18,0.68)';
      ctx.fillRect(xEnd, 0, w - xEnd, h);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xEnd, 0);
      ctx.lineTo(xEnd, h);
      ctx.stroke();
    }
  }, [peaks, pad.color, pad.trimStart, pad.trimEnd]);

  const filterHz = padCutoffToHz(pad.filterCutoff);
  const filterLabel = filterHz >= 1000 ? `${(filterHz / 1000).toFixed(1)} kHz` : `${Math.round(filterHz)} Hz`;
  const decayMs = Math.round(padDecayToSec(pad.decay, pad.engine) * 1000);

  return (
    <section className="daw-view daw-editor-view" aria-label="Pad Sound Editor">
      {/* Horizontal 16-Pad Selector Strip */}
      <div className="daw-pad-strip">
        {pads.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`daw-pad-chip ${p.id === selectedPadId ? 'is-active' : ''}`}
            onClick={() => {
              onSelectPad(p.id);
              onAuditionPad(p.id);
            }}
          >
            <span className={`daw-color-dot daw-color-dot--${p.color}`} />
            {p.shortName}
          </button>
        ))}
      </div>

      {/* Scrollable Sound Design Body */}
      <div className="daw-editor-scroll">
        {/* Live Waveform Card */}
        <div className="daw-wave-card">
          <div className="daw-wave-card__top">
            <div className="daw-wave-card__id">
              <span className={`daw-color-dot daw-color-dot--${pad.color}`} />
              <strong>
                PAD {pad.id + 1} · {pad.name}
              </strong>
              <span className="daw-wave-card__meta">
                {pad.engine === 'sample' && pad.sampleMeta
                  ? `${pad.sampleMeta.name} · ${durationMs}ms`
                  : `${ENGINE_LABELS[pad.engine]} · ${durationMs}ms`}
              </span>
            </div>

            <button
              id="daw-editor-audition"
              type="button"
              className="daw-hit-btn"
              onPointerDown={(e) => {
                e.preventDefault();
                onAuditionPad(pad.id);
              }}
            >
              HIT
            </button>
          </div>

          <canvas ref={canvasRef} className="daw-wave-canvas" />

          {/* Engine Selector + Sample Import + Choke + Reverse */}
          <div className="daw-wave-card__controls">
            <label className="daw-inline-select">
              <span>ENGINE</span>
              <select
                id="daw-pad-engine-select"
                value={pad.engine}
                onChange={(e) =>
                  onUpdatePad(pad.id, { engine: e.target.value as DrumSynthEngineType })
                }
              >
                {ENGINE_LIST.map((eng) => (
                  <option key={eng} value={eng}>
                    {ENGINE_LABELS[eng]}
                  </option>
                ))}
              </select>
            </label>

            <label className="daw-inline-select">
              <span>CHOKE</span>
              <select
                id="daw-pad-choke-select"
                value={pad.chokeGroup}
                onChange={(e) =>
                  onUpdatePad(pad.id, { chokeGroup: Number(e.target.value) as ChokeGroup })
                }
              >
                {CHOKE_LABELS.map((lbl, idx) => (
                  <option key={lbl} value={idx}>
                    {lbl}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className={`daw-tool-btn ${pad.reverse ? 'is-active' : ''}`}
              onClick={() => onUpdatePad(pad.id, { reverse: !pad.reverse })}
            >
              REV
            </button>

            <button
              id="daw-btn-load-sample"
              type="button"
              className="daw-tool-btn daw-tool-btn--amber"
              onClick={() => fileInputRef.current?.click()}
            >
              + SAMPLE
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onLoadSampleFile(pad.id, file);
                  e.target.value = '';
                }
              }}
            />
          </div>
        </div>

        {/* Section 1: Tone & Synthesis */}
        <div className="daw-param-group">
          <div className="daw-param-group__title">SYNTH &amp; BODY</div>
          <div className="daw-param-grid">
            <TouchSlider
              label="PITCH"
              value={pad.pitch}
              min={-24}
              max={24}
              step={1}
              defaultValue={0}
              bipolar
              displayValue={pad.pitch > 0 ? `+${pad.pitch} st` : `${pad.pitch} st`}
              onChange={(v) => onUpdatePad(pad.id, { pitch: v })}
            />
            <TouchSlider
              label="FINE"
              value={pad.fine}
              min={-100}
              max={100}
              step={1}
              defaultValue={0}
              bipolar
              displayValue={`${pad.fine > 0 ? '+' : ''}${pad.fine} ct`}
              onChange={(v) => onUpdatePad(pad.id, { fine: v })}
            />
            <TouchSlider
              label="TONE / MORPH"
              value={pad.tone}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.5}
              displayValue={`${Math.round(pad.tone * 100)}%`}
              onChange={(v) => onUpdatePad(pad.id, { tone: v })}
            />
            <TouchSlider
              label="PUNCH / SNAP"
              value={pad.punch}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.55}
              displayValue={`${Math.round(pad.punch * 100)}%`}
              onChange={(v) => onUpdatePad(pad.id, { punch: v })}
            />
          </div>
        </div>

        {/* Section 2: Envelope & Trim */}
        <div className="daw-param-group">
          <div className="daw-param-group__title">ENVELOPE &amp; TRIM</div>
          <div className="daw-param-grid">
            <TouchSlider
              label="ATTACK"
              value={pad.attack}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0}
              displayValue={`${Math.round(pad.attack * 80)} ms`}
              onChange={(v) => onUpdatePad(pad.id, { attack: v })}
            />
            <TouchSlider
              label="DECAY"
              value={pad.decay}
              min={0.05}
              max={1}
              step={0.01}
              defaultValue={0.45}
              displayValue={`${decayMs} ms`}
              onChange={(v) => onUpdatePad(pad.id, { decay: v })}
            />
            <TouchSlider
              label="TRIM START"
              value={pad.trimStart}
              min={0}
              max={Math.max(0.05, pad.trimEnd - 0.08)}
              step={0.01}
              defaultValue={0}
              displayValue={`${Math.round(pad.trimStart * 100)}%`}
              onChange={(v) => onUpdatePad(pad.id, { trimStart: v })}
            />
            <TouchSlider
              label="TRIM END"
              value={pad.trimEnd}
              min={Math.min(0.95, pad.trimStart + 0.08)}
              max={1}
              step={0.01}
              defaultValue={1}
              displayValue={`${Math.round(pad.trimEnd * 100)}%`}
              onChange={(v) => onUpdatePad(pad.id, { trimEnd: v })}
            />
          </div>
        </div>

        {/* Section 3: ZDF Filter & Color */}
        <div className="daw-param-group">
          <div className="daw-param-group__header">
            <span className="daw-param-group__title">FILTER &amp; COLOR</span>
            <div className="daw-seg-control">
              {(['lp', 'hp', 'bp'] as FilterMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={pad.filterMode === m ? 'is-active' : ''}
                  onClick={() => onUpdatePad(pad.id, { filterMode: m })}
                >
                  {m.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="daw-param-grid">
            <TouchSlider
              label="CUTOFF"
              value={pad.filterCutoff}
              min={0.04}
              max={1}
              step={0.01}
              defaultValue={0.96}
              displayValue={filterLabel}
              onChange={(v) => onUpdatePad(pad.id, { filterCutoff: v })}
            />
            <TouchSlider
              label="RESONANCE"
              value={pad.filterRes}
              min={0}
              max={0.92}
              step={0.01}
              defaultValue={0.08}
              displayValue={`${Math.round(pad.filterRes * 100)}%`}
              onChange={(v) => onUpdatePad(pad.id, { filterRes: v })}
            />
            <TouchSlider
              label="ANALOG DRIVE"
              value={pad.drive}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.08}
              accent="#f97316"
              displayValue={`${Math.round(pad.drive * 100)}%`}
              onChange={(v) => onUpdatePad(pad.id, { drive: v })}
            />
            <TouchSlider
              label="LO-FI CRUSH"
              value={pad.crush}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0}
              accent="#06b6d4"
              displayValue={`${Math.round(pad.crush * 100)}%`}
              onChange={(v) => onUpdatePad(pad.id, { crush: v })}
            />
          </div>
        </div>

        {/* Section 4: Channel & FX Sends */}
        <div className="daw-param-group">
          <div className="daw-param-group__title">CHANNEL &amp; FX SENDS</div>
          <div className="daw-param-grid">
            <TouchSlider
              label="LEVEL"
              value={pad.volume}
              min={0}
              max={1.2}
              step={0.01}
              defaultValue={0.88}
              accent="#10b981"
              displayValue={`${Math.round(pad.volume * 100)}%`}
              onChange={(v) => onUpdatePad(pad.id, { volume: v })}
            />
            <TouchSlider
              label="PAN"
              value={pad.pan}
              min={-1}
              max={1}
              step={0.02}
              defaultValue={0}
              bipolar
              displayValue={
                Math.abs(pad.pan) < 0.04
                  ? 'CENTER'
                  : pad.pan < 0
                  ? `L ${Math.round(-pad.pan * 100)}`
                  : `R ${Math.round(pad.pan * 100)}`
              }
              onChange={(v) => onUpdatePad(pad.id, { pan: v })}
            />
            <TouchSlider
              label="REVERB SEND"
              value={pad.reverbSend}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0.08}
              accent="#06b6d4"
              displayValue={`${Math.round(pad.reverbSend * 100)}%`}
              onChange={(v) => onUpdatePad(pad.id, { reverbSend: v })}
            />
            <TouchSlider
              label="DELAY SEND"
              value={pad.delaySend}
              min={0}
              max={1}
              step={0.01}
              defaultValue={0}
              accent="#eab308"
              displayValue={`${Math.round(pad.delaySend * 100)}%`}
              onChange={(v) => onUpdatePad(pad.id, { delaySend: v })}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
