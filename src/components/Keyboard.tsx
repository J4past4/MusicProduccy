import React, { useRef } from 'react';

interface KeyboardProps {
  baseOctave: number; // e.g., 2 => C2 (MIDI 36)
  activeNotes: Set<number>;
  pitchBend: number; // -1..1
  modWheel: number; // 0..1
  onOctaveChange: (oct: number) => void;
  onNoteOn: (midi: number, velocity?: number) => void;
  onNoteOff: (midi: number) => void;
  onPitchBendChange: (val: number) => void;
  onModWheelChange: (val: number) => void;
}

const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_MAP: Record<number, { offset: number; posIndex: number }> = {
  1: { offset: 1, posIndex: 1 },
  3: { offset: 3, posIndex: 2 },
  6: { offset: 6, posIndex: 4 },
  8: { offset: 8, posIndex: 5 },
  10: { offset: 10, posIndex: 6 },
};

const QWERTY_LABELS: Record<number, string> = {
  0: 'A',
  1: 'W',
  2: 'S',
  3: 'E',
  4: 'D',
  5: 'F',
  6: 'T',
  7: 'G',
  8: 'Y',
  9: 'H',
  10: 'U',
  11: 'J',
  12: 'K',
  13: 'O',
  14: 'L',
  15: 'P',
  16: ';',
};

