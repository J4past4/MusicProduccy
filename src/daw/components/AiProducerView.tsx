import React, { useMemo, useRef, useState } from 'react';
import {
  MELODIC_PRESET_LABELS,
  NOTE_NAMES,
  type AgentChatMessage,
  type DawProject,
  type MelodicSynthPreset,
  type MelodicTrackConfig,
  type MusicalScaleName,
} from '../types';
import { analyzeBeat, QUICK_AGENT_PROMPTS } from '../ai/beatAgent';
import { buildScaleChord } from '../audio/melodicDspCore';
import { TouchSlider } from './TouchSlider';

const PRESET_LIST: MelodicSynthPreset[] = ['pluck', 'organ', 'reese', 'pad', 'rhodes', 'acid'];
const SCALE_LIST: MusicalScaleName[] = ['minor', 'phrygian', 'dorian', 'major', 'pentatonic'];
const CHORD_DEGREES = [
  { deg: 0, label: 'I' },
  { deg: 2, label: 'III' },
  { deg: 3, label: 'IV' },
  { deg: 4, label: 'V' },
  { deg: 5, label: 'VI' },
  { deg: 6, label: 'VII' },
];

interface AiProducerViewProps {
  project: DawProject;
  messages: AgentChatMessage[];
  canUndo: boolean;
  onRunPrompt: (prompt: string) => void;
  onUndo: () => void;
  onUpdateMelodic: (patch: Partial<MelodicTrackConfig>) => void;
  onAuditionChord: (notes: number[]) => void;
}

