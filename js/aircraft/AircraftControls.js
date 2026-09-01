import { clamp, damp } from '../utils/MathUtils.js';

const KEY_BINDINGS = {
    pitchUp: ['KeyS'],
    pitchDown: ['KeyW'],
    rollLeft: ['KeyA'],
    rollRight: ['KeyD'],
    yawLeft: ['KeyQ'],
    yawRight: ['KeyE'],
    throttleUp: ['ArrowUp'],
    throttleDown: ['ArrowDown'],
    gear: ['KeyG'],
    flaps: ['KeyF'],
    brakes: ['KeyB'],
    cameraCycle: ['KeyC'],
    pause: ['KeyP', 'Escape'],
    reset: ['KeyR'],
    parkingBrake: ['Space'],
    debug: ['Backquote']
};

/**
 * Reads raw keyboard (and, if present, gamepad) state and exposes smoothed,
 * normalized control axes. Nothing here touches physics directly — it just
 * produces `this.state`, which FlightPhysics.controls is set from each frame.
 */
export class AircraftControls {
    constructor(inputSettings = {}) {
        this.keysDown = new Set();
        this.invertPitch = !!inputSettings.invertPitch;
        this.sensitivity = inputSettings.sensitivity || 1.0;

        // Raw target axes (-1..1 or 0..1), before smoothing
        this.raw = { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0 };
        // Smoothed output axes actually consumed by physics
        this.state = {
            pitch: 0, roll: 0, yaw: 0,
            throttle: 0,
            flaps: 0,
            gearDown: true,
            brakes: 0,
            parkingBrake: false
        };

        this._flapsSteps = 4; // 0, 0.33, 0.66, 1.0
        this._flapsIndex = 0;
        this._gearToggleLatch = false;
        this._flapsLatch = false;
        this._cameraLatch = false;
        this._pauseLatch = false;
        this._resetLatch = false;
        this._debugLatch = false;
        this._brakeHeld = false;
        this._parkingBrakeLatch = false;

        this.enabled = true;

        this.events = { cameraCycle: false, pause: false, reset: false, debugToggle: false };

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);

        this._gamepadIndex = null;
        window.addEventListener('gamepadconnected', (e) => { this._gamepadIndex = e.gamepad.index; });
        window.addEventListener('gamepaddisconnected', () => { this._gamepadIndex = null; });
    }

    dispose() {
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
    }

    _onKeyDown(e) {
        if (!this.enabled) return;
        this.keysDown.add(e.code);
        // Prevent page scroll on arrow keys / space
        if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    }
    _onKeyUp(e) {
        this.keysDown.delete(e.code);
    }

    _held(action) {
        return KEY_BINDINGS[action].some((code) => this.keysDown.has(code));
    }

    /** Call once per frame with dt in seconds. */
    update(dt) {
        this.events.cameraCycle = false;
        this.events.pause = false;
        this.events.reset = false;
        this.events.debugToggle = false;

        if (!this.enabled) return;

        this._readGamepad();

        // --- Pitch / roll / yaw target axes ---
        let pitchTarget = 0;
        if (this._held('pitchUp')) pitchTarget += 1;
        if (this._held('pitchDown')) pitchTarget -= 1;
        if (this.invertPitch) pitchTarget *= -1;

        let rollTarget = 0;
        if (this._held('rollRight')) rollTarget += 1;
        if (this._held('rollLeft')) rollTarget -= 1;

        let yawTarget = 0;
        if (this._held('yawRight')) yawTarget += 1;
        if (this._held('yawLeft')) yawTarget -= 1;

        // Blend in gamepad axes if connected (additive, then clamp)
        pitchTarget = clamp(pitchTarget + this._gamepadAxes.pitch, -1, 1);
        rollTarget = clamp(rollTarget + this._gamepadAxes.roll, -1, 1);
        yawTarget = clamp(yawTarget + this._gamepadAxes.yaw, -1, 1);

        const smoothing = 0.12 / Math.max(this.sensitivity, 0.1);
        this.state.pitch = damp(this.state.pitch, pitchTarget, smoothing, dt);
        this.state.roll = damp(this.state.roll, rollTarget, smoothing, dt);
        this.state.yaw = damp(this.state.yaw, yawTarget, smoothing, dt);

        // --- Throttle (persistent, incremented/decremented) ---
        let throttleDelta = 0;
        if (this._held('throttleUp')) throttleDelta += 0.6 * dt;
        if (this._held('throttleDown')) throttleDelta -= 0.6 * dt;
        throttleDelta += this._gamepadAxes.throttleDelta * dt;
        this.state.throttle = clamp(this.state.throttle + throttleDelta, 0, 1);

        // --- Toggles (latched so holding the key doesn't repeat-fire) ---
        this._latch('gear', () => { this.state.gearDown = !this.state.gearDown; });
        this._latch('flaps', () => {
            this._flapsIndex = (this._flapsIndex + 1) % this._flapsSteps;
            this.state.flaps = this._flapsIndex / (this._flapsSteps - 1);
        });
        this._latch('cameraCycle', () => { this.events.cameraCycle = true; });
        this._latch('pause', () => { this.events.pause = true; });
        this._latch('reset', () => { this.events.reset = true; });
        this._latch('debug', () => { this.events.debugToggle = true; });
        this._latch('parkingBrake', () => { this.state.parkingBrake = !this.state.parkingBrake; });

        this.state.brakes = this._held('brakes') ? 1 : 0;
    }

    _latch(action, fn) {
        const key = '_' + action + 'Latch';
        const isHeld = this._held(action);
        if (isHeld && !this[key]) {
            fn();
            this[key] = true;
        } else if (!isHeld) {
            this[key] = false;
        }
    }

    _readGamepad() {
        this._gamepadAxes = { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0 };
        if (this._gamepadIndex === null || !navigator.getGamepads) return;
        const pads = navigator.getGamepads();
        const pad = pads[this._gamepadIndex];
        if (!pad) return;
        const deadzone = 0.12;
        const dz = (v) => (Math.abs(v) < deadzone ? 0 : v);
        // Left stick: roll (axis 0), pitch (axis 1)
        this._gamepadAxes.roll = dz(pad.axes[0] || 0);
        this._gamepadAxes.pitch = dz(pad.axes[1] || 0) * (this.invertPitch ? -1 : 1);
        // Right stick X: rudder
        this._gamepadAxes.yaw = dz(pad.axes[2] || 0);
        // Triggers (buttons 6/7 on standard mapping): throttle up/down
        const rt = pad.buttons[7] ? pad.buttons[7].value : 0;
        const lt = pad.buttons[6] ? pad.buttons[6].value : 0;
        this._gamepadAxes.throttleDelta = rt - lt;
        // Buttons: A=gear(0), X=flaps(2), Y=camera(3), B=brakes handled via held check below
        if (pad.buttons[0] && pad.buttons[0].pressed && !this._padGearLatch) { this.state.gearDown = !this.state.gearDown; this._padGearLatch = true; }
        else if (!(pad.buttons[0] && pad.buttons[0].pressed)) { this._padGearLatch = false; }
    }

    setSensitivity(v) { this.sensitivity = v; }
    setInvertPitch(v) { this.invertPitch = v; }
}
