import React, { useState } from 'react';
import type { DelayDivision, DrumPadConfig, MasterBusConfig } from '../types';
import { TouchSlider } from './TouchSlider';

interface MixerViewProps {
  pads: DrumPadConfig[];
  master: MasterBusConfig;
  padPeaks: Float32Array;
  masterL: number;
  masterR: number;
  onUpdatePad: (padId: number, patch: Partial<DrumPadConfig>) => void;
  onUpdateMaster: (patch: Partial<MasterBusConfig>) => void;
  onAuditionPad: (padId: number) => void;
}

const DELAY_DIVS: DelayDivision[] = ['1/16', '1/8', '1/8D', '1/4'];

export const MixerView: React.FC<MixerViewProps> = ({
  pads,
  master,
  padPeaks,
  masterL,
  masterR,
  onUpdatePad,
  onUpdateMaster,
  onAuditionPad,
}) => {
  const [subTab, setSubTab] = useState<'strips' | 'masterfx'>('strips');

  const handleVerticalFader = (
    e: React.PointerEvent<HTMLDivElement>,
    onChange: (val: number) => void
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const norm = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / Math.max(1, rect.height)));
    onChange(Number((norm * 1.2).toFixed(2)));
  };

  return (
    <section className="daw-view daw-mixer-view" aria-label="Console Mixer">
      <div className="daw-mixer-topbar">
        <div className="daw-seg-control">
          <button
            id="daw-mixer-tab-strips"
            type="button"
            className={subTab === 'strips' ? 'is-active' : ''}
            onClick={() => setSubTab('strips')}
          >
            16 CHANNELS
          </button>
          <button
            id="daw-mixer-tab-masterfx"
            type="button"
            className={subTab === 'masterfx' ? 'is-active' : ''}
            onClick={() => setSubTab('masterfx')}
          >
            MASTER FX &amp; BUS
          </button>
        </div>

        <button
          type="button"
          className={`daw-mode-btn ${master.limiterOn ? 'is-emerald' : ''}`}
          onClick={() => onUpdateMaster({ limiterOn: !master.limiterOn })}
        >
          LIMITER {master.limiterOn ? 'ON' : 'OFF'}
        </button>
      </div>

      {subTab === 'strips' ? (
        <div className="daw-mixer-console">
          <div className="daw-mixer-strips">
            {pads.map((pad) => {
              const peak = Math.min(1, padPeaks[pad.id] ?? 0);
              const volPct = Math.min(100, (pad.volume / 1.2) * 100);

              return (
                <div
                  key={pad.id}
                  className={`daw-strip ${pad.mute ? 'is-muted' : ''}`}
                >
                  <button
                    type="button"
                    className="daw-strip__head"
                    onClick={() => onAuditionPad(pad.id)}
                  >
                    <span className={`daw-strip__cap daw-color-bg--${pad.color}`} />
                    <span className="daw-strip__name">{pad.shortName}</span>
                  </button>

                  {/* Send Indicators */}
                  <div className="daw-strip__sends">
                    <div className="daw-strip__sendbar" title="Reverb Send">
                      <span style={{ width: `${pad.reverbSend * 100}%`, background: '#06b6d4' }} />
                    </div>
                    <div className="daw-strip__sendbar" title="Delay Send">
                      <span style={{ width: `${pad.delaySend * 100}%`, background: '#eab308' }} />
                    </div>
                  </div>

                  {/* Vertical Fader + Peak Meter */}
                  <div className="daw-strip__fader-area">
                    <div className="daw-strip__meter">
                      <div
                        className="daw-strip__meter-fill"
                        style={{ height: `${peak * 100}%` }}
                      />
                    </div>
                    <div
                      className="daw-vfader"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        handleVerticalFader(e, (v) => onUpdatePad(pad.id, { volume: v }));
                      }}
                      onPointerMove={(e) => {
                        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                        handleVerticalFader(e, (v) => onUpdatePad(pad.id, { volume: v }));
                      }}
                      onDoubleClick={() => onUpdatePad(pad.id, { volume: 0.88 })}
                      role="slider"
                      aria-label={`${pad.name} Volume`}
                      aria-valuemin={0}
                      aria-valuemax={120}
                      aria-valuenow={Math.round(pad.volume * 100)}
                    >
                      <div className="daw-vfader__track" />
                      <div
                        className="daw-vfader__fill"
                        style={{ height: `${volPct}%` }}
                      />
                      <div
                        className="daw-vfader__cap"
                        style={{ bottom: `calc(${volPct}% - 10px)` }}
                      />
                    </div>
                  </div>

                  <span className="daw-strip__db">{Math.round(pad.volume * 100)}%</span>

                  {/* Mute & Solo Buttons */}
                  <div className="daw-strip__ms">
                    <button
                      type="button"
                      className={`daw-ms-btn ${pad.mute ? 'is-m' : ''}`}
                      onClick={() => onUpdatePad(pad.id, { mute: !pad.mute })}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      className={`daw-ms-btn ${pad.solo ? 'is-s' : ''}`}
                      onClick={() => onUpdatePad(pad.id, { solo: !pad.solo })}
                    >
                      S
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pinned Master Strip */}
          <div className="daw-strip daw-strip--master">
            <div className="daw-strip__head">
              <span className="daw-strip__cap" style={{ background: '#f59e0b' }} />
              <span className="daw-strip__name">MSTR</span>
            </div>

            <div className="daw-strip__fader-area">
              <div className="daw-strip__stereo-meter">
                <div className="daw-strip__meter">
                  <div className="daw-strip__meter-fill" style={{ height: `${Math.min(100, masterL * 100)}%` }} />
                </div>
                <div className="daw-strip__meter">
                  <div className="daw-strip__meter-fill" style={{ height: `${Math.min(100, masterR * 100)}%` }} />
                </div>
              </div>
              <div
                className="daw-vfader"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  handleVerticalFader(e, (v) => onUpdateMaster({ volume: v }));
                }}
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  handleVerticalFader(e, (v) => onUpdateMaster({ volume: v }));
                }}
                onDoubleClick={() => onUpdateMaster({ volume: 0.88 })}
                role="slider"
                aria-label="Master Volume"
                aria-valuemin={0}
                aria-valuemax={120}
                aria-valuenow={Math.round(master.volume * 100)}
              >
                <div className="daw-vfader__track" />
                <div
                  className="daw-vfader__fill daw-vfader__fill--master"
                  style={{ height: `${Math.min(100, (master.volume / 1.2) * 100)}%` }}
                />
                <div
                  className="daw-vfader__cap daw-vfader__cap--master"
                  style={{ bottom: `calc(${Math.min(100, (master.volume / 1.2) * 100)}% - 10px)` }}
                />
              </div>
            </div>

            <span className="daw-strip__db">{Math.round(master.volume * 100)}%</span>
            <span className="daw-strip__master-tag">BUS</span>
          </div>
        </div>
      ) : (
        /* MASTER FX & SEND BUS RACK */
        <div className="daw-editor-scroll">
          <div className="daw-param-group">
            <div className="daw-param-group__title">MASTER 3-BAND EQ</div>
            <div className="daw-param-grid">
              <TouchSlider
                label="LOW SHELF (95Hz)"
                value={master.eqLow}
                min={-12}
                max={12}
                step={0.5}
                defaultValue={1.5}
                bipolar
                displayValue={`${master.eqLow > 0 ? '+' : ''}${master.eqLow.toFixed(1)} dB`}
                onChange={(v) => onUpdateMaster({ eqLow: v })}
              />
              <TouchSlider
                label="MID PEAK (1.2kHz)"
                value={master.eqMid}
                min={-12}
                max={12}
                step={0.5}
                defaultValue={0}
                bipolar
                displayValue={`${master.eqMid > 0 ? '+' : ''}${master.eqMid.toFixed(1)} dB`}
                onChange={(v) => onUpdateMaster({ eqMid: v })}
              />
              <TouchSlider
                label="HIGH SHELF (8.2kHz)"
                value={master.eqHigh}
                min={-12}
                max={12}
                step={0.5}
                defaultValue={1.0}
                bipolar
                displayValue={`${master.eqHigh > 0 ? '+' : ''}${master.eqHigh.toFixed(1)} dB`}
                onChange={(v) => onUpdateMaster({ eqHigh: v })}
              />
              <TouchSlider
                label="MASTER LEVEL"
                value={master.volume}
                min={0}
                max={1.2}
                step={0.01}
                defaultValue={0.88}
                accent="#10b981"
                displayValue={`${Math.round(master.volume * 100)}%`}
                onChange={(v) => onUpdateMaster({ volume: v })}
              />
            </div>
          </div>

          <div className="daw-param-group">
            <div className="daw-param-group__title">BUS GLUE COMPRESSOR</div>
            <div className="daw-param-grid">
              <TouchSlider
                label="THRESHOLD"
                value={master.compThreshold}
                min={-36}
                max={0}
                step={1}
                defaultValue={-14}
                displayValue={`${master.compThreshold} dB`}
                onChange={(v) => onUpdateMaster({ compThreshold: v })}
              />
              <TouchSlider
                label="RATIO"
                value={master.compRatio}
                min={1}
                max={12}
                step={0.5}
                defaultValue={3.5}
                displayValue={`${master.compRatio.toFixed(1)}:1`}
                onChange={(v) => onUpdateMaster({ compRatio: v })}
              />
              <TouchSlider
                label="MAKEUP GAIN"
                value={master.compMakeup}
                min={0}
                max={12}
                step={0.5}
                defaultValue={2.5}
                accent="#f97316"
                displayValue={`+${master.compMakeup.toFixed(1)} dB`}
                onChange={(v) => onUpdateMaster({ compMakeup: v })}
              />
            </div>
          </div>

          <div className="daw-param-group">
            <div className="daw-param-group__header">
              <span className="daw-param-group__title">SEND A (REVERB) &amp; SEND B (PING-PONG DELAY)</span>
              <div className="daw-seg-control">
                {DELAY_DIVS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={master.delayDivision === d ? 'is-active' : ''}
                    onClick={() => onUpdateMaster({ delayDivision: d })}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="daw-param-grid">
              <TouchSlider
                label="REVERB DECAY"
                value={master.reverbDecay}
                min={0.3}
                max={4.0}
                step={0.1}
                defaultValue={1.6}
                accent="#06b6d4"
                displayValue={`${master.reverbDecay.toFixed(1)} s`}
                onChange={(v) => onUpdateMaster({ reverbDecay: v })}
              />
              <TouchSlider
                label="REVERB DAMPING"
                value={master.reverbTone}
                min={0.1}
                max={1}
                step={0.01}
                defaultValue={0.62}
                accent="#06b6d4"
                displayValue={`${Math.round(master.reverbTone * 100)}%`}
                onChange={(v) => onUpdateMaster({ reverbTone: v })}
              />
              <TouchSlider
                label="DELAY FEEDBACK"
                value={master.delayFeedback}
                min={0}
                max={0.8}
                step={0.01}
                defaultValue={0.36}
                accent="#eab308"
                displayValue={`${Math.round(master.delayFeedback * 100)}%`}
                onChange={(v) => onUpdateMaster({ delayFeedback: v })}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
