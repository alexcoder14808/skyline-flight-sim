import * as THREE from 'three';
import { damp, clamp } from '../utils/MathUtils.js';

const MODES = ['chase', 'cockpit', 'external', 'free'];

/**
 * V2: chase and external cameras now support free-look (Page Up/Page Down
 * to look up/down, Left/Right arrows to look around) and Kerbal-Space-
 * Program-style scroll-to-zoom, independent of the flight controls (which
 * use W/A/S/D/Q/E/Up/Down — no key conflicts).
 */
export class CameraManager {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.modeIndex = 0;
        this.mode = MODES[this.modeIndex];

        this._chaseSmoothPos = new THREE.Vector3();
        this._chaseSmoothLookAt = new THREE.Vector3();
        this._initialized = false;

        // Free-look offset (applied on top of chase/external), and zoom
        // distance multiplier — both KSP-style, both independent of flight input.
        this.look = { yaw: 0, pitch: 0 };
        this.zoomMultiplier = 1.0; // 1 = default distance; <1 zoomed in, >1 zoomed out

        // Free camera (mode 'free') state — mouse-drag orbit, separate system.
        this.free = { yaw: 0, pitch: 0, distance: 60 };
        this._dragging = false;
        this._lastPointer = { x: 0, y: 0 };

        this._keysDown = new Set();
        this._bindLookControls();
        this._bindFreeCamControls();

