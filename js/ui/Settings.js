import { Storage } from '../utils/Storage.js';

const DEFAULTS = {
    graphicsQuality: 'high',   // 'low' | 'medium' | 'high'
    shadows: true,
    renderDistance: 'far',     // 'near' | 'medium' | 'far'
    cameraSensitivity: 1.0,
    flightSensitivity: 1.0,
    invertPitch: false
};

export class Settings {
    constructor(root, callbacks) {
        this.root = root;
        this.callbacks = callbacks;
        this.values = Storage.get('settings', DEFAULTS);

        this.el = {
            graphicsQuality: root.querySelectorAll('[data-group="graphicsQuality"] .option'),
            renderDistance: root.querySelectorAll('[data-group="renderDistance"] .option'),
            shadows: root.querySelector('#toggle-shadows'),
            invertPitch: root.querySelector('#toggle-invert-pitch'),
            cameraSensitivity: root.querySelector('#slider-camera-sensitivity'),
            flightSensitivity: root.querySelector('#slider-flight-sensitivity'),
            masterVolume: root.querySelector('#slider-master-volume'),
            musicVolume: root.querySelector('#slider-music-volume'),
            engineVolume: root.querySelector('#slider-engine-volume'),
            effectsVolume: root.querySelector('#slider-effects-volume'),
            muteBtn: root.querySelector('#btn-mute')
        };

        root.querySelectorAll('[data-group="graphicsQuality"] .option').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.values.graphicsQuality = btn.dataset.value;
                this._refresh();
                this._commit();
            });
        });
        root.querySelectorAll('[data-group="renderDistance"] .option').forEach((btn) => {
            btn.addEventListener('click', () => {
                this.values.renderDistance = btn.dataset.value;
                this._refresh();
                this._commit();
            });
        });
        this.el.shadows.addEventListener('change', () => { this.values.shadows = this.el.shadows.checked; this._commit(); });
        this.el.invertPitch.addEventListener('change', () => { this.values.invertPitch = this.el.invertPitch.checked; this._commit(); });
        this.el.cameraSensitivity.addEventListener('input', () => { this.values.cameraSensitivity = parseFloat(this.el.cameraSensitivity.value); this._commit(); });
        this.el.flightSensitivity.addEventListener('input', () => { this.values.flightSensitivity = parseFloat(this.el.flightSensitivity.value); this._commit(); });

        const audio = callbacks.audioManager;
        const vols = audio.getVolumes();
        this.el.masterVolume.value = vols.master;
        this.el.musicVolume.value = vols.music;
        this.el.engineVolume.value = vols.engine;
        this.el.effectsVolume.value = vols.effects;
        this.el.masterVolume.addEventListener('input', () => audio.setVolume('master', parseFloat(this.el.masterVolume.value)));
        this.el.musicVolume.addEventListener('input', () => audio.setVolume('music', parseFloat(this.el.musicVolume.value)));
        this.el.engineVolume.addEventListener('input', () => audio.setVolume('engine', parseFloat(this.el.engineVolume.value)));
        this.el.effectsVolume.addEventListener('input', () => audio.setVolume('effects', parseFloat(this.el.effectsVolume.value)));
        this.el.muteBtn.addEventListener('click', () => {
            const muted = !audio.getVolumes().muted;
            audio.setMuted(muted);
            this.el.muteBtn.textContent = muted ? '🔇 UNMUTE' : '🔊 MUTE';
        });

        root.querySelector('#btn-settings-back').addEventListener('click', () => callbacks.onBack());

        this._refresh();
    }

    _refresh() {
        this.el.graphicsQuality.forEach((btn) => btn.classList.toggle('selected', btn.dataset.value === this.values.graphicsQuality));
        this.el.renderDistance.forEach((btn) => btn.classList.toggle('selected', btn.dataset.value === this.values.renderDistance));
        this.el.shadows.checked = this.values.shadows;
        this.el.invertPitch.checked = this.values.invertPitch;
        this.el.cameraSensitivity.value = this.values.cameraSensitivity;
        this.el.flightSensitivity.value = this.values.flightSensitivity;
    }

    _commit() {
        Storage.set('settings', this.values);
        this.callbacks.onChange(this.values);
    }

    getValues() { return this.values; }

    show() { this.root.classList.remove('hidden'); }
    hide() { this.root.classList.add('hidden'); }
}
