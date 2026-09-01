import * as THREE from 'three';
import { damp } from '../utils/MathUtils.js';

const MODES = ['chase', 'cockpit', 'external', 'free'];

export class CameraManager {
    constructor(camera, domElement) {
        this.camera = camera;
        this.domElement = domElement;
        this.modeIndex = 0;
        this.mode = MODES[this.modeIndex];

        this._chaseSmoothPos = new THREE.Vector3();
        this._chaseSmoothLookAt = new THREE.Vector3();
        this._initialized = false;

        // Free camera state
        this.free = { yaw: 0, pitch: 0, distance: 60 };
        this._dragging = false;
        this._lastPointer = { x: 0, y: 0 };
        this._bindFreeCamControls();

        // External orbit angle
        this._externalAngle = 0;
    }

    cycle() {
        this.modeIndex = (this.modeIndex + 1) % MODES.length;
        this.mode = MODES[this.modeIndex];
        return this.mode;
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
            this.free.pitch = THREE.MathUtils.clamp(this.free.pitch - dy * 0.005, -1.3, 1.3);
        });
        this.domElement.addEventListener('wheel', (e) => {
            if (this.mode !== 'free') return;
            this.free.distance = THREE.MathUtils.clamp(this.free.distance + e.deltaY * 0.05, 10, 300);
        }, { passive: true });
    }

    update(dt, aircraft) {
        if (!aircraft || !aircraft.root) return;
        const root = aircraft.root;
        const cfg = aircraft.config;

        if (this.mode === 'cockpit') {
            const offset = cfg.cockpitOffset;
            const worldPos = new THREE.Vector3(offset.x, offset.y, offset.z).applyQuaternion(root.quaternion).add(root.position);
            this.camera.position.copy(worldPos);
            const lookTarget = new THREE.Vector3(0, 0, -100).applyQuaternion(root.quaternion).add(worldPos);
            this.camera.up.set(0, 1, 0);
            this.camera.lookAt(lookTarget);
        } else if (this.mode === 'chase') {
            const offset = cfg.chaseCameraOffset;
            const desired = new THREE.Vector3(offset.x, offset.y, offset.z).applyQuaternion(root.quaternion).add(root.position);
            if (!this._initialized) {
                this._chaseSmoothPos.copy(desired);
                this._chaseSmoothLookAt.copy(root.position);
                this._initialized = true;
            }
            this._chaseSmoothPos.x = damp(this._chaseSmoothPos.x, desired.x, 0.25, dt);
            this._chaseSmoothPos.y = damp(this._chaseSmoothPos.y, desired.y, 0.25, dt);
            this._chaseSmoothPos.z = damp(this._chaseSmoothPos.z, desired.z, 0.25, dt);
            this._chaseSmoothLookAt.lerp(root.position, 1 - Math.exp(-dt / 0.15));
            this.camera.position.copy(this._chaseSmoothPos);
            this.camera.up.set(0, 1, 0);
            this.camera.lookAt(this._chaseSmoothLookAt);
        } else if (this.mode === 'external') {
            this._externalAngle += dt * 0.15;
            const dist = Math.max(35, cfg.targetLengthMeters * 1.4);
            const height = dist * 0.35;
            const orbit = new THREE.Vector3(Math.sin(this._externalAngle) * dist, height, Math.cos(this._externalAngle) * dist);
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
