# PRODUCCY AI Agent Studio Guide

This workspace is optimised for **human + AI agent co-production** — allowing an AI coding/music agent to inspect, compose, sculpt DSP, auto-mix, arrange, and render studio-grade 44.1 kHz 16-bit Stereo WAV beats & stems alongside the user.

## 1. Architecture Overview

| Module | Path | Role |
|---|---|---|
| Core Schema | `src/daw/types.ts` | `DawProject`, 16 `DrumPadConfig`, `MelodicTrackConfig`, 8 `DrumPattern` slots (`A`–`H`), `MasterBusConfig`, `SongClip` |
| Drum DSP Core | `src/daw/audio/drumDspCore.ts` | 10 deterministic drum synthesis engines (`kick`, `808`, `snare`, `clap`, `hat`, `cymbal`, `tom`, `perc`, `fm`, `logdrum`) + ZDF SVF filter, drive, bitcrush, custom sample processing |
| Melodic Synth DSP | `src/daw/audio/melodicDspCore.ts` | 6 polyphonic synth engines (`reese`, `organ`, `pad`, `pluck`, `rhodes`, `acid`) + scale/chord voicing |
| AI Co-Producer | `src/daw/ai/beatAgent.ts` | `runCoProducerPrompt(project, prompt)`, `analyzeBeat(project)`, `composeMelodicLaneForPattern(...)` |
| Live Audio Engine | `src/daw/audio/drumRackEngine.ts` | Web Audio 16-pad + Synth mixer, choke groups, lookahead sequencer, Note Repeat, XY Master DJ Filter |
| Offline WAV & Stems | `src/daw/audio/dawWavExport.ts` | `renderDawProjectToWav(project, mode, customSamples, sampleRate, stem)` (`master`, `drums-low`, `drums-top`, `synth`) |

## 2. Live Browser Agent API (`window.__PRODUCCY_AGENT__`)

When the app is running in a browser, an AI agent can control the live DAW directly:

```js
// Inspect current beat state & studio diagnostics
const state = window.__PRODUCCY_AGENT__.getProject();
const report = window.__PRODUCCY_AGENT__.analyzeBeat();

// Co-produce via natural language (updates live DSP, sequencer, mixer & undo stack)
window.__PRODUCCY_AGENT__.runPrompt("Make a dark 142 bpm UK drill beat in F minor with haunted pluck");
window.__PRODUCCY_AGENT__.runPrompt("Auto-mix and master all channels");
window.__PRODUCCY_AGENT__.runPrompt("Build a full 4-section song arrangement");

// Live transport & auditioning
window.__PRODUCCY_AGENT__.play();
window.__PRODUCCY_AGENT__.triggerPad(0, 0.95);
window.__PRODUCCY_AGENT__.triggerChord([53, 56, 60, 63]);
window.__PRODUCCY_AGENT__.stop();
```

## 3. Collaborative Beat-Making Workflow for Agents

1. **Start from a Factory Kit or User `.produccy.json`**: Use `createProjectFromKit(FACTORY_KITS[i])` or parse the user's saved `.produccy.json`.
2. **Iterate with `runCoProducerPrompt` or direct pattern edits**:
   - Pad layout: `0=Kick`, `1=808/Sub`, `2=Snare`, `3=Clap`, `4=Closed Hat`, `5=Open Hat`, `6=Rim`, `7=Shaker`, `8-10=Toms/Congas`, `11=Cowbell/Aux`, `12=Crash`, `13=Ride`, `14=FM Bell`, `15=Zap/Log`.
   - Per-step parameter locks: `velocity`, `pitch` (-12..+12st), `ratchet` (1..4), `probability`, `pan`, `nudge` (-0.45..+0.45).
3. **Audit with `analyzeBeat(project)`**: Verify score, low-end reverb cleanliness, choke groups, and melodic key lock.
4. **Render & Deliver**: Export `.produccy.json` (loadable straight into the app's `SONG` tab) and/or 44.1 kHz Stereo WAVs (`master`, `drums-low`, `drums-top`, `synth`) via `renderDawProjectToWav`.
