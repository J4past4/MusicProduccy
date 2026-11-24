# SUBTRAKTOR-140 — UK Bassline Subtractive Synthesizer

A studio-grade Web Audio (`AudioWorklet`) subtractive synthesizer inspired by **Reason's Subtractor**, purpose-built for **140 BPM UK Bassline, 4x4 Niche, and Speed Garage** sound design in the style of **DJ Q, TS7, Thorpey, DJ Pantha, and Ussy**.

## Core Subtractor-Inspired Architecture

- **Dual Oscillators (32 Waveforms each)**: Band-limited additive wavetables covering classic analog (Saw, Square, Triangle, Sine) plus Subtractor-inspired organ (UK M1 Organ), piano, deep sub, reed, brass, mallet, metallic bell, and dirty FM grit waveforms.
- **Signature Phase Offset Modulation (`SUBTRACT` & `MULTIPLY`)**: Subtract or multiply each oscillator with a phase-shifted copy of itself, with live waveform morphing preview and modulation from LFO 1, LFO 2, Mod Envelope, Velocity, and Mod Wheel.
- **Audio-Rate FM (`Osc 2 + Noise → Osc 1`) & Ring Modulation**: Osc 2 (and the Noise Generator with decay envelope) can frequency-modulate Osc 1 even when `Osc Mix` is set to 100% Osc 1 — the classic UK Bassline warp/wobble recipe.
- **Dual Linkable ZDF Filters**:
  - **Filter 1**: 5-mode Zero-Delay-Feedback State Variable / Cascaded Ladder filter (`LP24`, `LP12`, `BP12`, `HP12`, `NOTCH`) with Resonance and Keyboard Tracking.
  - **Filter 2**: Switchable `LP12` in series with **Link** mode (Filter 1 frequency, envelope, and LFO offset Filter 2 simultaneously).
- **3 Per-Voice ADSR Envelopes**: Amp Env, Filter Env (with Invert), and Mod Env (with Invert and 6 destinations: `FM`, `Phase`, `Osc 1`, `Osc 2`, `Osc Mix`, `Freq 2`).
- **2 LFOs**: Tempo-synced **LFO 1** (`4/1` down to `1/32`, including `1/8T` and `1/8D` UK bassline wobble divisions) with 6 waveforms, plus polyphonic **LFO 2** with Delay and Keyboard Tracking.
- **Full Velocity Matrix & Performance Controls**: Mono/Legato Portamento, up to 16-voice Polyphony, Pitch Bend & Mod Wheel routing, and **Web MIDI API** support.

## UK Bassline Workflow Extras

- **20 Handcrafted Factory Presets** referencing DJ Q, TS7, Thorpey, DJ Pantha, Ussy, Speed Garage, and Niche 4x4 + **Smart UK Bass Mutator**, User Preset Save (`localStorage`), and `.json` patch import/export.
- **UK Bassline Combinator FX Rack**: Dedicated phase-locked Mono Sub Layer, Scream-4 inspired Drive (`Tube`, `Tape`, `Fold`, `Fuzz`), Stereo Unison Chorus, and 4x4 Kick Sidechain Pump.
- **140 BPM 16-Step Sequencer & Drum Machine**: 8 curated UK Bassline grooves with per-step Gate, Pitch, Legato Slide, and Accent, backed by synthesized `4x4 Niche`, `2-Step UKG`, and `Half-Time` drums.
- **44.1 kHz 16-bit Stereo WAV Export**: Render 2-bar 140 BPM bassline loops or single F1 bass one-shots offline directly to `.wav` for drag-and-drop into any DAW.

## Development

```bash
npm install
npm run dev      # Start local dev server
npm test         # Run Vitest DSP & WAV export verification suite
npm run build    # Type-check and build production bundle
npm run lint     # Run oxlint
```
