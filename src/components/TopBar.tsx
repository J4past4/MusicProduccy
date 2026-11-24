import React, { useRef } from 'react';
import type { SubtractorPatch } from '../audio/types';
import type { MidiStatus } from '../audio/synthEngine';
import { LcdDisplay } from './LcdDisplay';
import { Knob } from './Knob';

interface TopBarProps {
  patch: SubtractorPatch;
  presets: SubtractorPatch[];
  midiStatus: MidiStatus;
  statusText: string;
  getAnalyser: () => AnalyserNode | null;
  onSelectPreset: (id: string) => void;
  onStepPreset: (dir: number) => void;
  onInitPatch: () => void;
  onMutatePatch: () => void;
  onSaveUserPatch: () => void;
  onExportPatchJson: () => void;
  onImportPatchJson: (jsonText: string) => void;
  onExportWavLoop: () => void;
  onExportWavShot: () => void;
  onMasterLevelChange: (val: number) => void;
  onPanic: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  patch,
  presets,
  midiStatus,
  statusText,
  getAnalyser,
  onSelectPreset,
  onStepPreset,
  onInitPatch,
  onMutatePatch,
  onSaveUserPatch,
  onExportPatchJson,
  onImportPatchJson,
  onExportWavLoop,
  onExportWavShot,
  onMasterLevelChange,
  onPanic,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onImportPatchJson(reader.result);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <header className="top-bar">
      <div className="brand-block">
        <h1 className="brand-title">
          SUBTRAKTOR <span className="brand-badge">UK-140</span>
        </h1>
        <span className="brand-sub">Polyphonic Subtractive Bassline Synth</span>
      </div>

      <div className="patch-browser">
        <div className="patch-row">
          <button
            type="button"
            className="hw-btn icon-only"
            onClick={() => onStepPreset(-1)}
            title="Previous Preset"
          >
            ◀
          </button>
          <select
            className="patch-select"
            value={presets.some((p) => p.id === patch.id) ? patch.id : '__custom__'}
            onChange={(e) => {
              if (e.target.value !== '__custom__') onSelectPreset(e.target.value);
            }}
            aria-label="Select Synth Preset"
          >
            {!presets.some((p) => p.id === patch.id) && (
              <option value="__custom__">* {patch.name}</option>
            )}
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.category}] {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="hw-btn icon-only"
            onClick={() => onStepPreset(1)}
            title="Next Preset"
          >
            ▶
          </button>
          <button
            type="button"
            className="hw-btn primary"
            onClick={onMutatePatch}
            title="Generate a fresh UK Bassline patch variation"
          >
            Mutate
          </button>
        </div>

        <div className="patch-meta">
          <span className="patch-artist-ref">REF: {patch.artistRef}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="hw-btn" onClick={onInitPatch}>
              Init
            </button>
            <button type="button" className="hw-btn" onClick={onSaveUserPatch}>
              Save
            </button>
            <button type="button" className="hw-btn" onClick={onExportPatchJson}>
              JSON
            </button>
            <button
              type="button"
              className="hw-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              Load
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>

      <LcdDisplay getAnalyser={getAnalyser} statusText={statusText} />

      <div className="top-right-controls">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              className="hw-btn primary"
              onClick={onExportWavLoop}
              title="Export 2-bar 140 BPM Bassline Loop as 16-bit WAV"
            >
              WAV Loop
            </button>
            <button
              type="button"
              className="hw-btn"
              onClick={onExportWavShot}
              title="Export Single F1 Bass One-Shot as 16-bit WAV"
            >
              WAV Shot
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <div className="midi-pill" title={midiStatus.connectedDevices.join(', ') || 'No MIDI Device'}>
              <span
                className={`led-dot green ${midiStatus.connectedDevices.length > 0 ? 'on' : ''}`}
              />
              <span>
                {midiStatus.connectedDevices.length > 0
                  ? `MIDI (${midiStatus.connectedDevices.length})`
                  : 'MIDI'}
              </span>
            </div>
            <button type="button" className="hw-btn" onClick={onPanic} title="All Notes Off / Panic">
              Panic
            </button>
          </div>
        </div>

        <Knob
          label="Master"
          value={patch.masterLevel}
          defaultValue={0.85}
          size={42}
          onChange={onMasterLevelChange}
        />
      </div>
    </header>
  );
};
