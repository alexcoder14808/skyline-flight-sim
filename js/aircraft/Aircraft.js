import * as THREE from 'three';
import { AircraftLoader } from './AircraftLoader.js';
import { FlightPhysics } from './FlightPhysics.js';
import { getAircraftConfig } from './AircraftConfig.js';
import { clamp, damp } from '../utils/MathUtils.js';

export class Aircraft {
    constructor(aircraftId = 'uploaded_airliner') {
        this.config = getAircraftConfig(aircraftId);
        this.physics = new FlightPhysics(this.config);
        this.loaded = null; // set after load()
        this._gearAnim = 1; // 1 = fully down, 0 = fully retracted
        this._flapAnim = 0;
        this._propSpin = 0;
        this._lightsBlinkT = 0;
    }

    async load(onProgress) {
        this.loaded = await AircraftLoader.load(this.config, onProgress);
        return this.loaded;
    }

    get root() {
        return this.loaded ? this.loaded.root : null;
    }

    reset(position, headingRad) {
        this.physics.reset(position, headingRad);
    }

    /** Push smoothed control state (from AircraftControls) into the physics model. */
    applyControls(controlState) {
        const c = this.physics.controls;
        c.pitch = controlState.pitch;
        c.roll = controlState.roll;
        c.yaw = controlState.yaw;
        c.throttle = controlState.throttle;
        c.flaps = controlState.flaps;
        c.gearDown = controlState.gearDown;
        c.brakes = controlState.brakes;
        c.parkingBrake = controlState.parkingBrake;
    }

    step(dt, groundHeightFn) {
        this.physics.step(dt, groundHeightFn);
        this._syncVisuals(dt);
    }

    _syncVisuals(dt) {
        if (!this.loaded) return;
        const root = this.loaded.root;
        root.position.copy(this.physics.position);
        root.quaternion.copy(this.physics.quaternion);

        const cfg = this.config;
        const surf = this.loaded.controlSurfaces;
        const maxDef = cfg.maxDeflection;
        const c = this.physics.controls;

        // Ailerons deflect opposite on each wing.
        surf.leftAileron.rotation.x = c.roll * maxDef.aileron;
        surf.rightAileron.rotation.x = -c.roll * maxDef.aileron;
        // Elevator follows pitch input.
        surf.elevator.rotation.x = c.pitch * maxDef.elevator;
        // Rudder follows yaw input.
        surf.rudder.rotation.y = c.yaw * maxDef.rudder;

        // Gear retraction animation (visual lerp over ~1.5s)
        const gearTarget = c.gearDown ? 1 : 0;
        this._gearAnim = damp(this._gearAnim, gearTarget, 0.35, dt);
        const gearGroup = this.loaded.gear.group;
        gearGroup.visible = this._gearAnim > 0.02;
        gearGroup.userData.units.forEach((unit, i) => {
            const extendedY = gearGroup.userData.extendedY[i];
            unit.position.y = extendedY - (1 - this._gearAnim) * 1.4;
            unit.scale.y = clamp(this._gearAnim + 0.15, 0.15, 1);
        });

        // Flap visual droop
        this._flapAnim = damp(this._flapAnim, c.flaps, 0.2, dt);
        // (Ailerons double as flap surrogate visual since we only modeled one
        // pair of trailing-edge panels per side; tilt them down additionally
        // when flaps are extended, on top of aileron input.)
        surf.leftAileron.rotation.x += this._flapAnim * maxDef.flap * 0.5;
        surf.rightAileron.rotation.x += this._flapAnim * maxDef.flap * 0.5;

        // Lights: nav lights always on when engine on; beacon blinks; strobes
        // handled via beacon flashing; landing lights on below 300m AGL or gear down.
        const lights = this.loaded.lights;
        const engineRunning = this.physics.engineOn;
        lights.navLeft.intensity = engineRunning ? 2 : 0;
        lights.navRight.intensity = engineRunning ? 2 : 0;
        this._lightsBlinkT += dt;
        const blink = Math.sin(this._lightsBlinkT * 6) > 0.85 ? 4 : 0;
        lights.beacon.intensity = engineRunning ? blink : 0;
        const wantLanding = c.gearDown || this.physics.telemetry.altitude < 300;
        lights.landing.intensity = engineRunning && wantLanding ? 8 : 0;
    }

    /** Returns a world-space position slightly ahead of the aircraft for chase cams etc. */
    getForwardVector() {
        return new THREE.Vector3(0, 0, -1).applyQuaternion(this.physics.quaternion);
    }
}
