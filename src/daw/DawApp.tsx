import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  type DawProject,
  type DawTab,
  type DrumPadConfig,
  type MasterBusConfig,
  type NoteRepeatRate,
  type SixteenLevelsMode,
  type StepCell,
} from './types';
import { createProjectFromKit, FACTORY_KITS } from './data/factoryKits';
import {
  applyEuclideanToPad,
  clearPattern,
  clonePattern,
  doublePatternLength,
  humanizePattern,
  shiftPadSteps,
} from './data/patternTools';
import { DrumRackEngine } from './audio/drumRackEngine';
import { renderDawProjectToWav } from './audio/dawWavExport';
import { downloadWav } from '../audio/wavExport';
import { TransportBar } from './components/TransportBar';
import { PadsView } from './components/PadsView';
import { SequencerView } from './components/SequencerView';
import { PadEditorView } from './components/PadEditorView';
import { MixerView } from './components/MixerView';
import { ArrangerView } from './components/ArrangerView';
import { App as SubtraktorApp } from '../App';
import './daw.css';

const STORAGE_KEY = 'produccy_mobile_daw_v1';
const REPEAT_CYCLE: NoteRepeatRate[] = ['off', '1/8', '1/16', '1/32', '1/16T'];

// Desktop keyboard-to-pad mapping (MPC 4x4 layout)
const KEY_TO_PAD: Record<string, number> = {
  '1': 12, '2': 13, '3': 14, '4': 15,
  q: 8, w: 9, e: 10, r: 11,
  a: 4, s: 5, d: 6, f: 7,
  z: 0, x: 1, c: 2, v: 3,
};

function loadInitialProject(): DawProject {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DawProject;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.pads) && parsed.pads.length === 16) {
        return parsed;
      }
    }
  } catch {
    // Fallback to default kit
  }
  return createProjectFromKit(FACTORY_KITS[0]);
}

