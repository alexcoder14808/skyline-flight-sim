# Audio Sources

## Current state (V1, as delivered)

**No external audio files are bundled in this build.** The build/delivery
environment used to generate this project has no live internet access, so it
was not possible to actually browse Pixabay and download licensed sound
effects or music for this pass — doing so would have meant guessing at file
names/URLs, which risks pulling in the wrong or unlicensed content.

Instead, every sound in the simulator (`js/audio/AudioManager.js`) is
generated at runtime with the Web Audio API:

| Channel      | How it's generated                                              |
|--------------|-------------------------------------------------------------------|
| engine       | Two detuned sawtooth oscillators through a low-pass filter, RPM/throttle-reactive |
| wind         | Filtered white noise, airspeed-reactive band-pass sweep          |
| effects      | Short synthesized tones/noise bursts (gear, flaps, stall warning, crash, UI clicks) |
| music        | Slow, generative ambient sine pad with independent per-note LFOs |
| environment  | Very low, filtered noise bed standing in for airport ambience     |

This is explicitly one of the options the original spec allowed ("create
original procedural/background music using Web Audio API"), so it's a
legitimate fallback, not a placeholder — but real recorded/licensed audio
will sound better and is worth doing for V2.

## How to add real Pixabay audio later

1. Go to https://pixabay.com/sound-effects/ (or /music/) and search for what
   you need (e.g. "jet engine loop", "wind ambience", "airport ambience").
2. Confirm the specific track's license terms on its Pixabay page before
   downloading (Pixabay's content license generally allows free commercial
   and non-commercial use without attribution, but **verify per-asset** —
   don't assume).
3. Download the file and place it under `assets/audio/`, e.g.:
   - `assets/audio/engine_jet_loop.mp3`
   - `assets/audio/wind_loop.mp3`
   - `assets/audio/gear.mp3`
   - `assets/audio/flaps.mp3`
   - `assets/audio/stall_warning.mp3`
   - `assets/audio/crash.mp3`
   - `assets/audio/music_ambient.mp3`
   - `assets/audio/airport_ambience.mp3`
4. In `js/audio/AudioManager.js`, replace the relevant `_build*()` method's
   oscillator/noise-buffer setup with an `<audio>`-backed
   `ctx.createMediaElementSource()` or a decoded `AudioBufferSourceNode`
   (there's a `_makeBus()` helper already wired to the master/mute controls —
   just connect your new source into the matching bus instead of the
   synthesized one). The public methods (`updateEngine`, `updateWind`,
   `playGear`, `playFlaps`, `setStallWarning`, `playCrash`) are called from
   `js/main.js` and don't need to change — only what's *inside* them does.
5. Record what you used below, in this file, for every asset you add:

| Asset file | Pixabay URL | Creator | License terms | Date obtained |
|---|---|---|---|---|
| _(none yet — add a row per file you add)_ | | | | |

## Rules to keep following

- Never use copyrighted commercial music, movie/game sound effects, or
  anything you can't point to a clear license for.
- Prefer Pixabay's own hosted files over third-party reposts.
- If you can't verify a file's license, don't use it — fall back to the
  procedural version in this build instead.
