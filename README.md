# PRODUCCY — Mobile-First Pro DAW & Flagship Drum Rack

A phone-first, hardware-inspired Digital Audio Workstation built to compete with **FL Studio Mobile** and **Logic Pro for iPad**, anchored by a studio-grade **16-Pad Hybrid Drum Rack** and integrated with the built-in **SUBTRAKTOR-140** UK Bassline subtractive synthesizer.

## Flagship Drum Rack & DAW Architecture

### 1. 16-Pad MPC / Logic Drum Rack (`PADS`)
- **Multi-Touch Velocity-Sensitive 4×4 Pad Grid**: Vertical hit-zone velocity sensitivity + `FULL LVL` lock, color-coded instrument groups, live LED feedback, and choke group badges.
- **16 Levels Mode**: Play any selected pad chromatically across 16 semitones (`PITCH` — ideal for 808 melodies & log drums) or across 16 velocity gradations (`VEL`).
- **Quantized Note Repeat / Roll**: Hold any pad with `1/8`, `1/16`, `1/32`, or `1/16T` active for instant trap hi-hat and snare rolls.
- **Live Mute / Solo Performance Modes**, Live Master Oscilloscope, and Quick-Sculpt Macro Bar (`Pitch`, `Decay`, `Filter`, `Drive`).

### 2. Hybrid 10-Engine Drum Synthesizer & Custom Sampler (`EDIT`)
- **10 Deterministic Studio Drum Engines**: `KICK`, `808 SUB`, `SNARE`, `CLAP` (4-tap TR-808/909 spread), `HI-HAT` (6-oscillator metallic inharmonic cluster), `CYMBAL`, `TOM`, `PERC` (wood rim to shaker morph), `FM BELL`, and `LOG DRUM` (Amapiano/Afrobeats).
- **Custom Audio Sample Import**: Load any `.wav`, `.mp3`, `.ogg`, `.flac`, or `.m4a` file onto any pad with live High-DPI waveform display, Start/End trim, Reverse, and full DSP processing.
- **Per-Pad DSP Chain**: Pitch & Fine tune, Tone/Morph, Punch/Snap, Attack/Decay, Zero-Delay-Feedback State Variable Filter (`LP` / `HP` / `BP`), Analog Tube/Tape Drive, Lo-Fi Bitcrusher/Decimator, and 4 Choke Groups (`A`–`D`).

### 3. FL-Style Matrix & Logic-Style Parameter Lock Sequencer (`SEQ`)
- **16 / 32 / 64 Step Patterns** with Bar paging, Swing, and swipe-to-paint Matrix grid.
- **6 Per-Step Parameter Lock Lanes**: Swipeable bar graphs for `Velocity`, `Pitch` (-12..+12st), `Ratchet/Roll` (1×–4×), `Probability`, `Pan`, and `Micro-Timing Nudge`.
- **Live Recording Overdub**: Tap pads while `REC + PLAY` is active to quantize hits directly into the pattern with velocity and micro-timing.
- **Pattern Tools**: Euclidean Rhythm Generator, Humanizer, 2× Pattern Doubler, Pad Shift, and Clear.

### 4. 16-Channel Console Mixer & Master Bus FX (`MIXER`)
- 16 scrollable channel strips with touch vertical faders, live peak meters, Reverb & Delay sends, and Mute/Solo + pinned Master strip.
- **Master Bus Chain**: 3-Band Master EQ, Bus Glue Compressor with Makeup Gain, Algorithmic Stereo Reverb Send, Tempo-Synced Ping-Pong Stereo Delay, and Soft-Clip Brickwall Limiter.

### 5. Song Arranger, 6 Factory Kits & 44.1 kHz WAV Export (`SONG`)
- **6 Studio Factory Kits**: `808 TRAP STUDIO`, `909 UKG / HOUSE`, `DUSTY MPC 95`, `LIQUID / JUNGLE 174`, `AMAPIANO LOG`, and `ELECTRO 80s`.
- **8 Pattern Slots (`A`–`H`)** + Song Timeline Clip Arranger (`Pattern Loop` vs `Song Arrange`).
- **Offline 44.1 kHz 16-Bit Stereo WAV Export** for both single patterns and full song arrangements, plus `.produccy.json` session Save/Load and `localStorage` auto-save.
- **Built-In SUBTRAKTOR-140 Synth**: One-tap `SYNTH` switch in the transport bar opens the full UK Bassline subtractive synthesizer.

## Development

```bash
npm install
npm run dev              # Start local dev server
npm test                 # Run Vitest DSP & WAV export verification suite (16 tests)
npm run lint             # Run oxlint (0 warnings, 0 errors)
npm run build            # Type-check and build production bundle
npm run build:standalone # Build single-file standalone dist/index.html
```