export const DawApp: React.FC = () => {
  const [studioMode, setStudioMode] = useState<'daw' | 'synth'>('daw');
  const [project, setProject] = useState<DawProject>(() => loadInitialProject());
  const [activeTab, setActiveTab] = useState<DawTab>('pads');
  const [selectedPadId, setSelectedPadId] = useState<number>(0);
  const [phoneFrame, setPhoneFrame] = useState<boolean>(true);

  // Transport & Performance states
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [metronomeOn, setMetronomeOn] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [activeClipIndex, setActiveClipIndex] = useState<number>(0);
  const [fullLevel, setFullLevel] = useState<boolean>(false);
  const [sixteenLevels, setSixteenLevels] = useState<SixteenLevelsMode>('off');
  const [noteRepeat, setNoteRepeat] = useState<NoteRepeatRate>('off');
  const [padActionMode, setPadActionMode] = useState<'play' | 'mute' | 'solo'>('play');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);

  // Undo / Redo stacks
  const [undoStack, setUndoStack] = useState<DawProject[]>([]);
  const [redoStack, setRedoStack] = useState<DawProject[]>([]);

  // Live meters & pad flash state
  const [masterL, setMasterL] = useState<number>(0);
  const [masterR, setMasterR] = useState<number>(0);
  const [padPeaks, setPadPeaks] = useState<Float32Array>(() => new Float32Array(16));
  const [scopeData, setScopeData] = useState<Float32Array>(() => new Float32Array(128));
  const [padFlash, setPadFlash] = useState<Record<number, number>>({});
  const padFlashRef = useRef<Record<number, number>>({});

  // Tap tempo buffer
  const tapTimesRef = useRef<number[]>([]);
  const toastTimerRef = useRef<number | null>(null);

  // Audio Engine singleton
  const [engine] = useState<DrumRackEngine>(() => new DrumRackEngine(project));
  const engineRef = useRef<DrumRackEngine>(engine);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  // Persist project to localStorage (debounced lightly)
  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      } catch {
        // Ignore quota errors
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [project]);

  // Bind audio engine callbacks & dispose on unmount
  useEffect(() => {
    const engine = engineRef.current!;
    engine.setCallbacks(
      (pos) => {
        setCurrentStep(pos.step);
        setActiveClipIndex(pos.clipIndex);
        setIsPlaying(pos.isPlaying);
      },
      (padId, vel) => {
        padFlashRef.current[padId] = Math.max(padFlashRef.current[padId] ?? 0, vel);
      }
    );
    return () => {
      engine.dispose();
    };
  }, []);

  // Sync project changes to audio engine
  useEffect(() => {
    engineRef.current?.updateProject(project);
  }, [project]);

  // Sync metronome
  useEffect(() => {
    engineRef.current?.setMetronome(metronomeOn);
  }, [metronomeOn]);

  // Live 30fps metering & pad flash decay animation loop
  useEffect(() => {
    if (studioMode !== 'daw') return;
    let rafId = 0;
    let lastTick = 0;

    const loop = (now: number) => {
      if (now - lastTick >= 33) {
        lastTick = now;
        const engine = engineRef.current;
        if (engine) {
          const m = engine.getLiveMeters();
          setMasterL(m.masterL);
          setMasterR(m.masterR);
          if (activeTab === 'mixer') {
            setPadPeaks(new Float32Array(m.padPeaks));
          }
          if (activeTab === 'pads') {
            setScopeData(new Float32Array(m.scope));
          }
        }

        // Decay pad flashes
        let anyFlash = false;
        const nextFlash: Record<number, number> = {};
        for (const [k, v] of Object.entries(padFlashRef.current)) {
          const decayed = v * 0.78;
          if (decayed > 0.04) {
            nextFlash[Number(k)] = decayed;
            anyFlash = true;
          }
        }
        padFlashRef.current = nextFlash;
        if (anyFlash || Object.keys(nextFlash).length === 0) {
          setPadFlash(nextFlash);
        }
      }
      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(rafId);
  }, [activeTab, studioMode]);

  // Commit project change with undo snapshot
  const commitProject = useCallback(
    (updater: (prev: DawProject) => DawProject, recordUndo = true, dirtyPads?: number[]) => {
      setProject((prev) => {
        const next = updater(prev);
        if (recordUndo) {
          setUndoStack((u) => [...u.slice(-39), prev]);
          setRedoStack([]);
        }
        if (dirtyPads && dirtyPads.length > 0) {
          engineRef.current?.updateProject(next, dirtyPads);
        }
        return next;
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    setUndoStack((u) => {
      if (u.length === 0) return u;
      const previous = u[u.length - 1];
      setRedoStack((r) => [...r, project]);
      setProject(previous);
      engineRef.current?.updateProject(previous);
      engineRef.current?.invalidateAllPadBuffers();
      showToast('Undo');
      return u.slice(0, -1);
    });
  }, [project, showToast]);

  const handleRedo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const next = r[r.length - 1];
      setUndoStack((u) => [...u, project]);
      setProject(next);
      engineRef.current?.updateProject(next);
      engineRef.current?.invalidateAllPadBuffers();
      showToast('Redo');
      return r.slice(0, -1);
    });
  }, [project, showToast]);

  // Transport controls
  const handleTogglePlay = useCallback(() => {
    const engine = engineRef.current!;
    if (engine.getIsPlaying()) {
      engine.stop();
    } else {
      void engine.start();
    }
  }, []);

  const handleStop = useCallback(() => {
    engineRef.current?.stop();
    setIsRecording(false);
  }, []);

  const handleTapTempo = useCallback(() => {
    const now = performance.now();
    const taps = tapTimesRef.current.filter((t) => now - t < 2200);
    taps.push(now);
    tapTimesRef.current = taps;
    if (taps.length >= 2) {
      let sum = 0;
      for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
      const avgMs = sum / (taps.length - 1);
      const bpm = Math.max(50, Math.min(220, Math.round(60000 / avgMs)));
      commitProject((p) => ({ ...p, bpm }), false);
      showToast(`Tempo: ${bpm} BPM`);
    }
  }, [commitProject, showToast]);

  // Pad triggering + Live Overdub Recording
  const handlePadDown = useCallback(
    (padId: number, velocity: number, pitchOffset = 0) => {
      const engine = engineRef.current!;
      if (noteRepeat !== 'off') {
        engine.startNoteRepeat(padId, noteRepeat, velocity, pitchOffset);
      } else {
        engine.triggerPad(padId, velocity, pitchOffset);
      }

      // Live quantize record into active pattern when REC + PLAY are active
      if (isRecording && engine.getIsPlaying()) {
        const { step, nudge } = engine.getQuantizedStepForNow();
        commitProject(
          (prev) => {
            const patterns = prev.patterns.map((pat, idx) => {
              if (idx !== prev.activePatternIndex) return pat;
              const nextPat = clonePattern(pat);
              nextPat.steps[padId][step] = {
                ...nextPat.steps[padId][step],
                active: true,
                velocity: Number(Math.max(0.15, Math.min(1, velocity)).toFixed(2)),
                pitch: pitchOffset,
                nudge,
              };
              return nextPat;
            });
            return { ...prev, patterns };
          },
          false
        );
      }
    },
    [commitProject, isRecording, noteRepeat]
  );

  const handlePadUp = useCallback((padId: number) => {
    engineRef.current?.stopNoteRepeat(padId);
  }, []);

  // Desktop keyboard shortcuts (Space = play/stop, Ctrl+Z/Y = undo/redo, 4x4 keys = pads)
  useEffect(() => {
    if (studioMode !== 'daw') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      const padId = KEY_TO_PAD[e.key.toLowerCase()];
      if (padId !== undefined) {
        e.preventDefault();
        setSelectedPadId(padId);
        handlePadDown(padId, 0.92, 0);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const padId = KEY_TO_PAD[e.key.toLowerCase()];
      if (padId !== undefined) {
        handlePadUp(padId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handlePadDown, handlePadUp, handleRedo, handleTogglePlay, handleUndo, studioMode]);

  // Kit switching
  const handleSelectKit = useCallback(
    (kitId: string) => {
      const kit = FACTORY_KITS.find((k) => k.id === kitId);
      if (!kit) return;
      const next = createProjectFromKit(kit);
      commitProject(() => next, true);
      engineRef.current?.updateProject(next);
      engineRef.current?.invalidateAllPadBuffers();
      showToast(`Loaded Kit: ${kit.name}`);
    },
    [commitProject, showToast]
  );

  // Pad config updates
  const handleUpdatePad = useCallback(
    (padId: number, patch: Partial<DrumPadConfig>) => {
      const synthKeys: (keyof DrumPadConfig)[] = [
        'engine',
        'pitch',
        'fine',
        'tone',
        'decay',
        'punch',
        'attack',
        'filterMode',
        'filterCutoff',
        'filterRes',
        'drive',
        'crush',
        'reverse',
        'trimStart',
        'trimEnd',
        'sampleMeta',
      ];
      const needsRebuild = synthKeys.some((k) => k in patch);

      commitProject(
        (prev) => ({
          ...prev,
          pads: prev.pads.map((p) => (p.id === padId ? { ...p, ...patch } : p)),
        }),
        false,
        needsRebuild ? [padId] : undefined
      );
    },
    [commitProject]
  );

  const handleLoadSampleFile = useCallback(
    async (padId: number, file: File) => {
      try {
        const meta = await engineRef.current!.loadCustomSample(padId, file);
        handleUpdatePad(padId, {
          engine: 'sample',
          name: meta.name,
          shortName: meta.name.slice(0, 5).toUpperCase(),
          trimStart: 0,
          trimEnd: 1,
          sampleMeta: meta,
        });
        engineRef.current?.triggerPad(padId, 0.92);
        showToast(`Loaded Sample: ${meta.name}`);
      } catch {
        showToast('Could not decode audio file');
      }
    },
    [handleUpdatePad, showToast]
  );

  // Master Bus update
  const handleUpdateMaster = useCallback(
    (patch: Partial<MasterBusConfig>) => {
      commitProject((prev) => ({ ...prev, master: { ...prev.master, ...patch } }), false);
    },
    [commitProject]
  );

  // Step Sequencer operations
  const handleToggleStep = useCallback(
    (padId: number, stepIdx: number) => {
      commitProject((prev) => {
        const patterns = prev.patterns.map((pat, idx) => {
          if (idx !== prev.activePatternIndex) return pat;
          const nextPat = clonePattern(pat);
          const cell = nextPat.steps[padId][stepIdx];
          cell.active = !cell.active;
          return nextPat;
        });
        return { ...prev, patterns };
      }, true);
    },
    [commitProject]
  );

  const handleUpdateStep = useCallback(
    (padId: number, stepIdx: number, patch: Partial<StepCell>) => {
      commitProject((prev) => {
        const patterns = prev.patterns.map((pat, idx) => {
          if (idx !== prev.activePatternIndex) return pat;
          const nextPat = clonePattern(pat);
          nextPat.steps[padId][stepIdx] = { ...nextPat.steps[padId][stepIdx], ...patch };
          return nextPat;
        });
        return { ...prev, patterns };
      }, false);
    },
    [commitProject]
  );

  const handleExportWav = useCallback(
    (mode: 'pattern' | 'song') => {
      setIsExporting(true);
      window.setTimeout(() => {
        try {
          const custom = engineRef.current?.getCustomRawSamplesSnapshot() ?? [];
          const wav = renderDawProjectToWav(project, mode, custom, 44100);
          const patId = project.patterns[project.activePatternIndex]?.id ?? 'A';
          const slug = project.kitId.replace(/[^a-z0-9-]/gi, '');
          const filename =
            mode === 'song'
              ? `produccy_${slug}_song_${project.bpm}bpm.wav`
              : `produccy_${slug}_pat${patId}_${project.bpm}bpm.wav`;
          downloadWav(wav, filename);
          showToast(`Exported ${filename}`);
        } finally {
          setIsExporting(false);
        }
      }, 20);
    },
    [project, showToast]
  );

  const handleExportProjectJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `produccy_${project.kitId}_${project.bpm}bpm.produccy.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Saved project file');
  }, [project, showToast]);

  const handleImportProjectJson = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as DawProject;
        if (parsed.version === 1 && Array.isArray(parsed.pads) && parsed.pads.length === 16) {
          commitProject(() => parsed, true);
          engineRef.current?.updateProject(parsed);
          engineRef.current?.invalidateAllPadBuffers();
          showToast(`Loaded ${parsed.name}`);
        } else {
          showToast('Invalid project file');
        }
      } catch {
        showToast('Failed to read project JSON');
      }
    },
    [commitProject, showToast]
  );

  // Switch seamlessly to built-in SUBTRAKTOR-140 UK Bassline Synth
  if (studioMode === 'synth') {
    return (
      <div className="daw-synth-host">
        <div className="daw-synth-return">
          <button
            type="button"
            className="daw-pill-btn daw-pill-btn--amber"
            onClick={() => setStudioMode('daw')}
          >
            ← BACK TO PRODUCCY DRUM RACK DAW
          </button>
          <span className="daw-synth-return__label">INSTRUMENT TRACK: SUBTRAKTOR-140</span>
        </div>
        <SubtraktorApp />
      </div>
    );
  }

  return (
    <div className={`daw-outer ${phoneFrame ? 'daw-outer--phone' : 'daw-outer--wide'}`}>
      <main className="daw-shell">
        <h1 className="daw-sr-only">PRODUCCY Mobile DAW — Professional Drum Rack</h1>

        <TransportBar
          isPlaying={isPlaying}
          isRecording={isRecording}
          bpm={project.bpm}
          metronomeOn={metronomeOn}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          masterL={masterL}
          masterR={masterR}
          phoneFrame={phoneFrame}
          onTogglePlay={handleTogglePlay}
          onStop={handleStop}
          onToggleRecord={() => setIsRecording((r) => !r)}
          onBpmChange={(bpm) => commitProject((p) => ({ ...p, bpm }), false)}
          onTapTempo={handleTapTempo}
          onToggleMetronome={() => setMetronomeOn((m) => !m)}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onTogglePhoneFrame={() => setPhoneFrame((v) => !v)}
          onSwitchToSynth={() => {
            engineRef.current?.stop();
            setStudioMode('synth');
          }}
        />

        {/* Active DAW Workspace View */}
        <div className="daw-workspace">
          {activeTab === 'pads' && (
            <PadsView
              kitId={project.kitId}
              pads={project.pads}
              patterns={project.patterns}
              activePatternIndex={project.activePatternIndex}
              selectedPadId={selectedPadId}
              padFlash={padFlash}
              fullLevel={fullLevel}
              sixteenLevels={sixteenLevels}
              noteRepeat={noteRepeat}
              padActionMode={padActionMode}
              swing={project.swing}
              scopeData={scopeData}
              onSelectKit={handleSelectKit}
              onSelectPattern={(idx) =>
                commitProject((p) => ({ ...p, activePatternIndex: idx }), false)
              }
              onSelectPad={setSelectedPadId}
              onPadDown={handlePadDown}
              onPadUp={handlePadUp}
              onToggleFullLevel={() => setFullLevel((v) => !v)}
              onCycleSixteenLevels={() =>
                setSixteenLevels((m) => (m === 'off' ? 'pitch' : m === 'pitch' ? 'velocity' : 'off'))
              }
              onCycleNoteRepeat={() =>
                setNoteRepeat((r) => REPEAT_CYCLE[(REPEAT_CYCLE.indexOf(r) + 1) % REPEAT_CYCLE.length])
              }
              onSetPadActionMode={setPadActionMode}
              onTogglePadMute={(id) =>
                handleUpdatePad(id, { mute: !project.pads[id].mute })
              }
              onTogglePadSolo={(id) =>
                handleUpdatePad(id, { solo: !project.pads[id].solo })
              }
              onUpdatePad={handleUpdatePad}
              onOpenEditor={() => setActiveTab('edit')}
            />
          )}

          {activeTab === 'seq' && (
            <SequencerView
              pads={project.pads}
              patterns={project.patterns}
              activePatternIndex={project.activePatternIndex}
              selectedPadId={selectedPadId}
              currentStep={currentStep}
              swing={project.swing}
              onSelectPattern={(idx) =>
                commitProject((p) => ({ ...p, activePatternIndex: idx }), false)
              }
              onSelectPad={setSelectedPadId}
              onAuditionPad={(id) => engineRef.current?.triggerPad(id, 0.9)}
              onToggleStep={handleToggleStep}
              onUpdateStep={handleUpdateStep}
              onSetPatternLength={(length) =>
                commitProject((prev) => ({
                  ...prev,
                  patterns: prev.patterns.map((pat, idx) =>
                    idx === prev.activePatternIndex ? { ...pat, length } : pat
                  ),
                }))
              }
              onSwingChange={(swing) => commitProject((p) => ({ ...p, swing }), false)}
              onEuclidean={(padId, pulses) => {
                commitProject((prev) => ({
                  ...prev,
                  patterns: prev.patterns.map((pat, idx) =>
                    idx === prev.activePatternIndex
                      ? applyEuclideanToPad(pat, padId, pulses, 0)
                      : pat
                  ),
                }));
                showToast(`Euclidean ${pulses} hits on ${project.pads[padId].shortName}`);
              }}
              onHumanize={() => {
                commitProject((prev) => ({
                  ...prev,
                  patterns: prev.patterns.map((pat, idx) =>
                    idx === prev.activePatternIndex ? humanizePattern(pat, 0.25) : pat
                  ),
                }));
                showToast('Humanized velocities & groove pocket');
              }}
              onDoubleLength={() => {
                commitProject((prev) => ({
                  ...prev,
                  patterns: prev.patterns.map((pat, idx) =>
                    idx === prev.activePatternIndex ? doublePatternLength(pat) : pat
                  ),
                }));
                showToast('Doubled pattern length');
              }}
              onShiftPad={(padId, delta) => {
                commitProject((prev) => ({
                  ...prev,
                  patterns: prev.patterns.map((pat, idx) =>
                    idx === prev.activePatternIndex ? shiftPadSteps(pat, padId, delta) : pat
                  ),
                }));
              }}
              onClearPad={(padId) => {
                commitProject((prev) => ({
                  ...prev,
                  patterns: prev.patterns.map((pat, idx) =>
                    idx === prev.activePatternIndex ? clearPattern(pat, padId) : pat
                  ),
                }));
                showToast(`Cleared ${project.pads[padId].shortName}`);
              }}
              onClearPattern={() => {
                commitProject((prev) => ({
                  ...prev,
                  patterns: prev.patterns.map((pat, idx) =>
                    idx === prev.activePatternIndex ? clearPattern(pat) : pat
                  ),
                }));
                showToast('Cleared pattern');
              }}
            />
          )}

          {activeTab === 'edit' && (
            <PadEditorView
              pads={project.pads}
              selectedPadId={selectedPadId}
              onSelectPad={setSelectedPadId}
              onAuditionPad={(id) => engineRef.current?.triggerPad(id, 0.92)}
              onUpdatePad={handleUpdatePad}
              onLoadSampleFile={(id, file) => void handleLoadSampleFile(id, file)}
            />
          )}

          {activeTab === 'mixer' && (
            <MixerView
              pads={project.pads}
              master={project.master}
              padPeaks={padPeaks}
              masterL={masterL}
              masterR={masterR}
              onUpdatePad={handleUpdatePad}
              onUpdateMaster={handleUpdateMaster}
              onAuditionPad={(id) => engineRef.current?.triggerPad(id, 0.9)}
            />
          )}

          {activeTab === 'song' && (
            <ArrangerView
              project={project}
              activeClipIndex={activeClipIndex}
              isExporting={isExporting}
              onSetPlayMode={(playMode) => commitProject((p) => ({ ...p, playMode }), false)}
              onSelectPattern={(idx) =>
                commitProject((p) => ({ ...p, activePatternIndex: idx }), false)
              }
              onDuplicatePatternToSlot={(fromIdx, toIdx) => {
                commitProject((prev) => {
                  const src = prev.patterns[fromIdx];
                  const target = prev.patterns[toIdx];
                  const nextPatterns = prev.patterns.map((pat, i) =>
                    i === toIdx ? clonePattern(src, target.id, `${src.name} Copy`) : pat
                  );
                  return { ...prev, patterns: nextPatterns, activePatternIndex: toIdx };
                });
                showToast(`Cloned Pattern ${project.patterns[fromIdx].id} → ${project.patterns[toIdx].id}`);
              }}
              onAddSongClip={(patternId) =>
                commitProject((prev) => ({
                  ...prev,
                  songClips: [
                    ...prev.songClips,
                    { id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, patternId, bars: 2 },
                  ],
                }))
              }
              onUpdateSongClipBars={(clipId, bars) =>
                commitProject((prev) => ({
                  ...prev,
                  songClips: prev.songClips.map((c) => (c.id === clipId ? { ...c, bars } : c)),
                }))
              }
              onRemoveSongClip={(clipId) =>
                commitProject((prev) => ({
                  ...prev,
                  songClips: prev.songClips.filter((c) => c.id !== clipId),
                }))
              }
              onExportWav={handleExportWav}
              onExportProjectJson={handleExportProjectJson}
              onImportProjectJson={(file) => void handleImportProjectJson(file)}
              onResetKit={() => handleSelectKit(project.kitId)}
            />
          )}
        </div>

        {/* Toast Notification */}
        {toast && <div className="daw-toast" role="status">{toast}</div>}

        {/* Bottom Thumb-Zone Navigation Bar */}
        <nav className="daw-tabbar" aria-label="DAW Views">
          {(
            [
              {
                id: 'pads',
                label: 'PADS',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
                    <rect x="2" y="2" width="6" height="6" rx="1.4" />
                    <rect x="10" y="2" width="6" height="6" rx="1.4" />
                    <rect x="2" y="10" width="6" height="6" rx="1.4" />
                    <rect x="10" y="10" width="6" height="6" rx="1.4" />
                  </svg>
                ),
              },
              {
                id: 'seq',
                label: 'SEQ',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
                    <rect x="2" y="3" width="3" height="3" rx="0.8" />
                    <rect x="6.5" y="3" width="3" height="3" rx="0.8" opacity="0.35" />
                    <rect x="11" y="3" width="5" height="3" rx="0.8" />
                    <rect x="2" y="7.5" width="5" height="3" rx="0.8" opacity="0.45" />
                    <rect x="8.5" y="7.5" width="3" height="3" rx="0.8" />
                    <rect x="13" y="7.5" width="3" height="3" rx="0.8" />
                    <rect x="2" y="12" width="3" height="3" rx="0.8" />
                    <rect x="6.5" y="12" width="5" height="3" rx="0.8" />
                    <rect x="13" y="12" width="3" height="3" rx="0.8" opacity="0.35" />
                  </svg>
                ),
              },
              {
                id: 'edit',
                label: 'EDIT',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M2 9H4.5L6.5 4L9.5 14L12 7L13.5 9H16" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ),
              },
              {
                id: 'mixer',
                label: 'MIXER',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <line x1="4" y1="3" x2="4" y2="15" strokeLinecap="round" />
                    <line x1="9" y1="3" x2="9" y2="15" strokeLinecap="round" />
                    <line x1="14" y1="3" x2="14" y2="15" strokeLinecap="round" />
                    <rect x="2.2" y="9" width="3.6" height="2.6" rx="0.8" fill="currentColor" stroke="none" />
                    <rect x="7.2" y="5" width="3.6" height="2.6" rx="0.8" fill="currentColor" stroke="none" />
                    <rect x="12.2" y="10.5" width="3.6" height="2.6" rx="0.8" fill="currentColor" stroke="none" />
                  </svg>
                ),
              },
              {
                id: 'song',
                label: 'SONG',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <rect x="2" y="3" width="6" height="4" rx="1" fill="currentColor" stroke="none" />
                    <rect x="9.5" y="3" width="6.5" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.55" />
                    <rect x="2" y="9" width="10" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.7" />
                    <line x1="2" y1="15.5" x2="16" y2="15.5" strokeLinecap="round" />
                  </svg>
                ),
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              id={`daw-tab-${tab.id}`}
              type="button"
              className={`daw-tabbar__btn ${activeTab === tab.id ? 'is-active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </main>
    </div>
  );
};
