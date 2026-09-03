export class PauseMenu {
    constructor(root, callbacks) {
        this.root = root;
        root.querySelector('#btn-resume').addEventListener('click', () => callbacks.onResume());
        root.querySelector('#btn-pause-map').addEventListener('click', () => callbacks.onMap());
        root.querySelector('#btn-pause-restart').addEventListener('click', () => callbacks.onRestart());
        root.querySelector('#btn-pause-settings').addEventListener('click', () => callbacks.onSettings());
        root.querySelector('#btn-pause-menu').addEventListener('click', () => callbacks.onMainMenu());
    }
    show() { this.root.classList.remove('hidden'); }
    hide() { this.root.classList.add('hidden'); }
}

export class CrashScreen {
    constructor(root, callbacks) {
        this.root = root;
        this.reasonEl = root.querySelector('#crash-reason');
        root.querySelector('#btn-crash-restart').addEventListener('click', () => callbacks.onRestart());
        root.querySelector('#btn-crash-menu').addEventListener('click', () => callbacks.onMainMenu());
    }
    show(reason) {
        this.reasonEl.textContent = reason || 'Flight terminated.';
        this.root.classList.remove('hidden');
    }
    hide() { this.root.classList.add('hidden'); }
}

export class LandingScreen {
    constructor(root, callbacks) {
        this.root = root;
        this.touchdownEl = root.querySelector('#landing-touchdown-speed');
        this.vsEl = root.querySelector('#landing-vs');
        root.querySelector('#btn-landing-again').addEventListener('click', () => callbacks.onFlyAgain());
        root.querySelector('#btn-landing-menu').addEventListener('click', () => callbacks.onMainMenu());
    }
    show(touchdownKnots, vsFpm) {
        this.touchdownEl.textContent = Math.round(touchdownKnots);
        this.vsEl.textContent = Math.round(vsFpm);
        this.root.classList.remove('hidden');
    }
    hide() { this.root.classList.add('hidden'); }
}
