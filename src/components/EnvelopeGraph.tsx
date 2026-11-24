import React from 'react';

interface EnvelopeGraphProps {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  invert?: boolean;
}

export const EnvelopeGraph: React.FC<EnvelopeGraphProps> = ({
  attack,
  decay,
  sustain,
  release,
  invert = false,
}) => {
  const w = 120;
  const h = 28;
  const pad = 3;
  const usableH = h - pad * 2;

  const yOf = (val: number) => {
    const v = invert ? 1 - val : val;
    return h - pad - v * usableH;
  };

  const ax = pad + attack * 32;
  const dx = ax + decay * 32;
  const sx = dx + 22;
  const rx = Math.min(w - pad, sx + release * 28);

  const baseY = yOf(0);
  const peakY = yOf(1);
  const susY = yOf(sustain);

  const d = `M ${pad} ${baseY} L ${ax.toFixed(1)} ${peakY} L ${dx.toFixed(1)} ${susY.toFixed(1)} L ${sx.toFixed(1)} ${susY.toFixed(1)} L ${rx.toFixed(1)} ${baseY}`;

  return (
    <svg className="env-graph" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <line
        x1={pad}
        y1={baseY}
        x2={w - pad}
        y2={baseY}
        stroke="rgba(92,242,182,0.14)"
        strokeWidth="1"
      />
      <path d={d} fill="none" stroke={invert ? '#ff7a1f' : '#5cf2b6'} strokeWidth="1.7" />
    </svg>
  );
};