        this._externalAngle = 0;
    }

    cycle() {
        this.modeIndex = (this.modeIndex + 1) % MODES.length;
        this.mode = MODES[this.modeIndex];
        // Reset free-look/zoom when changing modes so a new mode doesn't
        // inherit a disorienting leftover offset.
        this.look.yaw = 0;
        this.look.pitch = 0;
        return this.mode;
    }

    _bindLookControls() {
        window.addEventListener('keydown', (e) => {
            this._keysDown.add(e.code);
            if (['PageUp', 'PageDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
        });
        window.addEventListener('keyup', (e) => this._keysDown.delete(e.code));

        // Mouse wheel = zoom (KSP-style), works in chase/external/cockpit.
        this.domElement.addEventListener('wheel', (e) => {
            if (this.mode === 'free') return; // free cam has its own wheel-zoom below
            const delta = e.deltaY * 0.001;
            this.zoomMultiplier = clamp(this.zoomMultiplier * (1 + delta), 0.35, 4.0);
        }, { passive: true });
    }

    _updateLookFromKeys(dt) {
        const lookSpeed = 1.4; // rad/s
        let yawInput = 0, pitchInput = 0;
        if (this._keysDown.has('ArrowLeft')) yawInput += 1;
        if (this._keysDown.has('ArrowRight')) yawInput -= 1;
        if (this._keysDown.has('PageUp')) pitchInput += 1;
        if (this._keysDown.has('PageDown')) pitchInput -= 1;

        this.look.yaw += yawInput * lookSpeed * dt;
        this.look.pitch = clamp(this.look.pitch + pitchInput * lookSpeed * dt, -1.2, 1.2);

        // Slowly relax look-around back toward center when idle, so the
        // camera doesn't stay cranked sideways forever after you let go —
        // gentle enough that you have time to look around comfortably first.
        if (yawInput === 0) this.look.yaw = damp(this.look.yaw, 0, 2.5, dt);
        if (pitchInput === 0) this.look.pitch = damp(this.look.pitch, 0, 2.5, dt);
    }

    _bindFreeCamControls() {
        this.domElement.addEventListener('mousedown', (e) => {
            if (this.mode !== 'free') return;
            this._dragging = true;
            this._lastPointer = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('mouseup', () => { this._dragging = false; });
        window.addEventListener('mousemove', (e) => {
            if (!this._dragging || this.mode !== 'free') return;
            const dx = e.clientX - this._lastPointer.x;
            const dy = e.clientY - this._lastPointer.y;
            this._lastPointer = { x: e.clientX, y: e.clientY };
            this.free.yaw -= dx * 0.005;
            this.free.pitch = clamp(this.free.pitch - dy * 0.005, -1.3, 1.3);
        });
        this.domElement.addEventListener('wheel', (e) => {
            if (this.mode !== 'free') return;
            this.free.distance = clamp(this.free.distance + e.deltaY * 0.05, 10, 400);
        }, { passive: true });
    }

    update(dt, aircraft) {
        if (!aircraft || !aircraft.root) return;
        const root = aircraft.root;
        const cfg = aircraft.config;

        if (this.mode !== 'free') this._updateLookFromKeys(dt);

        if (this.mode === 'cockpit') {
            const offset = cfg.cockpitOffset;
            const worldPos = new THREE.Vector3(offset.x, offset.y, offset.z).applyQuaternion(root.quaternion).add(root.position);
            this.camera.position.copy(worldPos);
            const lookQuat = root.quaternion.clone().multiply(
                new THREE.Quaternion().setFromEuler(new THREE.Euler(this.look.pitch, this.look.yaw, 0, 'YXZ'))
            );
            const lookTarget = new THREE.Vector3(0, 0, -100).applyQuaternion(lookQuat).add(worldPos);
            this.camera.up.set(0, 1, 0);
            this.camera.lookAt(lookTarget);
        } else if (this.mode === 'chase') {
            const offset = cfg.chaseCameraOffset;
            const zoomed = new THREE.Vector3(offset.x, offset.y, offset.z).multiplyScalar(this.zoomMultiplier);
            // Apply free-look by rotating the offset around the aircraft before
            // adding the aircraft's own orientation.
            const lookRot = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.look.pitch * 0.5, this.look.yaw, 0, 'YXZ'));
            const rotatedOffset = zoomed.clone().applyQuaternion(lookRot);
            const desired = rotatedOffset.applyQuaternion(root.quaternion).add(root.position);
            if (!this._initialized) {
                this._chaseSmoothPos.copy(desired);
                this._chaseSmoothLookAt.copy(root.position);
                this._initialized = true;
            }
            this._chaseSmoothPos.x = damp(this._chaseSmoothPos.x, desired.x, 0.2, dt);
            this._chaseSmoothPos.y = damp(this._chaseSmoothPos.y, desired.y, 0.2, dt);
            this._chaseSmoothPos.z = damp(this._chaseSmoothPos.z, desired.z, 0.2, dt);
            this._chaseSmoothLookAt.lerp(root.position, 1 - Math.exp(-dt / 0.15));
            this.camera.position.copy(this._chaseSmoothPos);
            this.camera.up.set(0, 1, 0);
            this.camera.lookAt(this._chaseSmoothLookAt);
        } else if (this.mode === 'external') {
            this._externalAngle += dt * 0.1;
            const baseDist = Math.max(35, cfg.targetLengthMeters * 1.4) * this.zoomMultiplier;
            const yaw = this._externalAngle + this.look.yaw;
            const pitch = 0.35 + this.look.pitch * 0.6;
            const orbit = new THREE.Vector3(
                Math.sin(yaw) * baseDist * Math.cos(pitch),
                baseDist * Math.sin(pitch) + baseDist * 0.35,
                Math.cos(yaw) * baseDist * Math.cos(pitch)
            );
            this.camera.position.copy(root.position).add(orbit);
            this.camera.up.set(0, 1, 0);
            this.camera.lookAt(root.position);
        } else if (this.mode === 'free') {
            const dir = new THREE.Vector3(
                Math.cos(this.free.pitch) * Math.sin(this.free.yaw),
                Math.sin(this.free.pitch),
                Math.cos(this.free.pitch) * Math.cos(this.free.yaw)
            );
            const pos = root.position.clone().add(dir.multiplyScalar(this.free.distance));
            this.camera.position.copy(pos);
            this.camera.up.set(0, 1, 0);
            this.camera.lookAt(root.position);
        }
    }
}
