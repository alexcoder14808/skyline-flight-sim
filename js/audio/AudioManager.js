// AudioManager
// -------------
// IMPORTANT LICENSING NOTE: this build environment has no live internet
// access, so no audio files could actually be downloaded from Pixabay for
// this delivery. Every sound below is synthesized at runtime with the Web
// Audio API instead (which the project brief explicitly allows as a
// fallback — see assets/audio/SOURCES.md for details and for exactly where
// to plug in real licensed files later).
//
// Structure matches the requested layout:
//   AudioManager
//     ├── music        (ambient generative pad)
//     ├── engine        (jet drone, throttle/RPM reactive)
//     ├── wind          (filtered noise, airspeed reactive)
//     ├── effects       (one-shot: gear, flaps, stall warning, crash, UI clicks)
//     └── environment    (light airport ambience)

import { clamp } from '../utils/MathUtils.js';
import { Storage } from '../utils/Storage.js';

export class AudioManager {
    constructor() {
        this.ctx = null;
        this.started = false;

        this.volumes = Storage.get('audioVolumes', {
            master: 0.8, music: 0.35, engine: 0.9, effects: 0.85, environment: 0.5, muted: false
        });

        this.nodes = {};
    }

    /** Must be called after a user gesture (browser autoplay policy). */
    start() {
        if (this.started) return;
        this.started = true;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);

        this.buses = {
            music: this._makeBus(),
            engine: this._makeBus(),
            wind: this._makeBus(),
            effects: this._makeBus(),
            environment: this._makeBus()
        };

