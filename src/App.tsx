import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LFO_SYNC_DIVISIONS,
  type Filter1Type,
  type Lfo1Dest,
  type Lfo1Waveform,
  type Lfo2Dest,
  type ModEnvDest,
  type PhaseMode,
  type SequencerStep,
  type SubtractorPatch,
} from './audio/types';
import { filterNormToHz } from './audio/dspCore';
import { SubtraktorSynthEngine, type MidiStatus } from './audio/synthEngine';
import type { DrumGroove } from './audio/drumEngine';
import { downloadWav, renderOneShotToWav, renderPatternToWav } from './audio/wavExport';
import { FACTORY_PRESETS, INIT_PATCH, mutateBassPatch } from './data/presets';
import { UK_BASS_PATTERNS } from './data/patterns';

import { TopBar } from './components/TopBar';
import { Knob } from './components/Knob';
import { Fader } from './components/Fader';
import { LedButton } from './components/LedButton';
import { WaveformSelector } from './components/WaveformSelector';
import { EnvelopeGraph } from './components/EnvelopeGraph';
import { UkRackFx } from './components/UkRackFx';
import { SequencerDock } from './components/SequencerDock';
import { Keyboard } from './components/Keyboard';

const USER_PRESETS_KEY = 'subtraktor140_user_presets_v1';

const QWERTY_SEMITONE_MAP: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ';': 16,
};

function formatHz(norm: number): string {
  const hz = filterNormToHz(norm);
  return hz >= 1000 ? `${(hz / 1000).toFixed(1)}k` : `${Math.round(hz)}Hz`;
}

function formatLfo1Rate(rate: number, sync: boolean): string {
  if (sync) {
    const idx = Math.max(
      0,
      Math.min(LFO_SYNC_DIVISIONS.length - 1, Math.round(rate * (LFO_SYNC_DIVISIONS.length - 1)))
    );
    return LFO_SYNC_DIVISIONS[idx].label;
  }
  const hz = 0.08 * Math.pow(32 / 0.08, rate);
  return `${hz.toFixed(1)}Hz`;
}

