import React, { useRef } from 'react';

interface TransportBarProps {
  isPlaying: boolean;
  isRecording: boolean;
  bpm: number;
  metronomeOn: boolean;
  canUndo: boolean;
  canRedo: boolean;
  masterL: number;
  masterR: number;
  phoneFrame: boolean;
  onTogglePlay: () => void;
  onStop: () => void;
  onToggleRecord: () => void;
  onBpmChange: (bpm: number) => void;
  onTapTempo: () => void;
  onToggleMetronome: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePhoneFrame: () => void;
  onSwitchToSynth: () => void;
}

export const TransportBar: React.FC<TransportBarProps> = ({
  isPlaying,
  isRecording,
  bpm,
  metronomeOn,
  canUndo,
  canRedo,
  masterL,
  masterR,
  phoneFrame,
  onTogglePlay,
  onStop,
  onToggleRecord,
  onBpmChange,
  onTapTempo,
  onToggleMetronome,
  onUndo,
  onRedo,
  onTogglePhoneFrame,
  onSwitchToSynth,
}) => {
  const dragStartY = useRef<number | null>(null);
  const dragStartBpm = useRef<number>(bpm);

  const handleBpmPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartY.current = e.clientY;
    dragStartBpm.current = bpm;
  };

  const handleBpmPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragStartY.current === null || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dy = dragStartY.current - e.clientY;
    if (Math.abs(dy) > 3) {
      const next = Math.max(50, Math.min(220, Math.round(dragStartBpm.current + dy * 0.45)));
      if (next !== bpm) onBpmChange(next);
    }
  };

  const handleBpmPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragStartY.current !== null && Math.abs(e.clientY - dragStartY.current) <= 4) {
      onTapTempo();
    }
    dragStartY.current = null;
  };

  return (
    <header className="daw-transport">
      <div className="daw-transport__left">
        <button
          id="daw-btn-stop"
          type="button"
          className="daw-tbtn daw-tbtn--stop"
          onClick={onStop}
          title="Stop (Reset to start)"
          aria-label="Stop"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <rect x="2" y="2" width="8" height="8" rx="1.2" />
          </svg>
        </button>

        <button
          id="daw-btn-play"
          type="button"
          className={`daw-tbtn daw-tbtn--play ${isPlaying ? 'is-active' : ''}`}
          onClick={onTogglePlay}
          title="Play / Pause (Space)"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
              <rect x="2.5" y="2" width="3.2" height="10" rx="0.8" />
              <rect x="8.3" y="2" width="3.2" height="10" rx="0.8" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
              <path d="M3.2 2.2L11.8 7L3.2 11.8V2.2Z" />
            </svg>
          )}
        </button>

        <button
          id="daw-btn-rec"
          type="button"
          className={`daw-tbtn daw-tbtn--rec ${isRecording ? 'is-active' : ''}`}
          onClick={onToggleRecord}
          title="Live Record Overdub"
          aria-label="Record"
        >
          <span className="daw-rec-dot" />
        </button>

        <button
          id="daw-btn-bpm"
          type="button"
          className="daw-bpm-pill"
          onPointerDown={handleBpmPointerDown}
          onPointerMove={handleBpmPointerMove}
          onPointerUp={handleBpmPointerUp}
          title="Tap for Tempo · Drag vertically to adjust BPM"
        >
          <span className="daw-bpm-pill__num">{bpm}</span>
          <span className="daw-bpm-pill__unit">BPM</span>
        </button>
      </div>

      <div className="daw-transport__right">
        <button
          id="daw-btn-metro"
          type="button"
          className={`daw-icon-btn ${metronomeOn ? 'is-on' : ''}`}
          onClick={onToggleMetronome}
          title="Metronome Click"
          aria-label="Metronome"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4.5 14L7 2.5H9L11.5 14H4.5Z" />
            <path d="M8 11.5L12.5 5" strokeLinecap="round" />
          </svg>
        </button>

        <button
          id="daw-btn-undo"
          type="button"
          className="daw-icon-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M4 6.5H10.5C12.2 6.5 13.5 7.8 13.5 9.5C13.5 11.2 12.2 12.5 10.5 12.5H7" strokeLinecap="round" />
            <path d="M6.5 4L3.8 6.5L6.5 9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          id="daw-btn-redo"
          type="button"
          className="daw-icon-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M12 6.5H5.5C3.8 6.5 2.5 7.8 2.5 9.5C2.5 11.2 3.8 12.5 5.5 12.5H9" strokeLinecap="round" />
            <path d="M9.5 4L12.2 6.5L9.5 9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Stereo Master Peak Meter */}
        <div className="daw-mini-meter" title="Master Output L/R">
          <div className="daw-mini-meter__bar">
            <div
              className="daw-mini-meter__fill"
              style={{ width: `${Math.min(100, masterL * 100)}%` }}
            />
          </div>
          <div className="daw-mini-meter__bar">
            <div
              className="daw-mini-meter__fill"
              style={{ width: `${Math.min(100, masterR * 100)}%` }}
            />
          </div>
        </div>

        <button
          id="daw-btn-synth-switch"
          type="button"
          className="daw-pill-btn"
          onClick={onSwitchToSynth}
          title="Open Built-In SUBTRAKTOR-140 Bass Synth"
        >
          SYNTH
        </button>

        <button
          id="daw-btn-frame-toggle"
          type="button"
          className="daw-pill-btn daw-desktop-only"
          onClick={onTogglePhoneFrame}
          title={phoneFrame ? 'Expand to Studio Wide View' : 'Preview Phone Layout'}
        >
          {phoneFrame ? 'WIDE' : 'PHONE'}
        </button>
      </div>
    </header>
  );
};