        this._applyVolumes();
        this._buildEngineDrone();
        this._buildWind();
        this._buildMusic();
        this._buildEnvironmentAmbience();
    }

    _makeBus() {
        const gain = this.ctx.createGain();
        gain.connect(this.master);
        return gain;
    }

    _applyVolumes() {
        if (!this.ctx) return;
        const v = this.volumes;
        const m = v.muted ? 0 : v.master;
        this.master.gain.setTargetAtTime(m, this.ctx.currentTime, 0.05);
        this.buses.music.gain.setTargetAtTime(v.music, this.ctx.currentTime, 0.05);
        this.buses.engine.gain.setTargetAtTime(v.engine, this.ctx.currentTime, 0.05);
        this.buses.effects.gain.setTargetAtTime(v.effects, this.ctx.currentTime, 0.05);
        this.buses.environment.gain.setTargetAtTime(v.environment, this.ctx.currentTime, 0.05);
        Storage.set('audioVolumes', v);
    }

    setVolume(channel, value) {
        this.volumes[channel] = clamp(value, 0, 1);
        this._applyVolumes();
    }
    setMuted(muted) {
        this.volumes.muted = muted;
        this._applyVolumes();
    }
    getVolumes() { return this.volumes; }

    // ---------------- Engine drone ----------------
    _buildEngineDrone() {
        const ctx = this.ctx;
        const osc1 = ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc1.frequency.value = 80;
        const osc2 = ctx.createOscillator();
        osc2.type = 'sawtooth';
        osc2.frequency.value = 120;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;
        filter.Q.value = 0.7;

        const gain = ctx.createGain();
        gain.gain.value = 0.0001;

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.buses.engine);
        osc1.start();
        osc2.start();

        this.nodes.engine = { osc1, osc2, filter, gain };
    }

    /** rpmFraction 0..1 (idle..max), airspeed in m/s for extra whine at speed */
    updateEngine(rpmFraction, running) {
        if (!this.ctx) return;
        const { osc1, osc2, filter, gain } = this.nodes.engine;
        const targetGain = running ? 0.05 + rpmFraction * 0.22 : 0.0001;
        gain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.15);
        const baseFreq = 70 + rpmFraction * 220;
        osc1.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.2);
        osc2.frequency.setTargetAtTime(baseFreq * 1.5 + 10, this.ctx.currentTime, 0.2);
        filter.frequency.setTargetAtTime(300 + rpmFraction * 1800, this.ctx.currentTime, 0.2);
    }

    // ---------------- Wind ----------------
    _buildWind() {
        const ctx = this.ctx;
        const bufferSize = 2 * ctx.sampleRate;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 500;
        filter.Q.value = 0.5;

        const gain = ctx.createGain();
        gain.gain.value = 0.0001;

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.buses.wind);
        noise.start();

        this.nodes.wind = { noise, filter, gain };
    }

    /** airspeedFraction 0..1+ relative to a reference cruise speed */
    updateWind(airspeedFraction) {
        if (!this.ctx) return;
        const { filter, gain } = this.nodes.wind;
        const f = clamp(airspeedFraction, 0, 1.6);
        gain.gain.setTargetAtTime(0.02 + f * 0.18, this.ctx.currentTime, 0.3);
        filter.frequency.setTargetAtTime(300 + f * 2200, this.ctx.currentTime, 0.3);
    }

    // ---------------- Generative ambient music (V2: richer — chord
    // progression + soft arpeggiated bell layer + slow stereo movement,
    // still 100% synthesized, no external files; see SOURCES.md) ----------
    _buildMusic() {
        const ctx = this.ctx;

        // Four-chord slow progression (Am9 - Fmaj7 - Cmaj7 - G6-ish), voiced
        // low so it sits as a pad rather than a melody.
        this._chords = [
            [110.00, 130.81, 164.81, 196.00],  // A2 C3 E3 G3
            [87.31, 110.00, 130.81, 174.61],   // F2 A2 C3 F3
            [65.41, 98.00, 123.47, 164.81],    // C2 G2 B2 E3
            [98.00, 123.47, 146.83, 196.00]    // G2 B2 D3 G3
        ];
        this._chordIndex = 0;
        this._chordTimer = 0;
        this._chordDuration = 9; // seconds per chord — slow and unobtrusive

        this._padVoices = this._chords[0].map((freq) => {
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = freq;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 1200;
            filter.Q.value = 0.3;
            const g = ctx.createGain();
            g.gain.value = 0;
            const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
            osc.connect(filter);
            filter.connect(g);
            if (panner) { g.connect(panner); panner.connect(this.buses.music); } else { g.connect(this.buses.music); }
            osc.start();
            g.gain.setTargetAtTime(0.045, ctx.currentTime + 2, 5);
            return { osc, g, filter, panner, panPhase: Math.random() * Math.PI * 2 };
        });

        // Soft high bell/arpeggio layer — sparse, randomized timing so it
        // doesn't feel mechanically looped.
        this._bellGain = ctx.createGain();
        this._bellGain.gain.value = 0.06;
        this._bellGain.connect(this.buses.music);
        this._scheduleNextBell(ctx.currentTime + 3);

        this._musicClockLastTime = ctx.currentTime;
    }

    _scheduleNextBell(atTime) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const chord = this._chords ? this._chords[this._chordIndex] : [220];
        const freq = chord[Math.floor(Math.random() * chord.length)] * (Math.random() < 0.5 ? 2 : 4);

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, atTime);
        g.gain.linearRampToValueAtTime(0.5, atTime + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, atTime + 3.2);
        osc.connect(g);
        g.connect(this._bellGain);
        osc.start(atTime);
        osc.stop(atTime + 3.3);

        const nextDelay = 2.5 + Math.random() * 4.5;
        this._bellTimeoutHandle = setTimeout(() => {
            if (this.ctx) this._scheduleNextBell(this.ctx.currentTime + 0.05);
        }, nextDelay * 1000);
    }

    /** Called once per frame from main.js so the chord progression advances and pans gently. */
    updateMusic(dt) {
        if (!this.ctx || !this._padVoices) return;
        this._chordTimer += dt;
        if (this._chordTimer >= this._chordDuration) {
            this._chordTimer = 0;
            this._chordIndex = (this._chordIndex + 1) % this._chords.length;
            const nextChord = this._chords[this._chordIndex];
            this._padVoices.forEach((voice, i) => {
                voice.osc.frequency.setTargetAtTime(nextChord[i], this.ctx.currentTime, 3.5);
            });
        }
        const t = this.ctx.currentTime;
        this._padVoices.forEach((voice) => {
            if (voice.panner) {
                voice.panner.pan.setTargetAtTime(Math.sin(t * 0.05 + voice.panPhase) * 0.4, t, 1);
            }
            voice.filter.frequency.setTargetAtTime(900 + Math.sin(t * 0.03 + voice.panPhase) * 400, t, 1);
        });
    }

    // ---------------- Airport ambience ----------------
    _buildEnvironmentAmbience() {
        const ctx = this.ctx;
        const bufferSize = 2 * ctx.sampleRate;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 220;
        const gain = ctx.createGain();
        gain.gain.value = 0.03;
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.buses.environment);
        noise.start();
        this.nodes.environment = { noise, filter, gain };
    }

    // ---------------- One-shot effects ----------------
    _playTone(freq, duration, type = 'sine', gainValue = 0.25, bus = 'effects') {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(gainValue, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.buses[bus]);
        osc.start();
        osc.stop(ctx.currentTime + duration + 0.05);
    }

    playGear() { this._playTone(140, 0.9, 'square', 0.15); this._playTone(90, 1.1, 'sawtooth', 0.08); }
    playFlaps() { this._playTone(220, 0.4, 'square', 0.1); }
    playClick() { this._playTone(880, 0.06, 'sine', 0.15); }
    playCrash() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const bufferSize = ctx.sampleRate * 1.2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = 0.5;
        noise.connect(gain);
        gain.connect(this.buses.effects);
        noise.start();
    }

    _stallOsc = null;
    setStallWarning(active) {
        if (!this.ctx) return;
        if (active && !this._stallOsc) {
            const osc = this.ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = 420;
            const g = this.ctx.createGain();
            g.gain.value = 0.001;
            osc.connect(g);
            g.connect(this.buses.effects);
            osc.start();
            // Pulse it
            const pulse = () => {
                if (!this._stallOsc) return;
                g.gain.setTargetAtTime(0.18, this.ctx.currentTime, 0.02);
                setTimeout(() => { if (this._stallOsc) g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05); }, 180);
            };
            this._stallInterval = setInterval(pulse, 500);
            pulse();
            this._stallOsc = { osc, g };
        } else if (!active && this._stallOsc) {
            clearInterval(this._stallInterval);
            this._stallOsc.osc.stop();
            this._stallOsc = null;
        }
    }
}