function loadUserPresets(): SubtractorPatch[] {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function App() {
  const [userPresets, setUserPresets] = useState<SubtractorPatch[]>(() => loadUserPresets());
  const allPresets = useMemo(() => [...FACTORY_PRESETS, ...userPresets], [userPresets]);

  const [patch, setPatch] = useState<SubtractorPatch>(FACTORY_PRESETS[0]);
  const [statusText, setStatusText] = useState<string>('140 BPM · READY');
  const [showVelocity, setShowVelocity] = useState<boolean>(false);

  // Sequencer & Drum state
  const [selectedPatternId, setSelectedPatternId] = useState<string>(UK_BASS_PATTERNS[0].id);
  const [steps, setSteps] = useState<SequencerStep[]>(() =>
    UK_BASS_PATTERNS[0].steps.map((s) => ({ ...s }))
  );
  const [bpm, setBpm] = useState<number>(UK_BASS_PATTERNS[0].bpm);
  const [swing, setSwing] = useState<number>(UK_BASS_PATTERNS[0].swing);
  const [drumGroove, setDrumGroove] = useState<DrumGroove>(UK_BASS_PATTERNS[0].drumGroove);
  const [drumVolume, setDrumVolume] = useState<number>(0.65);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(-1);

  // Keyboard & Performance state
  const [baseOctave, setBaseOctave] = useState<number>(2); // C2 = MIDI 36 (prime UK bass range!)
  const [activeNotes, setActiveNotes] = useState<Set<number>>(() => new Set());
  const [pitchBend, setPitchBend] = useState<number>(0);
  const [modWheel, setModWheel] = useState<number>(0);
  const [midiStatus, setMidiStatus] = useState<MidiStatus>({
    supported: false,
    connectedDevices: [],
    lastActivity: 0,
  });

  const [engine] = useState<SubtraktorSynthEngine>(() => new SubtraktorSynthEngine(FACTORY_PRESETS[0]));
  const engineRef = useRef<SubtraktorSynthEngine>(engine);
  const pressedKeysRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const engine = engineRef.current!;
    engine.setSequencerSteps(steps);
    engine.setStepChangeCallback((stepIdx) => setCurrentStep(stepIdx));
    engine.setBpm(bpm);
    engine.setSwing(swing);
    engine.setDrumGroove(drumGroove);
    engine.setDrumVolume(drumVolume);

    void engine.initMidi(
      (note, on) => {
        setActiveNotes((prev) => {
          const next = new Set(prev);
          if (on) next.add(note);
          else next.delete(note);
          return next;
        });
      },
      (st) => setMidiStatus(st),
      (type, val) => {
        if (type === 'pitch') setPitchBend(val);
        else setModWheel(val);
      }
    );

    return () => {
      engine.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setSequencerSteps(steps);
  }, [steps]);

  const updateParam = useCallback(
    <K extends keyof SubtractorPatch>(key: K, val: SubtractorPatch[K]) => {
      setPatch((prev) => ({ ...prev, [key]: val }));
      engineRef.current?.setParam(key, val);
    },
    []
  );

  const loadPatch = useCallback((nextPatch: SubtractorPatch, note?: string) => {
    const copy = { ...nextPatch };
    setPatch(copy);
    engineRef.current?.setPatch(copy);
    setStatusText(note ?? `${copy.name.toUpperCase()}`);
  }, []);

  const handleSelectPreset = useCallback(
    (id: string) => {
      const found = allPresets.find((p) => p.id === id);
      if (found) loadPatch(found);
    },
    [allPresets, loadPatch]
  );

  const handleStepPreset = useCallback(
    (dir: number) => {
      const idx = allPresets.findIndex((p) => p.id === patch.id);
      const nextIdx =
        idx === -1 ? 0 : (idx + dir + allPresets.length) % allPresets.length;
      loadPatch(allPresets[nextIdx]);
    },
    [allPresets, patch.id, loadPatch]
  );

  const handleMutatePatch = useCallback(() => {
    const mutated = mutateBassPatch(patch);
    loadPatch(mutated, `MUTATED · ${mutated.name.toUpperCase()}`);
  }, [patch, loadPatch]);

  const handleSaveUserPatch = useCallback(() => {
    const customName = window.prompt('Save patch name:', patch.name);
    if (!customName || !customName.trim()) return;
    const saved: SubtractorPatch = {
      ...patch,
      id: `user-${Date.now()}`,
      name: customName.trim(),
      artistRef: 'User Patch',
    };
    const nextList = [...userPresets, saved];
    setUserPresets(nextList);
    try {
      localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(nextList));
    } catch {
      // ignore quota error
    }
    loadPatch(saved, `SAVED · ${saved.name.toUpperCase()}`);
  }, [patch, userPresets, loadPatch]);

  const handleExportPatchJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${patch.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.subtraktor.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatusText('EXPORTED PATCH JSON');
  }, [patch]);

  const handleImportPatchJson = useCallback(
    (jsonText: string) => {
      try {
        const parsed = JSON.parse(jsonText) as Partial<SubtractorPatch>;
        const merged: SubtractorPatch = {
          ...INIT_PATCH,
          ...parsed,
          id: `imported-${Date.now()}`,
        };
        loadPatch(merged, `LOADED · ${merged.name.toUpperCase()}`);
      } catch {
        setStatusText('INVALID PATCH JSON');
      }
    },
    [loadPatch]
  );

  const handleExportWavLoop = useCallback(() => {
    setStatusText('RENDERING 2-BAR WAV...');
    setTimeout(() => {
      const buf = renderPatternToWav(patch, steps, bpm, swing, 2, 44100);
      const slug = patch.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      downloadWav(buf, `subtraktor140-${slug}-${bpm}bpm-loop.wav`);
      setStatusText(`EXPORTED ${bpm}BPM WAV LOOP`);
    }, 10);
  }, [patch, steps, bpm, swing]);

  const handleExportWavShot = useCallback(() => {
    setStatusText('RENDERING F1 ONE-SHOT...');
    setTimeout(() => {
      const buf = renderOneShotToWav(patch, 41, 1.5, bpm, 44100);
      const slug = patch.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      downloadWav(buf, `subtraktor140-${slug}-F1-oneshot.wav`);
      setStatusText('EXPORTED F1 WAV SHOT');
    }, 10);
  }, [patch, bpm]);

  const handleTogglePlay = useCallback(async () => {
    const engine = engineRef.current!;
    if (isPlaying) {
      engine.stopSequencer();
      setIsPlaying(false);
      setStatusText('SEQUENCER STOPPED');
    } else {
      await engine.startSequencer();
      setIsPlaying(true);
      setStatusText(`PLAYING · ${bpm} BPM ${drumGroove.toUpperCase()}`);
    }
  }, [isPlaying, bpm, drumGroove]);

  const handleSelectPattern = useCallback((id: string) => {
    const pat = UK_BASS_PATTERNS.find((p) => p.id === id);
    if (!pat) return;
    setSelectedPatternId(pat.id);
    setSteps(pat.steps.map((s) => ({ ...s })));
    setBpm(pat.bpm);
    setSwing(pat.swing);
    setDrumGroove(pat.drumGroove);
    engineRef.current?.setBpm(pat.bpm);
    engineRef.current?.setSwing(pat.swing);
    engineRef.current?.setDrumGroove(pat.drumGroove);
    setStatusText(`GROOVE · ${pat.name.toUpperCase()}`);
  }, []);

  const handleNoteOn = useCallback((midi: number, velocity = 0.9) => {
    void engineRef.current?.noteOn(midi, velocity);
    setActiveNotes((prev) => {
      const next = new Set(prev);
      next.add(midi);
      return next;
    });
  }, []);

  const handleNoteOff = useCallback((midi: number) => {
    engineRef.current?.noteOff(midi);
    setActiveNotes((prev) => {
      if (!prev.has(midi)) return prev;
      const next = new Set(prev);
      next.delete(midi);
      return next;
    });
  }, []);

  // Global QWERTY Synth Keyboard & Spacebar Play/Stop
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.repeat) return;

      if (e.code === 'Space') {
        e.preventDefault();
        void handleTogglePlay();
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'z') {
        setBaseOctave((o) => Math.max(0, o - 1));
        return;
      }
      if (key === 'x') {
        setBaseOctave((o) => Math.min(5, o + 1));
        return;
      }

      const semi = QWERTY_SEMITONE_MAP[key];
      if (semi !== undefined && !pressedKeysRef.current.has(key)) {
        const midi = (baseOctave + 1) * 12 + semi;
        pressedKeysRef.current.set(key, midi);
        handleNoteOn(midi, 0.9);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const midi = pressedKeysRef.current.get(key);
      if (midi !== undefined) {
        pressedKeysRef.current.delete(key);
        handleNoteOff(midi);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [baseOctave, handleNoteOn, handleNoteOff, handleTogglePlay]);

  const handleRandomizeSteps = useCallback(() => {
    // UK Bassline F minor pentatonic: F1, Ab1, Bb1, C2, Eb2, F2
    const scale = [41, 41, 41, 44, 46, 48, 51, 53];
    const next: SequencerStep[] = Array.from({ length: 16 }, (_, i) => {
      const prob = i % 4 === 0 ? 0.72 : i % 2 === 0 ? 0.42 : 0.48;
      const active = Math.random() < prob;
      return {
        active,
        note: scale[Math.floor(Math.random() * scale.length)],
        velocity: 0.78 + Math.random() * 0.2,
        slide: active && Math.random() < 0.28,
        accent: active && Math.random() < 0.35,
      };
    });
    next[0].active = true;
    next[0].note = 41;
    setSteps(next);
    setStatusText('GENERATED UK GROOVE');
  }, []);

  const getAnalyser = useCallback(() => engineRef.current?.getAnalyser() ?? null, []);

  return (
    <main className="rack-shell">
      {/* ===================================================================
          RACK UNIT 1: MAIN SUBTRAKTOR-140 SYNTHESIZER FACEPLATE
         =================================================================== */}
      <section className="rack-unit" aria-label="SUBTRAKTOR-140 Main Synthesizer Faceplate">
        <div className="rack-screw tl" />
        <div className="rack-screw tr" />
        <div className="rack-screw bl" />
        <div className="rack-screw br" />

        <TopBar
          patch={patch}
          presets={allPresets}
          midiStatus={midiStatus}
          statusText={statusText}
          getAnalyser={getAnalyser}
          onSelectPreset={handleSelectPreset}
          onStepPreset={handleStepPreset}
          onInitPatch={() => loadPatch(INIT_PATCH, 'INIT PATCH')}
          onMutatePatch={handleMutatePatch}
          onSaveUserPatch={handleSaveUserPatch}
          onExportPatchJson={handleExportPatchJson}
          onImportPatchJson={handleImportPatchJson}
          onExportWavLoop={handleExportWavLoop}
          onExportWavShot={handleExportWavShot}
          onMasterLevelChange={(v) => updateParam('masterLevel', v)}
          onPanic={() => {
            engineRef.current?.panic();
            setIsPlaying(false);
            setActiveNotes(new Set());
            setStatusText('ALL NOTES OFF');
          }}
        />

        <div className="synth-faceplate">
          {/* ---------------- TOP ROW: VOICE · OSC 1 · OSC 2 · MIX/FM/NOISE · FILTERS ---------------- */}
          <div className="synth-row-top">
            {/* 1. PLAY / VOICE / MOD WHEEL MATRIX */}
            <div className="module-box">
              <div className="module-header">
                <span className="module-title">Play / Voice</span>
                <span className="module-tag">{patch.polyphony === 1 ? 'MONO' : 'POLY'}</span>
              </div>

              <div className="ctrl-row">
                <div className="num-stepper">
                  <div className="num-stepper-box">
                    <button
                      type="button"
                      className="num-stepper-btn"
                      onClick={() => updateParam('polyphony', Math.max(1, patch.polyphony - 1))}
                    >
                      −
                    </button>
                    <span className="num-stepper-val">{patch.polyphony}</span>
                    <button
                      type="button"
                      className="num-stepper-btn"
                      onClick={() => updateParam('polyphony', Math.min(16, patch.polyphony + 1))}
                    >
                      +
                    </button>
                  </div>
                  <span className="knob-label">Poly</span>
                </div>

                <div className="num-stepper">
                  <div className="num-stepper-box">
                    <button
                      type="button"
                      className="num-stepper-btn"
                      onClick={() =>
                        updateParam('pitchBendRange', Math.max(1, patch.pitchBendRange - 1))
                      }
                    >
                      −
                    </button>
                    <span className="num-stepper-val">{patch.pitchBendRange}</span>
                    <button
                      type="button"
                      className="num-stepper-btn"
                      onClick={() =>
                        updateParam('pitchBendRange', Math.min(24, patch.pitchBendRange + 1))
                      }
                    >
                      +
                    </button>
                  </div>
                  <span className="knob-label">Bend</span>
                </div>
              </div>

              <div className="seg-group">
                <button
                  type="button"
                  className={`seg-btn ${patch.playMode === 'retrig' ? 'active' : ''}`}
                  onClick={() => updateParam('playMode', 'retrig')}
                >
                  Retrig
                </button>
                <button
                  type="button"
                  className={`seg-btn ${patch.playMode === 'legato' ? 'active' : ''}`}
                  onClick={() => updateParam('playMode', 'legato')}
                >
                  Legato
                </button>
              </div>

              <div className="ctrl-row">
                <Knob
                  label="Porta"
                  value={patch.portamento}
                  defaultValue={0}
                  size={34}
                  onChange={(v) => updateParam('portamento', v)}
                />
                <Knob
                  label="MW→Frq"
                  value={patch.modWheelFilterFreq}
                  min={-1}
                  max={1}
                  bipolar
                  defaultValue={0.5}
                  size={34}
                  onChange={(v) => updateParam('modWheelFilterFreq', v)}
                />
                <Knob
                  label="MW→FM"
                  value={patch.modWheelFm}
                  min={-1}
                  max={1}
                  bipolar
                  defaultValue={0.25}
                  size={34}
                  onChange={(v) => updateParam('modWheelFm', v)}
                />
              </div>
            </div>

            {/* 2. OSCILLATOR 1 */}
            <div className="module-box">
              <div className="module-header">
                <span className="module-title">Oscillator 1</span>
                <LedButton
                  label="Kbd"
                  active={patch.osc1KbdTrack}
                  onClick={() => updateParam('osc1KbdTrack', !patch.osc1KbdTrack)}
                />
              </div>

              <WaveformSelector
                wave={patch.osc1Wave}
                phaseMode={patch.osc1PhaseMode}
                phaseOffset={patch.osc1Phase}
                onChange={(w) => updateParam('osc1Wave', w)}
              />

              <div className="ctrl-row">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <span className="knob-label">Phase Mode</span>
                  <div className="seg-group">
                    {(['off', 'subtract', 'multiply'] as PhaseMode[]).map((pm) => (
                      <button
                        key={pm}
                        type="button"
                        className={`seg-btn ${patch.osc1PhaseMode === pm ? 'active' : ''}`}
                        onClick={() => updateParam('osc1PhaseMode', pm)}
                      >
                        {pm === 'off' ? '0' : pm === 'subtract' ? '− Sub' : '× Mul'}
                      </button>
                    ))}
                  </div>
                </div>
                <Knob
                  label="Phase"
                  value={patch.osc1Phase}
                  defaultValue={0}
                  size={36}
                  onChange={(v) => updateParam('osc1Phase', v)}
                />
              </div>

              <div className="ctrl-row">
                <div className="num-stepper">
                  <div className="num-stepper-box">
                    <button
                      type="button"
                      className="num-stepper-btn"
                      onClick={() => updateParam('osc1Octave', Math.max(0, patch.osc1Octave - 1))}
                    >
                      −
                    </button>
                    <span className="num-stepper-val">{patch.osc1Octave}</span>
                    <button
                      type="button"
                      className="num-stepper-btn"
                      onClick={() => updateParam('osc1Octave', Math.min(8, patch.osc1Octave + 1))}
                    >
                      +
                    </button>
                  </div>
                  <span className="knob-label">Oct</span>
                </div>

                <div className="num-stepper">
                  <div className="num-stepper-box">
                    <button
                      type="button"
                      className="num-stepper-btn"
                      onClick={() => updateParam('osc1Semi', Math.max(0, patch.osc1Semi - 1))}
                    >
                      −
                    </button>
                    <span className="num-stepper-val">{patch.osc1Semi}</span>
                    <button
                      type="button"
                      className="num-stepper-btn"
                      onClick={() => updateParam('osc1Semi', Math.min(12, patch.osc1Semi + 1))}
                    >
                      +
                    </button>
                  </div>
                  <span className="knob-label">Semi</span>
                </div>

                <Knob
                  label="Cent"
                  value={patch.osc1Cent}
                  min={-50}
                  max={50}
                  step={1}
                  bipolar
                  defaultValue={0}
                  size={34}
                  displayValue={`${patch.osc1Cent > 0 ? '+' : ''}${Math.round(patch.osc1Cent)}`}
                  onChange={(v) => updateParam('osc1Cent', v)}
                />
              </div>
            </div>

            {/* 3. OSCILLATOR 2 */}
            <div className="module-box" style={{ opacity: patch.osc2On ? 1 : 0.72 }}>
              <div className="module-header">
                <LedButton
                  label="Osc 2"
                  active={patch.osc2On}
                  onClick={() => updateParam('osc2On', !patch.osc2On)}
                />
                <LedButton
                  label="Kbd"
                  active={patch.osc2KbdTrack}
                  onClick={() => updateParam('osc2KbdTrack', !patch.osc2KbdTrack)}
                />
              </div>

              <WaveformSelector
                wave={patch.osc2Wave}
                phaseMode={patch.osc2PhaseMode}
                phaseOffset={patch.osc2Phase}
                onChange={(w) => updateParam('osc2Wave', w)}
              />

              <div className="ctrl-row">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <span className="knob-label">Phase Mode</span>
                  <div className="seg-group">
                    {(['off', 'subtract', 'multiply'] as PhaseMode[]).map((pm) => (
                      <button
                        key={pm}
                        type="button"
                        className={`seg-btn ${patch.osc2PhaseMode === pm ? 'active' : ''}`}
                        onClick={() => updateParam('osc2PhaseMode', pm)}
                      >
                        {pm === 'off' ? '0' : pm === 'subtract' ? '− Sub' : '× Mul'}
                      </button>
                    ))}
                  </div>
                </div>
                <Knob
                  label="Phase"
                  value={patch.osc2Phase}
                  defaultValue={0}
                  size={36}
                  onChange={(v) => updateParam('osc2Phase', v)}
                />
              </div>

              <div className="ctrl-row">
                <div className="num-stepper">
                  <div className="num-stepper-box">
                    <button
                      type="button"
                      className="num-stepper-btn"
                      onClick={() => updateParam('osc2Octave', Math.max(0, patch.osc2Octave - 1))}
                    >
                      −
                    </button>
                    <span className="num-stepper-val">{patch.osc2Octave}</span>
                    <button
                      type="button"
                      className="num-stepper-btn"
                      onClick={() => updateParam('osc2Octave', Math.min(8, patch.osc2Octave + 1))}
                    >
                      +
                    </button>
                  </div>
                  <span className="knob-label">Oct</span>
                </div>

                <div className="num-stepper">
                  <div className="num-stepper-box">
                    <button
                      type="button"
                      className="num-stepper-btn"
                      onClick={() => updateParam('osc2Semi', Math.max(0, patch.osc2Semi - 1))}
                    >
                      −
                    </button>
                    <span className="num-stepper-val">{patch.osc2Semi}</span>
                    <button
                      type="button"
                      className="num-stepper-btn"
                      onClick={() => updateParam('osc2Semi', Math.min(12, patch.osc2Semi + 1))}
                    >
                      +
                    </button>
                  </div>
                  <span className="knob-label">Semi</span>
                </div>

                <Knob
                  label="Cent"
                  value={patch.osc2Cent}
                  min={-50}
                  max={50}
                  step={1}
                  bipolar
                  defaultValue={0}
                  size={34}
                  displayValue={`${patch.osc2Cent > 0 ? '+' : ''}${Math.round(patch.osc2Cent)}`}
                  onChange={(v) => updateParam('osc2Cent', v)}
                />
              </div>
            </div>

            {/* 4. OSC MIX · FM · RING MOD · NOISE */}
            <div className="module-box">
              <div className="module-header">
                <span className="module-title">Mix / FM</span>
                <LedButton
                  label="Ring"
                  active={patch.ringMod}
                  color="red"
                  onClick={() => updateParam('ringMod', !patch.ringMod)}
                />
              </div>

              <div className="ctrl-row">
                <Knob
                  label="Mix 1↔2"
                  value={patch.oscMix}
                  defaultValue={0}
                  size={34}
                  onChange={(v) => updateParam('oscMix', v)}
                />
                <Knob
                  label="FM 2→1"
                  value={patch.fmAmount}
                  defaultValue={0}
                  size={34}
                  onChange={(v) => updateParam('fmAmount', v)}
                />
              </div>

              <div className="module-header" style={{ marginTop: 2 }}>
                <LedButton
                  label="Noise"
                  active={patch.noiseOn}
                  onClick={() => updateParam('noiseOn', !patch.noiseOn)}
                />
              </div>

              <div className="ctrl-row">
                <Knob
                  label="Dec"
                  value={patch.noiseDecay}
                  defaultValue={0.3}
                  size={28}
                  onChange={(v) => updateParam('noiseDecay', v)}
                />
                <Knob
                  label="Col"
                  value={patch.noiseColor}
                  defaultValue={0.5}
                  size={28}
                  onChange={(v) => updateParam('noiseColor', v)}
                />
                <Knob
                  label="Lvl"
                  value={patch.noiseLevel}
                  defaultValue={0.4}
                  size={28}
                  onChange={(v) => updateParam('noiseLevel', v)}
                />
              </div>
            </div>

            {/* 5. DUAL LINKABLE FILTERS (FILTER 1 + LINK + FILTER 2) */}
            <div className="module-box">
              <div className="module-header">
                <span className="module-title">Filter 1</span>
                <LedButton
                  label="Link"
                  active={patch.filterLink}
                  onClick={() => updateParam('filterLink', !patch.filterLink)}
                />
                <LedButton
                  label="Filter 2"
                  active={patch.filter2On}
                  onClick={() => updateParam('filter2On', !patch.filter2On)}
                />
              </div>

              <div className="seg-group">
                {(['lp24', 'lp12', 'bp12', 'hp12', 'notch'] as Filter1Type[]).map((ft) => (
                  <button
                    key={ft}
                    type="button"
                    className={`seg-btn ${patch.filter1Type === ft ? 'active' : ''}`}
                    onClick={() => updateParam('filter1Type', ft)}
                  >
                    {ft.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="ctrl-row" style={{ alignItems: 'flex-end', marginTop: 2 }}>
                <Fader
                  label="Freq 1"
                  value={patch.filter1Freq}
                  defaultValue={0.5}
                  height={70}
                  displayValue={formatHz(patch.filter1Freq)}
                  onChange={(v) => updateParam('filter1Freq', v)}
                />
                <Fader
                  label="Res 1"
                  value={patch.filter1Res}
                  defaultValue={0.2}
                  height={70}
                  onChange={(v) => updateParam('filter1Res', v)}
                />
                <Knob
                  label="Kbd"
                  value={patch.filter1Kbd}
                  defaultValue={0.2}
                  size={34}
                  onChange={(v) => updateParam('filter1Kbd', v)}
                />
                <div
                  style={{
                    width: 1,
                    height: 68,
                    background: 'rgba(255,255,255,0.09)',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, opacity: patch.filter2On ? 1 : 0.45 }}>
                  <Fader
                    label="Freq 2"
                    value={patch.filter2Freq}
                    defaultValue={0.7}
                    height={70}
                    displayValue={formatHz(patch.filter2Freq)}
                    onChange={(v) => updateParam('filter2Freq', v)}
                  />
                  <Fader
                    label="Res 2"
                    value={patch.filter2Res}
                    defaultValue={0.15}
                    height={70}
                    onChange={(v) => updateParam('filter2Res', v)}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ---------------- BOTTOM ROW: LFO 1 · LFO 2 · FILTER ENV · AMP ENV · MOD ENV / VELOCITY ---------------- */}
          <div className="synth-row-bottom">
            {/* 1. LFO 1 (Tempo-Synced UK Bassline Wobble Engine) */}
            <div className="module-box">
              <div className="module-header">
                <span className="module-title">LFO 1</span>
                <LedButton
                  label="Sync"
                  active={patch.lfo1Sync}
                  color="green"
                  onClick={() => updateParam('lfo1Sync', !patch.lfo1Sync)}
                />
              </div>

              <div className="seg-group">
                {(
                  [
                    ['triangle', 'Tri'],
                    ['rampUp', 'Up'],
                    ['rampDown', 'Dn'],
                    ['square', 'Sqr'],
                    ['randomStepped', 'S&H'],
                    ['randomSmooth', 'Rnd'],
                  ] as Array<[Lfo1Waveform, string]>
                ).map(([wf, lbl]) => (
                  <button
                    key={wf}
                    type="button"
                    className={`seg-btn ${patch.lfo1Wave === wf ? 'active' : ''}`}
                    onClick={() => updateParam('lfo1Wave', wf)}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              <div className="seg-group">
                {(
                  [
                    ['filterFreq', 'F.Frq'],
                    ['fm', 'FM'],
                    ['phase', 'Phs'],
                    ['osc12', 'O1&2'],
                    ['osc2', 'Osc2'],
                    ['oscMix', 'Mix'],
                  ] as Array<[Lfo1Dest, string]>
                ).map(([dest, lbl]) => (
                  <button
                    key={dest}
                    type="button"
                    className={`seg-btn ${patch.lfo1Dest === dest ? 'active' : ''}`}
                    onClick={() => updateParam('lfo1Dest', dest)}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              <div className="ctrl-row" style={{ marginTop: 4 }}>
                <Knob
                  label="Rate"
                  value={patch.lfo1Rate}
                  defaultValue={10 / 15}
                  size={40}
                  displayValue={formatLfo1Rate(patch.lfo1Rate, patch.lfo1Sync)}
                  onChange={(v) => updateParam('lfo1Rate', v)}
                />
                <Knob
                  label="Amount"
                  value={patch.lfo1Amount}
                  defaultValue={0}
                  size={40}
                  onChange={(v) => updateParam('lfo1Amount', v)}
                />
              </div>
            </div>

            {/* 2. LFO 2 (Polyphonic Per-Voice Modulator) */}
            <div className="module-box">
              <div className="module-header">
                <span className="module-title">LFO 2</span>
                <LedButton
                  label="Kbd"
                  active={patch.lfo2KbdTrack}
                  onClick={() => updateParam('lfo2KbdTrack', !patch.lfo2KbdTrack)}
                />
              </div>

              <div className="seg-group">
                {(
                  [
                    ['osc12', 'O1&2'],
                    ['phase', 'Phase'],
                    ['filterFreq2', 'Freq 2'],
                    ['amp', 'Amp'],
                  ] as Array<[Lfo2Dest, string]>
                ).map(([dest, lbl]) => (
                  <button
                    key={dest}
                    type="button"
                    className={`seg-btn ${patch.lfo2Dest === dest ? 'active' : ''}`}
                    onClick={() => updateParam('lfo2Dest', dest)}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              <div className="ctrl-row" style={{ marginTop: 8 }}>
                <Knob
                  label="Delay"
                  value={patch.lfo2Delay}
                  defaultValue={0}
                  size={36}
                  onChange={(v) => updateParam('lfo2Delay', v)}
                />
                <Knob
                  label="Rate"
                  value={patch.lfo2Rate}
                  defaultValue={0.45}
                  size={36}
                  onChange={(v) => updateParam('lfo2Rate', v)}
                />
                <Knob
                  label="Amt"
                  value={patch.lfo2Amount}
                  defaultValue={0}
                  size={36}
                  onChange={(v) => updateParam('lfo2Amount', v)}
                />
              </div>
            </div>

            {/* 3. FILTER ENVELOPE */}
            <div className="module-box">
              <div className="module-header">
                <span className="module-title">Filter Env</span>
                <LedButton
                  label="Inv"
                  active={patch.filterEnvInvert}
                  color="red"
                  onClick={() => updateParam('filterEnvInvert', !patch.filterEnvInvert)}
                />
              </div>

              <EnvelopeGraph
                attack={patch.filterEnvAttack}
                decay={patch.filterEnvDecay}
                sustain={patch.filterEnvSustain}
                release={patch.filterEnvRelease}
                invert={patch.filterEnvInvert}
              />

              <div className="ctrl-row">
                <Fader
                  label="A"
                  value={patch.filterEnvAttack}
                  defaultValue={0.02}
                  height={66}
                  onChange={(v) => updateParam('filterEnvAttack', v)}
                />
                <Fader
                  label="D"
                  value={patch.filterEnvDecay}
                  defaultValue={0.35}
                  height={66}
                  onChange={(v) => updateParam('filterEnvDecay', v)}
                />
                <Fader
                  label="S"
                  value={patch.filterEnvSustain}
                  defaultValue={0.2}
                  height={66}
                  onChange={(v) => updateParam('filterEnvSustain', v)}
                />
                <Fader
                  label="R"
                  value={patch.filterEnvRelease}
                  defaultValue={0.2}
                  height={66}
                  onChange={(v) => updateParam('filterEnvRelease', v)}
                />
                <Knob
                  label="Amt"
                  value={patch.filterEnvAmount}
                  defaultValue={0.4}
                  size={36}
                  onChange={(v) => updateParam('filterEnvAmount', v)}
                />
              </div>
            </div>

            {/* 4. AMP ENVELOPE */}
            <div className="module-box">
              <div className="module-header">
                <span className="module-title">Amp Env</span>
                <span className="module-tag">ADSR</span>
              </div>

              <EnvelopeGraph
                attack={patch.ampEnvAttack}
                decay={patch.ampEnvDecay}
                sustain={patch.ampEnvSustain}
                release={patch.ampEnvRelease}
              />

              <div className="ctrl-row">
                <Fader
                  label="A"
                  value={patch.ampEnvAttack}
                  defaultValue={0.01}
                  height={66}
                  onChange={(v) => updateParam('ampEnvAttack', v)}
                />
                <Fader
                  label="D"
                  value={patch.ampEnvDecay}
                  defaultValue={0.35}
                  height={66}
                  onChange={(v) => updateParam('ampEnvDecay', v)}
                />
                <Fader
                  label="S"
                  value={patch.ampEnvSustain}
                  defaultValue={0.85}
                  height={66}
                  onChange={(v) => updateParam('ampEnvSustain', v)}
                />
                <Fader
                  label="R"
                  value={patch.ampEnvRelease}
                  defaultValue={0.16}
                  height={66}
                  onChange={(v) => updateParam('ampEnvRelease', v)}
                />
              </div>
            </div>

            {/* 5. MOD ENVELOPE + VELOCITY MATRIX TOGGLE */}
            <div className="module-box">
              <div className="module-header">
                <span className="module-title">{showVelocity ? 'Velocity Matrix' : 'Mod Env'}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {!showVelocity && (
                    <LedButton
                      label="Inv"
                      active={patch.modEnvInvert}
                      color="red"
                      onClick={() => updateParam('modEnvInvert', !patch.modEnvInvert)}
                    />
                  )}
                  <LedButton
                    label="Vel"
                    active={showVelocity}
                    color="green"
                    onClick={() => setShowVelocity((v) => !v)}
                  />
                </div>
              </div>

              {showVelocity ? (
                <div className="ctrl-grid-4" style={{ marginTop: 4 }}>
                  <Knob
                    label="F.Env"
                    value={patch.velFilterEnv}
                    min={-1}
                    max={1}
                    bipolar
                    size={30}
                    onChange={(v) => updateParam('velFilterEnv', v)}
                  />
                  <Knob
                    label="F.Dec"
                    value={patch.velFilterDecay}
                    min={-1}
                    max={1}
                    bipolar
                    size={30}
                    onChange={(v) => updateParam('velFilterDecay', v)}
                  />
                  <Knob
                    label="F.Frq"
                    value={patch.velFilterFreq}
                    min={-1}
                    max={1}
                    bipolar
                    size={30}
                    onChange={(v) => updateParam('velFilterFreq', v)}
                  />
                  <Knob
                    label="FM"
                    value={patch.velFm}
                    min={-1}
                    max={1}
                    bipolar
                    size={30}
                    onChange={(v) => updateParam('velFm', v)}
                  />
                  <Knob
                    label="M.Env"
                    value={patch.velModEnv}
                    min={-1}
                    max={1}
                    bipolar
                    size={30}
                    onChange={(v) => updateParam('velModEnv', v)}
                  />
                  <Knob
                    label="Phase"
                    value={patch.velPhase}
                    min={-1}
                    max={1}
                    bipolar
                    size={30}
                    onChange={(v) => updateParam('velPhase', v)}
                  />
                  <Knob
                    label="Amp"
                    value={patch.velAmp}
                    min={0}
                    max={1}
                    size={30}
                    onChange={(v) => updateParam('velAmp', v)}
                  />
                  <Knob
                    label="Mix"
                    value={patch.velOscMix}
                    min={-1}
                    max={1}
                    bipolar
                    size={30}
                    onChange={(v) => updateParam('velOscMix', v)}
                  />
                </div>
              ) : (
                <>
                  <div className="seg-group">
                    {(
                      [
                        ['fm', 'FM'],
                        ['phase', 'Phs'],
                        ['osc1', 'Osc1'],
                        ['osc2', 'Osc2'],
                        ['oscMix', 'Mix'],
                        ['freq2', 'Frq2'],
                      ] as Array<[ModEnvDest, string]>
                    ).map(([dest, lbl]) => (
                      <button
                        key={dest}
                        type="button"
                        className={`seg-btn ${patch.modEnvDest === dest ? 'active' : ''}`}
                        onClick={() => updateParam('modEnvDest', dest)}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>

                  <div className="ctrl-row">
                    <Fader
                      label="A"
                      value={patch.modEnvAttack}
                      defaultValue={0.05}
                      height={66}
                      onChange={(v) => updateParam('modEnvAttack', v)}
                    />
                    <Fader
                      label="D"
                      value={patch.modEnvDecay}
                      defaultValue={0.3}
                      height={66}
                      onChange={(v) => updateParam('modEnvDecay', v)}
                    />
                    <Fader
                      label="S"
                      value={patch.modEnvSustain}
                      defaultValue={0}
                      height={66}
                      onChange={(v) => updateParam('modEnvSustain', v)}
                    />
                    <Fader
                      label="R"
                      value={patch.modEnvRelease}
                      defaultValue={0.15}
                      height={66}
                      onChange={(v) => updateParam('modEnvRelease', v)}
                    />
                    <Knob
                      label="Amt"
                      value={patch.modEnvAmount}
                      defaultValue={0}
                      size={36}
                      onChange={(v) => updateParam('modEnvAmount', v)}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          RACK UNIT 2: UK BASSLINE COMBINATOR FX RACK
         =================================================================== */}
      <UkRackFx patch={patch} onChange={updateParam} />

      {/* ===================================================================
          RACK UNIT 3: 140 BPM UK BASSLINE SEQUENCER & 4x4 DRUM MACHINE
         =================================================================== */}
      <SequencerDock
        isPlaying={isPlaying}
        currentStep={currentStep}
        bpm={bpm}
        swing={swing}
        drumGroove={drumGroove}
        drumVolume={drumVolume}
        patterns={UK_BASS_PATTERNS}
        selectedPatternId={selectedPatternId}
        steps={steps}
        onTogglePlay={() => void handleTogglePlay()}
        onSelectPattern={handleSelectPattern}
        onBpmChange={(val) => {
          setBpm(val);
          engineRef.current?.setBpm(val);
        }}
        onSwingChange={(val) => {
          setSwing(val);
          engineRef.current?.setSwing(val);
        }}
        onDrumGrooveChange={(g) => {
          setDrumGroove(g);
          engineRef.current?.setDrumGroove(g);
        }}
        onDrumVolumeChange={(v) => {
          setDrumVolume(v);
          engineRef.current?.setDrumVolume(v);
        }}
        onUpdateStep={(index, patchStep) => {
          setSteps((prev) =>
            prev.map((st, i) => (i === index ? { ...st, ...patchStep } : st))
          );
        }}
        onClearSteps={() => {
          setSteps((prev) => prev.map((st) => ({ ...st, active: false })));
        }}
        onRandomizeSteps={handleRandomizeSteps}
      />

      {/* ===================================================================
          RACK UNIT 4: PLAYABLE KEYBOARD & PITCH / MOD WHEELS
         =================================================================== */}
      <Keyboard
        baseOctave={baseOctave}
        activeNotes={activeNotes}
        pitchBend={pitchBend}
        modWheel={modWheel}
        onOctaveChange={setBaseOctave}
        onNoteOn={handleNoteOn}
        onNoteOff={handleNoteOff}
        onPitchBendChange={(v) => {
          setPitchBend(v);
          engineRef.current?.setPitchBend(v);
        }}
        onModWheelChange={(v) => {
          setModWheel(v);
          engineRef.current?.setModWheel(v);
        }}
      />
    </main>
  );
}

export default App;
