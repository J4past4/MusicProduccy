import React, { useRef } from 'react';

interface FaderProps {
  label: string;
  value: number; // 0..1
  defaultValue?: number;
  height?: number;
  displayValue?: string;
  onChange: (val: number) => void;
}

export const Fader: React.FC<FaderProps> = ({
  label,
  value,
  defaultValue = 0.5,
  height = 76,
  displayValue,
  onChange,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const updateFromClientY = (clientY: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const norm = 1 - (clientY - rect.top) / rect.height;
    onChange(Math.max(0, Math.min(1, norm)));
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateFromClientY(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    updateFromClientY(e.clientY);
  };

  const handlePointerUp = () => {
    dragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const step = e.shiftKey ? 0.01 : 0.035;
    onChange(Math.max(0, Math.min(1, value + dir * step)));
  };

  const pct = Math.max(0, Math.min(1, value)) * 100;

  return (
    <div
      className="fader-wrap"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onDoubleClick={() => onChange(defaultValue)}
      title={`${label}: ${displayValue ?? `${Math.round(pct)}%`}`}
    >
      <div className="fader-track" ref={trackRef} style={{ height }}>
        <div className="fader-fill" style={{ height: `calc(${pct}% - 2px)` }} />
        <div className="fader-cap" style={{ bottom: `${pct}%` }} />
      </div>
      <span className="knob-label">{label}</span>
      {displayValue !== undefined && <span className="knob-val">{displayValue}</span>}
    </div>
  );
};
