import React, { useRef } from 'react';
import type { DawProject, StemExportTarget } from '../types';

interface ArrangerViewProps {
  project: DawProject;
  activeClipIndex: number;
  isExporting: boolean;
  onSetPlayMode: (mode: 'pattern' | 'song') => void;
  onSelectPattern: (index: number) => void;
  onDuplicatePatternToSlot: (fromIndex: number, toIndex: number) => void;
  onAddSongClip: (patternId: string) => void;
  onUpdateSongClipBars: (clipId: string, bars: number) => void;
  onRemoveSongClip: (clipId: string) => void;
  onExportWav: (mode: 'pattern' | 'song', stem?: StemExportTarget) => void;
  onExportProjectJson: () => void;
  onImportProjectJson: (file: File) => void;
  onResetKit: () => void;
}

export const ArrangerView: React.FC<ArrangerViewProps> = ({
  project,
  activeClipIndex,
  isExporting,
  onSetPlayMode,
  onSelectPattern,
  onDuplicatePatternToSlot,
  onAddSongClip,
  onUpdateSongClipBars,
  onRemoveSongClip,
  onExportWav,
  onExportProjectJson,
  onImportProjectJson,
  onResetKit,
}) => {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const totalSongBars = project.songClips.reduce((acc, c) => acc + c.bars, 0);
  const songSeconds = Math.round((totalSongBars * 4 * 60) / Math.max(40, project.bpm));

  return (
    <section className="daw-view daw-arranger-view" aria-label="Song Arranger and Export">
      <div className="daw-editor-scroll">
        {/* Playback Mode Toggle */}
        <div className="daw-param-group">
          <div className="daw-param-group__header">
            <span className="daw-param-group__title">PLAYBACK MODE</span>
            <div className="daw-seg-control">
              <button
                id="daw-mode-pattern"
                type="button"
                className={project.playMode === 'pattern' ? 'is-active' : ''}
                onClick={() => onSetPlayMode('pattern')}
              >
                PATTERN LOOP
              </button>
              <button
                id="daw-mode-song"
                type="button"
                className={project.playMode === 'song' ? 'is-active' : ''}
                onClick={() => onSetPlayMode('song')}
              >
                SONG ARRANGE
              </button>
            </div>
          </div>
          <p className="daw-helper-text">
            {project.playMode === 'song'
              ? `Playing full song timeline (${totalSongBars} bars · ~${songSeconds}s at ${project.bpm} BPM).`
              : `Looping Pattern ${project.patterns[project.activePatternIndex]?.id} (${project.patterns[project.activePatternIndex]?.length} steps).`}
          </p>
        </div>

        {/* 8 Pattern Slots Bank (A-H) */}
        <div className="daw-param-group">
          <div className="daw-param-group__header">
            <span className="daw-param-group__title">PATTERN BANK (A–H)</span>
            <button
              type="button"
              className="daw-tool-btn"
              onClick={() => {
                const nextIdx = (project.activePatternIndex + 1) % project.patterns.length;
                onDuplicatePatternToSlot(project.activePatternIndex, nextIdx);
              }}
            >
              CLONE TO NEXT →
            </button>
          </div>
          <div className="daw-pat-bank-grid">
            {project.patterns.map((pat, idx) => {
              const hitCount = pat.steps.reduce(
                (sum, row) => sum + row.slice(0, pat.length).filter((c) => c.active).length,
                0
              );
              return (
                <div
                  key={pat.id}
                  className={`daw-pat-card ${idx === project.activePatternIndex ? 'is-active' : ''}`}
                >
                  <button
                    type="button"
                    className="daw-pat-card__main"
                    onClick={() => onSelectPattern(idx)}
                  >
                    <span className="daw-pat-card__id">{pat.id}</span>
                    <span className="daw-pat-card__meta">
                      {pat.length}st · {hitCount} hits
                    </span>
                  </button>
                  <button
                    type="button"
                    className="daw-pat-card__add"
                    onClick={() => onAddSongClip(pat.id)}
                    title={`Append Pattern ${pat.id} to Song Timeline`}
                  >
                    + SONG
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Song Arrangement Timeline */}
        <div className="daw-param-group">
          <div className="daw-param-group__header">
            <span className="daw-param-group__title">
              SONG TIMELINE ({totalSongBars} BARS)
            </span>
          </div>

          {project.songClips.length === 0 ? (
            <p className="daw-helper-text">
              Tap <strong>+ SONG</strong> on any pattern above to build your arrangement.
            </p>
          ) : (
            <div className="daw-timeline-list">
              {project.songClips.map((clip, idx) => {
                const isPlayingClip = project.playMode === 'song' && idx === activeClipIndex;
                return (
                  <div
                    key={clip.id}
                    className={`daw-clip-row ${isPlayingClip ? 'is-playing' : ''}`}
                  >
                    <span className="daw-clip-row__idx">{idx + 1}</span>
                    <span className="daw-clip-row__pat">PAT {clip.patternId}</span>
                    <div className="daw-clip-row__bars">
                      {[1, 2, 4].map((b) => (
                        <button
                          key={b}
                          type="button"
                          className={`daw-bar-chip ${clip.bars === b ? 'is-active' : ''}`}
                          onClick={() => onUpdateSongClipBars(clip.id, b)}
                        >
                          {b}B
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="daw-clip-row__del"
                      onClick={() => onRemoveSongClip(clip.id)}
                      aria-label="Remove clip"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Studio Export & Project Session */}
        <div className="daw-param-group">
          <div className="daw-param-group__title">STUDIO EXPORT (44.1 kHz 16-BIT STEREO WAV)</div>
          <div className="daw-export-grid">
            <button
              id="daw-btn-export-pattern"
              type="button"
              className="daw-export-btn daw-export-btn--primary"
              disabled={isExporting}
              onClick={() => onExportWav('pattern')}
            >
              {isExporting ? 'RENDERING...' : `EXPORT PATTERN ${project.patterns[project.activePatternIndex]?.id} (.WAV)`}
            </button>
            <button
              id="daw-btn-export-song"
              type="button"
              className="daw-export-btn"
              disabled={isExporting || project.songClips.length === 0}
              onClick={() => onExportWav('song', 'master')}
            >
              {isExporting ? 'RENDERING...' : `EXPORT FULL SONG (${totalSongBars} BARS .WAV)`}
            </button>
            <div className="daw-stem-row">
              <button
                type="button"
                className="daw-tool-btn"
                disabled={isExporting}
                onClick={() => onExportWav(project.playMode, 'drums-low')}
              >
                STEM: KICK &amp; 808
              </button>
              <button
                type="button"
                className="daw-tool-btn"
                disabled={isExporting}
                onClick={() => onExportWav(project.playMode, 'drums-top')}
              >
                STEM: TOP DRUMS
              </button>
              <button
                type="button"
                className="daw-tool-btn"
                disabled={isExporting}
                onClick={() => onExportWav(project.playMode, 'synth')}
              >
                STEM: SYNTH
              </button>
            </div>
          </div>
        </div>

        <div className="daw-param-group">
          <div className="daw-param-group__title">SESSION PROJECT FILE</div>
          <div className="daw-export-grid">
            <button
              type="button"
              className="daw-export-btn"
              onClick={onExportProjectJson}
            >
              SAVE .PRODUCCY.JSON
            </button>
            <button
              type="button"
              className="daw-export-btn"
              onClick={() => jsonInputRef.current?.click()}
            >
              LOAD PROJECT FILE
            </button>
            <button
              type="button"
              className="daw-export-btn daw-export-btn--danger"
              onClick={onResetKit}
            >
              RESET CURRENT KIT
            </button>
            <input
              ref={jsonInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImportProjectJson(file);
                  e.target.value = '';
                }
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
};
