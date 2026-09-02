export class MainMenu {
    constructor(root, callbacks) {
        this.root = root;
        this.callbacks = callbacks;
        this.root.querySelector('#btn-fly').addEventListener('click', () => callbacks.onFly());
        this.root.querySelector('#btn-flight-setup').addEventListener('click', () => callbacks.onFlightSetup());
        this.root.querySelector('#btn-map').addEventListener('click', () => callbacks.onMap());
        this.root.querySelector('#btn-settings').addEventListener('click', () => callbacks.onSettings());
        this.root.querySelector('#btn-controls').addEventListener('click', () => callbacks.onControls());
        this.root.querySelector('#btn-about').addEventListener('click', () => callbacks.onAbout());
    }

    show() { this.root.classList.remove('hidden'); }
    hide() { this.root.classList.add('hidden'); }
}
