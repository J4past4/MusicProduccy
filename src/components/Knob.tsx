import React, { useRef } from 'react';

interface KnobProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  bipolar?: boolean;
  size?: number;
  displayValue?: string;
  onChange: (val: number) => void;
}

export const Knob: React.FC<KnobProps> = ({
  label,
  value,
  min = 0,
  max = 1,
  step,
  defaultValue,
  bipolar = false,
  size = 38,
  displayValue,
  onChange,
}) => {
  const dragRef = useRef<{ startY: number; startVal: number } | null>(null);

  const clampVal = (v: number) => {
    let clamped = Math.max(min, Math.min(max, v));
    if (step) {
      clamped = Math.round(clamped / step) * step;
    }
    return clamped;
  };

  const norm = (value - min) / (max - min || 1);
  const startAngle = -135;
  const endAngle = 135;
  const angle = startAngle + norm * (endAngle - startAngle);

  const r = size * 0.42;
  const cx = size / 2;
  const cy = size / 2;

  const polar = (deg: number, radius: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  };

  const arcPath = (a1: number, a2: number, radius: number) => {
    const p1 = polar(a1, radius);
    const p2 = polar(a2, radius);
    const largeArc = Math.abs(a2 - a1) > 180 ? 1 : 0;
    const sweep = a2 >= a1 ? 1 : 0;
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArc} ${sweep} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  };

  const activeStart = bipolar ? 0 : startAngle;
  const showActiveArc = Math.abs(angle - activeStart) > 1.5;

  const pointerTip = polar(angle, r * 0.72);
  const pointerBase = polar(angle, r * 0.25);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startVal: value };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    const sensitivity = e.shiftKey ? 450 : 150;
    const delta = (dy / sensitivity) * (max - min);
    onChange(clampVal(dragRef.current.startVal + delta));
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const inc = step ?? (max - min) / (e.shiftKey ? 100 : 32);
    onChange(clampVal(value + dir * inc));
  };

  const handleDoubleClick = () => {
    const def = defaultValue ?? (bipolar ? (min + max) / 2 : min);
    onChange(clampVal(def));
  };

  const formatted =
    displayValue ??
    (step && step >= 1 ? String(Math.round(value)) : `${Math.round(norm * 100)}`);

  return (
    <div
      className="knob-wrap"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      title={`${label}: ${formatted} (Drag vertically, Shift=fine, Double-click=reset)`}
    >
      <svg className="knob-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background Track Arc */}
        <path
          d={arcPath(startAngle, endAngle, r + 3.5)}
          fill="none"
          stroke="#11161c"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        {/* Active Value Arc */}
        {showActiveArc && (
          <path
            d={arcPath(activeStart, angle, r + 3.5)}
            fill="none"
            stroke="#ff7a1f"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
        )}
        {/* Outer Knurled Bevel */}
        <circle cx={cx} cy={cy} r={r} fill="#14181e" stroke="#465364" strokeWidth="1" />
        {/* Inner Cap */}
        <circle cx={cx} cy={cy} r={r * 0.78} fill="#28303a" stroke="#101419" strokeWidth="1" />
        {/* Indicator Notch */}
        <line
          x1={pointerBase.x}
          y1={pointerBase.y}
          x2={pointerTip.x}
          y2={pointerTip.y}
          stroke="#f3f7fb"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      </svg>
      <span className="knob-label">{label}</span>
      {displayValue !== undefined && <span className="knob-val">{displayValue}</span>}
    </div>
  );
};