export const Keyboard: React.FC<KeyboardProps> = ({
  baseOctave,
  activeNotes,
  pitchBend,
  modWheel,
  onOctaveChange,
  onNoteOn,
  onNoteOff,
  onPitchBendChange,
  onModWheelChange,
}) => {
  const pitchTrackRef = useRef<HTMLDivElement | null>(null);
  const modTrackRef = useRef<HTMLDivElement | null>(null);
  const mouseNoteRef = useRef<number | null>(null);

  const startMidi = (baseOctave + 1) * 12; // C2 = 36 when baseOctave=2
  const octavesToShow = 2.5;
  const totalWhite = 18; // C to F across 2.5 octaves

  const whiteKeys: Array<{ midi: number; semitone: number; label: string }> = [];
  const blackKeys: Array<{ midi: number; semitone: number; leftPct: number; label: string }> = [];

  let whiteIdx = 0;
  for (let oct = 0; oct < Math.ceil(octavesToShow); oct++) {
    for (let i = 0; i < WHITE_OFFSETS.length; i++) {
      if (whiteIdx >= totalWhite) break;
      const semi = oct * 12 + WHITE_OFFSETS[i];
      const midi = startMidi + semi;
      const isC = WHITE_OFFSETS[i] === 0;
      whiteKeys.push({
        midi,
        semitone: semi,
        label: QWERTY_LABELS[semi] ?? (isC ? `C${baseOctave + oct}` : ''),
      });
      whiteIdx++;
    }
  }

  for (let oct = 0; oct < Math.ceil(octavesToShow); oct++) {
    for (const key of Object.values(BLACK_MAP)) {
      const wPos = oct * 7 + key.posIndex;
      if (wPos >= totalWhite) continue;
      const semi = oct * 12 + key.offset;
      blackKeys.push({
        midi: startMidi + semi,
        semitone: semi,
        leftPct: (wPos / totalWhite) * 100,
        label: QWERTY_LABELS[semi] ?? '',
      });
    }
  }

  const handleWheelDrag = (
    e: React.PointerEvent,
    trackEl: HTMLDivElement | null,
    isPitch: boolean
  ) => {
    if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    const norm = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    if (isPitch) {
      onPitchBendChange(norm * 2 - 1);
    } else {
      onModWheelChange(norm);
    }
  };

  return (
    <section className="rack-unit" aria-label="Playable Synth Keyboard and Performance Wheels">
      <div className="rack-screw tl" />
      <div className="rack-screw tr" />
      <div className="rack-screw bl" />
      <div className="rack-screw br" />

      <div className="keyboard-dock">
        {/* Pitch & Mod Wheels */}
        <div className="wheels-box">
          <div className="wheel-col">
            <div
              ref={pitchTrackRef}
              className="wheel-track"
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                handleWheelDrag(e, pitchTrackRef.current, true);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 1) handleWheelDrag(e, pitchTrackRef.current, true);
              }}
              onPointerUp={() => onPitchBendChange(0)}
              onPointerCancel={() => onPitchBendChange(0)}
              title="Pitch Bend Wheel (Spring Return)"
            >
              <div
                className="wheel-thumb"
                style={{ bottom: `${((pitchBend + 1) / 2) * 100}%` }}
              />
            </div>
            <span className="knob-label">Pitch</span>
          </div>

          <div className="wheel-col">
            <div
              ref={modTrackRef}
              className="wheel-track"
              onPointerDown={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                handleWheelDrag(e, modTrackRef.current, false);
              }}
              onPointerMove={(e) => {
                if (e.buttons === 1) handleWheelDrag(e, modTrackRef.current, false);
              }}
              onDoubleClick={() => onModWheelChange(0)}
              title="Modulation Wheel (Double-click to reset)"
            >
              <div className="wheel-thumb" style={{ bottom: `${modWheel * 100}%` }} />
            </div>
            <span className="knob-label">Mod</span>
          </div>
        </div>

        {/* Playable Piano */}
        <div className="piano-wrap">
          <div className="piano-bar">
            <span>
              QWERTY: <strong>A–L</strong> (White) · <strong>W E T Y U O P</strong> (Black) ·{' '}
              <strong>Z / X</strong> Octave · <strong>Space</strong> Play/Stop 140 BPM
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>OCTAVE: C{baseOctave}</span>
              <button
                type="button"
                className="hw-btn"
                onClick={() => onOctaveChange(Math.max(0, baseOctave - 1))}
              >
                Oct −
              </button>
              <button
                type="button"
                className="hw-btn"
                onClick={() => onOctaveChange(Math.min(5, baseOctave + 1))}
              >
                Oct +
              </button>
            </div>
          </div>

          <div
            className="piano-keys"
            onPointerLeave={() => {
              if (mouseNoteRef.current !== null) {
                onNoteOff(mouseNoteRef.current);
                mouseNoteRef.current = null;
              }
            }}
          >
            {whiteKeys.map((wk) => (
              <div
                key={wk.midi}
                className={`key-white ${activeNotes.has(wk.midi) ? 'active' : ''}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  mouseNoteRef.current = wk.midi;
                  onNoteOn(wk.midi, 0.9);
                }}
                onPointerUp={() => {
                  onNoteOff(wk.midi);
                  mouseNoteRef.current = null;
                }}
                onPointerEnter={(e) => {
                  if (e.buttons === 1 && mouseNoteRef.current !== wk.midi) {
                    if (mouseNoteRef.current !== null) onNoteOff(mouseNoteRef.current);
                    mouseNoteRef.current = wk.midi;
                    onNoteOn(wk.midi, 0.9);
                  }
                }}
              >
                <span>{wk.label}</span>
              </div>
            ))}

            {blackKeys.map((bk) => (
              <div
                key={bk.midi}
                className={`key-black ${activeNotes.has(bk.midi) ? 'active' : ''}`}
                style={{ left: `${bk.leftPct}%` }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  mouseNoteRef.current = bk.midi;
                  onNoteOn(bk.midi, 0.92);
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  onNoteOff(bk.midi);
                  mouseNoteRef.current = null;
                }}
                onPointerEnter={(e) => {
                  if (e.buttons === 1 && mouseNoteRef.current !== bk.midi) {
                    if (mouseNoteRef.current !== null) onNoteOff(mouseNoteRef.current);
                    mouseNoteRef.current = bk.midi;
                    onNoteOn(bk.midi, 0.92);
                  }
                }}
              >
                <span>{bk.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
