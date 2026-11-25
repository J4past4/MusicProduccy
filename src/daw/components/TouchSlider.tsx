import React, { useRef } from 'react';

interface TouchSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  displayValue?: string;
  bipolar?: boolean;
  accent?: string;
  compact?: boolean;
  onChange: (value: number) => void;
}

export const TouchSlider: React.FC<TouchSliderProps> = ({
  label,
  value,
  min,
  max,
  step = 0.01,
  defaultValue,
  displayValue,
  bipolar = false,
  accent,
  compact = false,
  onChange,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<number>(0);

  const clampAndStep = (raw: number) => {
    const clamped = Math.max(min, Math.min(max, raw));
    if (step > 0) {
      const snapped = Math.round((clamped - min) / step) * step + min;
      return Number(snapped.toFixed(4));
    }
    return clamped;
  };

  const updateFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const norm = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    onChange(clampAndStep(min + norm * (max - min)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const now = performance.now();
    if (defaultValue !== undefined && now - lastTapRef.current < 280) {
      onChange(defaultValue);
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    updateFromClientX(e.clientX);
  };

  const norm = Math.max(0, Math.min(1, (value - min) / Math.max(0.0001, max - min)));
  const zeroNorm = bipolar ? Math.max(0, Math.min(1, (0 - min) / Math.max(0.0001, max - min))) : 0;
  const fillLeft = bipolar ? Math.min(norm, zeroNorm) * 100 : 0;
  const fillWidth = bipolar ? Math.abs(norm - zeroNorm) * 100 : norm * 100;

  return (
    <div className={`daw-slider ${compact ? 'daw-slider--compact' : ''}`}>
      <div className="daw-slider__header">
        <span className="daw-slider__label">{label}</span>
        <span className="daw-slider__val">{displayValue ?? value.toFixed(2)}</span>
      </div>
      <div
        ref={trackRef}
        className="daw-slider__track"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        role="slider"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        tabIndex={0}
      >
        {bipolar && <div className="daw-slider__center-tick" style={{ left: `${zeroNorm * 100}%` }} />}
        <div
          className="daw-slider__fill"
          style={{
            left: `${fillLeft}%`,
            width: `${fillWidth}%`,
            background: accent || 'var(--daw-amber)',
          }}
        />
        <div
          className="daw-slider__thumb"
          style={{ left: `${norm * 100}%` }}
        />
      </div>
    </div>
  );
};