export const AiProducerView: React.FC<AiProducerViewProps> = ({
  project,
  messages,
  canUndo,
  onRunPrompt,
  onUndo,
  onUpdateMelodic,
  onAuditionChord,
}) => {
  const [input, setInput] = useState('');
  const [subPanel, setSubPanel] = useState<'agent' | 'melodic'>('agent');
  const feedRef = useRef<HTMLDivElement>(null);

  const analysis = useMemo(() => analyzeBeat(project), [project]);
  const rootPitchClass = ((project.melodic.rootMidi % 12) + 12) % 12;

  const submitPrompt = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    onRunPrompt(clean);
    setInput('');
    window.setTimeout(() => {
      if (feedRef.current) {
        feedRef.current.scrollTop = feedRef.current.scrollHeight;
      }
    }, 30);
  };

  return (
    <section className="daw-view daw-ai-view" aria-label="AI Co-Producer Studio">
      {/* Top Mode Switcher & Live Beat Score HUD */}
      <div className="daw-ai-topbar">
        <div className="daw-seg-control">
          <button
            id="daw-ai-tab-agent"
            type="button"
            className={subPanel === 'agent' ? 'is-active' : ''}
            onClick={() => setSubPanel('agent')}
          >
            AI CO-PRODUCER
          </button>
          <button
            id="daw-ai-tab-melodic"
            type="button"
            className={subPanel === 'melodic' ? 'is-active' : ''}
            onClick={() => setSubPanel('melodic')}
          >
            MELODIC SYNTH
          </button>
        </div>

        <div className="daw-score-pill" title="Real-time Beat Mix & Groove Score">
          <span className="daw-score-pill__key">{analysis.keyLabel}</span>
          <span className="daw-score-pill__num">{analysis.score}</span>
        </div>
      </div>

      {subPanel === 'agent' ? (
        <>
          {/* Live Diagnostics Strip */}
          <div className="daw-diag-strip">
            {analysis.diagnostics.slice(0, 2).map((d) => (
              <div key={d.id} className={`daw-diag-card daw-diag-card--${d.severity}`}>
                <div className="daw-diag-card__text">
                  <strong>{d.title}</strong>
                  <span>{d.detail}</span>
                </div>
                {d.fixPrompt && (
                  <button
                    type="button"
                    className="daw-tool-btn daw-tool-btn--amber"
                    onClick={() => submitPrompt(d.fixPrompt!)}
                  >
                    FIX
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* One-Tap Producer Prompt Chips */}
          <div className="daw-chip-strip">
            {QUICK_AGENT_PROMPTS.map((item) => (
              <button
                key={item.label}
                type="button"
                className="daw-prompt-chip"
                onClick={() => submitPrompt(item.prompt)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Co-Producer Activity & Chat Feed */}
          <div ref={feedRef} className="daw-ai-feed">
            {messages.map((msg) => (
              <div key={msg.id} className={`daw-chat-msg daw-chat-msg--${msg.role}`}>
                <div className="daw-chat-msg__head">
                  <span>{msg.role === 'agent' ? 'PRODUCCY AI' : 'YOU'}</span>
                  {msg.role === 'agent' && canUndo && (
                    <button
                      type="button"
                      className="daw-chat-undo"
                      onClick={onUndo}
                    >
                      UNDO
                    </button>
                  )}
                </div>
                <p className="daw-chat-msg__text">{msg.text}</p>
                {msg.actionsApplied && msg.actionsApplied.length > 0 && (
                  <ul className="daw-chat-actions">
                    {msg.actionsApplied.map((act, i) => (
                      <li key={i}>✓ {act}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {/* Natural Language Studio Command Bar */}
          <form
            className="daw-ai-inputbar"
            onSubmit={(e) => {
              e.preventDefault();
              submitPrompt(input);
            }}
          >
            <input
              id="daw-ai-prompt-input"
              type="text"
              className="daw-ai-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Ask AI: "Dark UK drill 142bpm in F minor" or "Make 808 harder"...'
            />
            <button
              id="daw-ai-prompt-send"
              type="submit"
              className="daw-hit-btn"
              disabled={!input.trim()}
            >
              RUN
            </button>
          </form>
        </>
      ) : (
        /* MELODIC SYNTH & SCALE CHORD PAD STUDIO */
        <div className="daw-editor-scroll">
          <div className="daw-param-group">
            <div className="daw-param-group__header">
              <span className="daw-param-group__title">SYNTH ENGINE &amp; KEY LOCK</span>
              <button
                type="button"
                className={`daw-tool-btn ${project.melodic.mute ? 'daw-tool-btn--danger' : 'daw-tool-btn--amber'}`}
                onClick={() => onUpdateMelodic({ mute: !project.melodic.mute })}
              >
                {project.melodic.mute ? 'MUTED' : 'ACTIVE'}
              </button>
            </div>

            <div className="daw-wave-card__controls">
              <label className="daw-inline-select">
                <span>PRESET</span>
                <select
                  value={project.melodic.preset}
                  onChange={(e) =>
                    onUpdateMelodic({ preset: e.target.value as MelodicSynthPreset })
                  }
                >
                  {PRESET_LIST.map((p) => (
                    <option key={p} value={p}>
                      {MELODIC_PRESET_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="daw-inline-select">
                <span>KEY</span>
                <select
                  value={rootPitchClass}
                  onChange={(e) => onUpdateMelodic({ rootMidi: 48 + Number(e.target.value) })}
                >
                  {NOTE_NAMES.map((n, idx) => (
                    <option key={n} value={idx}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <label className="daw-inline-select">
                <span>SCALE</span>
                <select
                  value={project.melodic.scale}
                  onChange={(e) =>
                    onUpdateMelodic({ scale: e.target.value as MusicalScaleName })
                  }
                >
                  {SCALE_LIST.map((sc) => (
                    <option key={sc} value={sc}>
                      {sc.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Live Scale-Locked Chord Audition Pads */}
            <div className="daw-chord-pads">
              {CHORD_DEGREES.map((item) => {
                const notes = buildScaleChord(
                  project.melodic.rootMidi,
                  project.melodic.scale,
                  item.deg,
                  project.melodic.preset === 'rhodes' || project.melodic.preset === 'pad'
                );
                return (
                  <button
                    key={item.label}
                    type="button"
                    className="daw-chord-pad"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      onAuditionChord(notes);
                    }}
                  >
                    <strong>{item.label}</strong>
                    <span>{NOTE_NAMES[notes[0] % 12]}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="daw-export-btn daw-export-btn--primary"
              onClick={() =>
                submitPrompt(
                  `Compose a melodic ${project.melodic.preset} hook in ${NOTE_NAMES[rootPitchClass]} ${project.melodic.scale}`
                )
              }
            >
              AI COMPOSE {MELODIC_PRESET_LABELS[project.melodic.preset]} IN {NOTE_NAMES[rootPitchClass]} {project.melodic.scale.toUpperCase()}
            </button>
          </div>

          <div className="daw-param-group">
            <div className="daw-param-group__title">SYNTH TONE &amp; SENDS</div>
            <div className="daw-param-grid">
              <TouchSlider
                label="LEVEL"
                value={project.melodic.volume}
                min={0}
                max={1.2}
                step={0.01}
                defaultValue={0.72}
                accent="#10b981"
                displayValue={`${Math.round(project.melodic.volume * 100)}%`}
                onChange={(v) => onUpdateMelodic({ volume: v })}
              />
              <TouchSlider
                label="FILTER CUTOFF"
                value={project.melodic.cutoff}
                min={0.08}
                max={1}
                step={0.01}
                defaultValue={0.68}
                displayValue={`${Math.round(project.melodic.cutoff * 100)}%`}
                onChange={(v) => onUpdateMelodic({ cutoff: v })}
              />
              <TouchSlider
                label="DECAY / REL"
                value={project.melodic.decay}
                min={0.1}
                max={1}
                step={0.01}
                defaultValue={0.52}
                displayValue={`${Math.round(project.melodic.decay * 100)}%`}
                onChange={(v) => onUpdateMelodic({ decay: v })}
              />
              <TouchSlider
                label="DRIVE"
                value={project.melodic.drive}
                min={0}
                max={1}
                step={0.01}
                defaultValue={0.14}
                accent="#f97316"
                displayValue={`${Math.round(project.melodic.drive * 100)}%`}
                onChange={(v) => onUpdateMelodic({ drive: v })}
              />
              <TouchSlider
                label="REVERB SEND"
                value={project.melodic.reverbSend}
                min={0}
                max={1}
                step={0.01}
                defaultValue={0.28}
                accent="#06b6d4"
                displayValue={`${Math.round(project.melodic.reverbSend * 100)}%`}
                onChange={(v) => onUpdateMelodic({ reverbSend: v })}
              />
              <TouchSlider
                label="DELAY SEND"
                value={project.melodic.delaySend}
                min={0}
                max={1}
                step={0.01}
                defaultValue={0.26}
                accent="#eab308"
                displayValue={`${Math.round(project.melodic.delaySend * 100)}%`}
                onChange={(v) => onUpdateMelodic({ delaySend: v })}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
