import React, { useEffect, useRef } from 'react';
import { WAVEFORM_CATALOG, type PhaseMode } from '../audio/types';
import { getWavetables, sampleWavetable } from '../audio/wavetables';

interface WaveformSelectorProps {
  wave: number; // 1..32
  phaseMode: PhaseMode;
  phaseOffset: number; // 0..1
  onChange: (wave: number) => void;
}

export const WaveformSelector: React.FC<WaveformSelectorProps> = ({
  wave,
  phaseMode,
  phaseOffset,
  onChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Center line
    ctx.strokeStyle = 'rgba(92, 242, 182, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const tables = getWavetables();
    const table = tables[Math.max(0, Math.min(31, wave - 1))];

    ctx.strokeStyle = '#5cf2b6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const p = x / w;
      const s1 = sampleWavetable(table, p);
      let yVal = s1;
      if (phaseMode !== 'off') {
        const s2 = sampleWavetable(table, p + phaseOffset * 0.95);
        yVal = phaseMode === 'subtract' ? (s1 - s2) * 0.72 : s1 * s2 * 1.45;
      }
      yVal = Math.max(-1, Math.min(1, yVal));
      const y = h / 2 - yVal * (h * 0.42);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [wave, phaseMode, phaseOffset]);

  const stepWave = (dir: number) => {
    const next = ((wave - 1 + dir + 32) % 32) + 1;
    onChange(next);
  };

  return (
    <div className="wave-selector">
      <canvas ref={canvasRef} width={96} height={48} className="wave-preview-canvas" />
      <select
        className="wave-select-input"
        value={wave}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Oscillator Waveform"
      >
        {WAVEFORM_CATALOG.map((meta) => (
          <option key={meta.id} value={meta.id}>
            {String(meta.id).padStart(2, '0')} · {meta.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="wave-step-btn"
        onClick={() => stepWave(-1)}
        title="Previous Waveform"
      >
        ‹
      </button>
      <button
        type="button"
        className="wave-step-btn"
        onClick={() => stepWave(1)}
        title="Next Waveform"
      >
        ›
      </button>
    </div>
  );
};
