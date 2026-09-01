import { Storage } from '../utils/Storage.js';

const DEFAULTS = {
    startPosition: 'runway', // 'runway' | 'parking'
    timeOfDay: 'day',        // 'day' | 'sunset' | 'night'
    weather: 'clear',        // 'clear' | 'cloudy'
    wind: 'calm'             // 'calm' | 'light' | 'moderate'
};

export class FlightSetup {
    constructor(root, callbacks) {
        this.root = root;
        this.callbacks = callbacks;
        this.options = Storage.get('flightSetup', DEFAULTS);

        this.groups = {
            startPosition: root.querySelectorAll('[data-group="startPosition"] .option'),
            timeOfDay: root.querySelectorAll('[data-group="timeOfDay"] .option'),
            weather: root.querySelectorAll('[data-group="weather"] .option'),
            wind: root.querySelectorAll('[data-group="wind"] .option')
        };

        Object.entries(this.groups).forEach(([groupName, nodeList]) => {
            nodeList.forEach((btn) => {
                btn.addEventListener('click', () => {
                    this.options[groupName] = btn.dataset.value;
                    this._refreshSelection();
                    this._save();
                });
            });
        });

        root.querySelector('#btn-setup-back').addEventListener('click', () => callbacks.onBack());
        root.querySelector('#btn-setup-fly').addEventListener('click', () => callbacks.onFly(this.options));

        this._refreshSelection();
    }

    _refreshSelection() {
        Object.entries(this.groups).forEach(([groupName, nodeList]) => {
            nodeList.forEach((btn) => {
                btn.classList.toggle('selected', btn.dataset.value === this.options[groupName]);
            });
        });
    }

    _save() {
        Storage.set('flightSetup', this.options);
    }

    getOptions() {
        return this.options;
    }

    show() { this.root.classList.remove('hidden'); }
    hide() { this.root.classList.add('hidden'); }
}
