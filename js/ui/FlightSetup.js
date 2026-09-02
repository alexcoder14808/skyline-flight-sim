import { Storage } from '../utils/Storage.js';

const DEFAULTS = {
    airport: 'skyline',
    startPosition: 'runway', // 'runway' | 'parking'
    timeOfDay: 'day',        // 'day' | 'sunset' | 'night'
    weather: 'clear',        // 'clear' | 'cloudy'
    wind: 'calm'             // 'calm' | 'light' | 'moderate'
};

export class FlightSetup {
    constructor(root, callbacks) {
        this.root = root;
        this.callbacks = callbacks;
        this.options = Object.assign({}, DEFAULTS, Storage.get('flightSetup', {}));

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

    /** Called once from main.js after World exists, so airport buttons are data-driven. */
    populateAirports(airportList) {
        const row = this.root.querySelector('#airport-option-row');
        row.innerHTML = '';
        airportList.forEach((a) => {
            const btn = document.createElement('div');
            btn.className = 'option';
            btn.dataset.value = a.id;
            btn.textContent = `${a.code} — ${a.name}`;
            btn.addEventListener('click', () => {
                this.options.airport = a.id;
                this._refreshSelection();
                this._save();
            });
            row.appendChild(btn);
        });
        this.groups.airport = row.querySelectorAll('.option');
        if (!airportList.some((a) => a.id === this.options.airport)) {
            this.options.airport = airportList[0] ? airportList[0].id : 'skyline';
        }
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
