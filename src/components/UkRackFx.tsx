import React from 'react';
import type { DriveType, SubtractorPatch } from '../audio/types';
import { Knob } from './Knob';
import { LedButton } from './LedButton';

interface UkRackFxProps {
  patch: SubtractorPatch;
  onChange: <K extends keyof SubtractorPatch>(key: K, val: SubtractorPatch[K]) => void;
}

const DRIVE_TYPES: Array<{ id: DriveType; label: string }> = [
  { id: 'tube', label: 'Tube' },
  { id: 'tape', label: 'Tape' },
  { id: 'fold', label: 'Fold' },
  { id: 'fuzz', label: 'Fuzz' },
];

export const UkRackFx: React.FC<UkRackFxProps> = ({ patch, onChange }) => {
  return (
    <section className="rack-unit" aria-label="UK Bassline Combinator Rack FX">
      <div className="rack-screw tl" />
      <div className="rack-screw tr" />
      <div className="rack-screw bl" />
      <div className="rack-screw br" />

      <div className="module-header" style={{ marginBottom: 6 }}>
        <span className="module-title">UK Bassline Combinator FX Rack</span>
        <span className="module-tag">Mono Sub Reinforcer · Scream-4 Drive · UN-16 Chorus · 4x4 Pump</span>
      </div>

      <div className="fx-strip">
        {/* Mono Sub Layer */}
        <div className="module-box">
          <div className="module-header">
            <span className="module-title">Mono Sub Layer</span>
            <LedButton
              label={patch.fxSubOn ? 'On' : 'Off'}
              active={patch.fxSubOn}
              onClick={() => onChange('fxSubOn', !patch.fxSubOn)}
            />
          </div>
          <div className="ctrl-row">
            <Knob
              label="Sub Lvl"
              value={patch.fxSubLevel}
              defaultValue={0.55}
              onChange={(v) => onChange('fxSubLevel', v)}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
              <span className="knob-label">Octave</span>
              <div className="seg-group">
                <button
                  type="button"
                  className={`seg-btn ${patch.fxSubOctave === 0 ? 'active' : ''}`}
                  onClick={() => onChange('fxSubOctave', 0)}
                >
                  0
                </button>
                <button
                  type="button"
                  className={`seg-btn ${patch.fxSubOctave === -1 ? 'active' : ''}`}
                  onClick={() => onChange('fxSubOctave', -1)}
                >
                  -1
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scream-4 Inspired Drive */}
        <div className="module-box">
          <div className="module-header">
            <span className="module-title">Scream Drive</span>
            <LedButton
              label={patch.fxDriveOn ? 'On' : 'Off'}
              active={patch.fxDriveOn}
              color="red"
              onClick={() => onChange('fxDriveOn', !patch.fxDriveOn)}
            />
          </div>
          <div className="seg-group">
            {DRIVE_TYPES.map((dt) => (
              <button
                key={dt.id}
                type="button"
                className={`seg-btn ${patch.fxDriveType === dt.id ? 'active' : ''}`}
                onClick={() => onChange('fxDriveType', dt.id)}
              >
                {dt.label}
              </button>
            ))}
          </div>
          <div className="ctrl-row">
            <Knob
              label="Drive"
              value={patch.fxDriveAmount}
              defaultValue={0.3}
              onChange={(v) => onChange('fxDriveAmount', v)}
            />
            <Knob
              label="Tone"
              value={patch.fxDriveTone}
              defaultValue={0.75}
              onChange={(v) => onChange('fxDriveTone', v)}
            />
          </div>
        </div>

        {/* Stereo Unison Chorus */}
        <div className="module-box">
          <div className="module-header">
            <span className="module-title">Unison Chorus</span>
            <LedButton
              label={patch.fxChorusOn ? 'On' : 'Off'}
              active={patch.fxChorusOn}
              onClick={() => onChange('fxChorusOn', !patch.fxChorusOn)}
            />
          </div>
          <div className="ctrl-row">
            <Knob
              label="Mix"
              value={patch.fxChorusMix}
              defaultValue={0.32}
              onChange={(v) => onChange('fxChorusMix', v)}
            />
            <Knob
              label="Rate"
              value={patch.fxChorusRate}
              defaultValue={0.3}
              onChange={(v) => onChange('fxChorusRate', v)}
            />
          </div>
        </div>

        {/* 4x4 Kick Sidechain Pump */}
        <div className="module-box">
          <div className="module-header">
            <span className="module-title">4x4 Sidechain</span>
            <span className="module-tag">Club Duck</span>
          </div>
          <div className="ctrl-row">
            <Knob
              label="Pump"
              value={patch.fxSidechainAmount}
              defaultValue={0.35}
              displayValue={`${Math.round(patch.fxSidechainAmount * 100)}%`}
              onChange={(v) => onChange('fxSidechainAmount', v)}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
