import * as THREE from 'three';
import { clamp, lerp, damp } from '../utils/MathUtils.js';

const GRAVITY = 9.81;
const AIR_DENSITY_SEA_LEVEL = 1.225; // kg/m^3

/**
 * A modular, believable-but-not-professional-grade flight model.
 * Works entirely in SI units internally (metres, seconds, kg, radians).
 * Coordinate convention (documented, see README "Physics coordinate system"):
 *   - World Y is up.
 *   - Aircraft local forward is -Z, local up is +Y, local right is +X.
 *   - Physics operates on the AircraftRoot object (position + quaternion),
 *     never directly on the loaded mesh.
 */
export class FlightPhysics {
    constructor(config) {
        this.config = config;

        // World-space state
        this.position = new THREE.Vector3(0, 2, 0);
        this.velocity = new THREE.Vector3(0, 0, 0); // m/s, world space
        this.quaternion = new THREE.Quaternion();

        // Body-space angular rates (rad/s): x=pitch rate, y=yaw rate, z=roll rate
        this.angularVelocity = new THREE.Vector3(0, 0, 0);

        // Control inputs, normalized -1..1 (or 0..1 for throttle/flaps)
        this.controls = {
            pitch: 0, roll: 0, yaw: 0,
            throttle: 0,
            flaps: 0,      // 0..1
            gearDown: true,
            brakes: 0,     // 0..1
            parkingBrake: false
        };

        this.currentThrustFraction = 0; // spooled thrust, lags `throttle`
        this.fuelLiters = config.fuel.capacityLiters;
        this.engineOn = true;

        this.onGround = true;
        this.groundContact = { left: false, right: false, nose: false };
        this.crashed = false;
        this.lastCrashReason = null;

        // Debug/HUD readouts, recomputed each step
        this.telemetry = {
            airspeed: 0, verticalSpeed: 0, altitude: 0, heading: 0,
            pitchDeg: 0, rollDeg: 0, aoaDeg: 0,
            lift: 0, drag: 0, thrust: 0, gForce: 1,
            stalling: false, groundElevation: 0
        };

        this.wind = new THREE.Vector3(0, 0, 0); // world-space wind velocity, m/s

        this._tmpVec = new THREE.Vector3();
        this._tmpQuat = new THREE.Quaternion();
    }

    reset(position, headingRad = 0) {
        this.position.copy(position);
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        this.quaternion.setFromEuler(new THREE.Euler(0, headingRad, 0, 'YXZ'));
        this.currentThrustFraction = 0;
        this.controls.throttle = 0;
        this.controls.flaps = 0;
        this.controls.gearDown = true;
        this.controls.brakes = 0;
        this.controls.parkingBrake = true;
        this.fuelLiters = this.config.fuel.capacityLiters;
        this.engineOn = true;
        this.onGround = true;
        this.crashed = false;
        this.lastCrashReason = null;
    }

    // groundHeightFn(x, z) -> terrain elevation at that point, used for ground contact.
    step(dt, groundHeightFn) {
        if (this.crashed) return;
        dt = clamp(dt, 0, 1 / 15); // clamp huge dt spikes (tab switch, etc) for stability

        const cfg = this.config;
        const forward = this._axisVector(0, 0, -1);
        const up = this._axisVector(0, 1, 0);
        const right = this._axisVector(1, 0, 0);

        // ---- Airspeed / body-frame velocity ----
        const airVelocity = this._tmpVec.copy(this.velocity).sub(this.wind);
        const bodyForwardSpeed = airVelocity.dot(forward);
        const bodyUpSpeed = airVelocity.dot(up);
        const bodyRightSpeed = airVelocity.dot(right);
        const airspeed = airVelocity.length();

        // Angle of attack: angle between forward axis and the velocity vector
        // projected into the aircraft's pitch plane.
        let aoa = 0;
        if (airspeed > 0.5) {
            aoa = Math.atan2(-bodyUpSpeed, Math.max(bodyForwardSpeed, 0.01));
        }
        // Sideslip (used lightly for yaw stability / rudder authority)
        const sideslip = airspeed > 0.5 ? Math.atan2(bodyRightSpeed, Math.max(bodyForwardSpeed, 0.01)) : 0;

        // ---- Engine ----
        const spoolRate = dt / Math.max(cfg.engine.spoolTime, 0.1);
        const targetThrustFraction = this.engineOn && this.fuelLiters > 0 ? this.controls.throttle : 0;
        this.currentThrustFraction = damp(this.currentThrustFraction, targetThrustFraction, cfg.engine.spoolTime, dt);
        const idleFrac = cfg.engine.idleThrustFraction;
        const effectiveThrustFrac = this.engineOn && this.fuelLiters > 0
            ? Math.max(this.currentThrustFraction, idleFrac * (this.controls.throttle >= 0 ? 1 : 0))
            : 0;
        const maxThrust = cfg.engine.maxThrustPerEngine * cfg.engineCount;
        const thrust = maxThrust * effectiveThrustFrac;

        // Fuel burn
        if (this.engineOn && this.fuelLiters > 0) {
            this.fuelLiters = Math.max(0, this.fuelLiters - thrust * dt * cfg.fuel.burnRatePerNewtonSecond);
        }
        if (this.fuelLiters <= 0) this.engineOn = false;

        // ---- Aerodynamics ----
        const flapsCL = cfg.liftCoefficient.flapsBonus * this.controls.flaps;
        const flapsCD = cfg.dragCoefficient.flapsBonus * this.controls.flaps;
        const maxCL = lerp(cfg.liftCoefficient.maxClean, cfg.liftCoefficient.maxFlaps, this.controls.flaps);

        let cl = cfg.liftCoefficient.zero + cfg.liftCoefficient.perRadian * aoa + flapsCL;
        const stallAngle = THREE.MathUtils.degToRad(cfg.stallAngleDeg || 16);
        const stalling = Math.abs(cl) > maxCL || Math.abs(aoa) > stallAngle;
        if (stalling) {
            // Post-stall: lift drops off, drag rises sharply.
            const over = Math.min(1, (Math.abs(aoa) - stallAngle * 0.85) / (stallAngle * 0.6));
            cl = Math.sign(cl) * maxCL * (1 - 0.6 * clamp(over, 0, 1));
        }
        cl = clamp(cl, -2.4, 2.4);

        // Ground effect: within roughly one wingspan of the ground, induced
        // drag drops and effective lift rises — this is real aerodynamics
        // (not an arcade hack), and it also has the friendly side effect of
        // giving the aircraft an extra nudge right at rotation speed.
        const wingSpan = cfg.wingSpanMeters || Math.sqrt(cfg.wingArea * 6);
        const heightAGL = Math.max(0, this.position.y - (groundHeightFn ? groundHeightFn(this.position.x, this.position.z) : 0));
        const groundEffectFactor = heightAGL < wingSpan ? 1 + 0.18 * (1 - heightAGL / wingSpan) : 1;
        cl *= groundEffectFactor;

        const gearCD = this.controls.gearDown ? cfg.dragCoefficient.gearBonus : 0;
        const speedBrakeCD = this.controls.brakes > 0.5 ? cfg.dragCoefficient.speedBrakeBonus : 0;
        const cd = cfg.dragCoefficient.zero + cfg.dragCoefficient.inducedFactor * cl * cl + flapsCD + gearCD + speedBrakeCD
            + (stalling ? 0.05 : 0);

        const rho = AIR_DENSITY_SEA_LEVEL * Math.exp(-Math.max(0, this.position.y) / 9000); // crude density falloff
        const q = 0.5 * rho * airspeed * airspeed; // dynamic pressure
        const liftForceMag = q * cfg.wingArea * cl;
        const dragForceMag = q * cfg.wingArea * cd;

        // Lift acts along body "up", drag acts opposite the air-velocity direction.
        const liftDir = up.clone();
        const dragDir = airspeed > 0.1 ? airVelocity.clone().normalize().negate() : new THREE.Vector3();
        const thrustDir = forward.clone();
        const weight = new THREE.Vector3(0, -cfg.mass * GRAVITY, 0);

        const liftForce = liftDir.multiplyScalar(liftForceMag);
        const dragForce = dragDir.multiplyScalar(dragForceMag);
        const thrustForce = thrustDir.multiplyScalar(thrust);

        const totalForce = new THREE.Vector3().add(liftForce).add(dragForce).add(thrustForce).add(weight);
        let acceleration = totalForce.clone().divideScalar(cfg.mass);

        // ---- Ground handling ----
        const groundElevation = groundHeightFn ? groundHeightFn(this.position.x, this.position.z) : 0;
        const gearHeight = this.controls.gearDown ? cfg.gearHeight : cfg.gearHeight * 0.35;
        const beltHeightAboveGround = this.position.y - groundElevation;
        this.onGround = beltHeightAboveGround <= gearHeight + 0.05;

        if (this.onGround) {
            // Crash check: hard landing, gear up, or excessive bank/pitch on touch.
            const impactSpeed = -Math.min(0, this.velocity.y);
            const rollDeg = THREE.MathUtils.radToDeg(this._currentRoll());
            const pitchDeg = THREE.MathUtils.radToDeg(this._currentPitch());
            const tooFast = airspeed > cfg.stallSpeed * 2.2;

            if (!this.controls.gearDown && bodyForwardSpeed > 3) {
                this._crash('Gear-up landing');
            } else if (impactSpeed > 8) {
                this._crash('Excessive sink rate on touchdown');
            } else if (Math.abs(rollDeg) > 25) {
                this._crash('Excessive bank angle at touchdown');
            } else if (Math.abs(pitchDeg) > 15 && bodyForwardSpeed > 5) {
                this._crash('Tail strike / excessive pitch on touchdown');
            }

            if (!this.crashed) {
                // Snap to ground, kill vertical velocity, apply rolling friction/braking.
                this.position.y = groundElevation + gearHeight;
                acceleration.y = Math.max(acceleration.y, 0);
                if (this.velocity.y < 0) this.velocity.y = 0;

                const rollingFriction = 0.02;
                const brakeFriction = this.controls.brakes * 0.45 + (this.controls.parkingBrake ? 0.9 : 0);
                const totalFriction = clamp(rollingFriction + brakeFriction, 0, 0.95);
                const groundSpeed = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
                const speedMag = groundSpeed.length();
                if (speedMag > 0.05) {
                    const frictionDecel = totalFriction * GRAVITY;
                    const newSpeed = Math.max(0, speedMag - frictionDecel * dt);
                    groundSpeed.setLength(newSpeed);
                    this.velocity.x = groundSpeed.x;
                    this.velocity.z = groundSpeed.z;
                } else {
                    this.velocity.x = 0;
                    this.velocity.z = 0;
                }

                // Ground steering via rudder input at taxi speed.
                if (speedMag > 0.3) {
                    const steerRate = tooFast ? 0 : this.controls.yaw * 0.6 * clamp(speedMag / 8, 0, 1);
                    this.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steerRate * dt));
                }
            }
        }

        if (!this.crashed) {
            // ---- Integrate linear motion ----
            this.velocity.addScaledVector(acceleration, dt);
            this.position.addScaledVector(this.velocity, dt);

            // ---- Rotational dynamics (only meaningful authority in the air,
            // but light authority preserved on ground for steering/rotation) ----
            const authoritySpeed = clamp(airspeed / Math.max(cfg.stallSpeed, 1), 0, 1.6);
            const sens = cfg.controlSensitivity;
            const maxDef = cfg.maxDeflection;

            const targetPitchRate = this.controls.pitch * sens.pitch * maxDef.elevator * authoritySpeed * 1.6;

            // Wings-level assist (V2 "easier controls"): when the player
            // isn't actively rolling, gently pull bank angle back toward
            // zero instead of leaving the aircraft to drift in whatever
            // bank it was last put in. Fades out completely as soon as the
            // player gives real roll input, so it never fights a turn.
            const rollInputMag = Math.abs(this.controls.roll);
            const assistStrength = cfg.rollAssistGain || 0;
            const rollAssistRate = assistStrength > 0
                ? -this._currentRoll() * assistStrength * Math.max(0, 1 - rollInputMag * 3)
                : 0;
            const targetRollRate = this.controls.roll * sens.roll * maxDef.aileron * authoritySpeed * 2.2 + rollAssistRate;

            const targetYawRate = (this.controls.yaw * sens.yaw * maxDef.rudder * authoritySpeed * 1.1)
                - sideslip * 0.4 * authoritySpeed; // weak weathervane stability

            const rateSmoothing = 0.35;
            this.angularVelocity.x = damp(this.angularVelocity.x, targetPitchRate, rateSmoothing, dt);
            this.angularVelocity.z = damp(this.angularVelocity.z, targetRollRate, rateSmoothing, dt);
            this.angularVelocity.y = damp(this.angularVelocity.y, targetYawRate, rateSmoothing, dt);

            if (!this.onGround) {
                // pitch (x), yaw (y), roll (z) applied as body-frame rotations
                const dq = new THREE.Quaternion().setFromEuler(
                    new THREE.Euler(this.angularVelocity.x * dt, this.angularVelocity.y * dt, this.angularVelocity.z * dt, 'YXZ')
                );
                this.quaternion.multiply(dq);
                this.quaternion.normalize();
            } else {
                // On ground: only allow yaw (steering handled above) — keep wings level.
                const euler = new THREE.Euler().setFromQuaternion(this.quaternion, 'YXZ');
                euler.z = damp(euler.z, 0, 0.3, dt);
                euler.x = damp(euler.x, 0, 0.3, dt);
                this.quaternion.setFromEuler(euler);
            }
        }

        // ---- Telemetry ----
        const euler = new THREE.Euler().setFromQuaternion(this.quaternion, 'YXZ');
        this.telemetry.airspeed = airspeed;
        this.telemetry.verticalSpeed = this.velocity.y;
        this.telemetry.altitude = Math.max(0, this.position.y - groundElevation);
        this.telemetry.heading = ((THREE.MathUtils.radToDeg(euler.y) % 360) + 360) % 360;
        this.telemetry.pitchDeg = THREE.MathUtils.radToDeg(euler.x) * -1;
        this.telemetry.rollDeg = THREE.MathUtils.radToDeg(euler.z) * -1;
        this.telemetry.aoaDeg = THREE.MathUtils.radToDeg(aoa);
        this.telemetry.lift = liftForceMag;
        this.telemetry.drag = dragForceMag;
        this.telemetry.thrust = thrust;
        this.telemetry.stalling = stalling && airspeed > 5;
        this.telemetry.groundElevation = groundElevation;
        this.telemetry.gForce = 1 + acceleration.y / GRAVITY;
    }

    _axisVector(x, y, z) {
        return new THREE.Vector3(x, y, z).applyQuaternion(this.quaternion).normalize();
    }

    _currentRoll() {
        return new THREE.Euler().setFromQuaternion(this.quaternion, 'YXZ').z;
    }
    _currentPitch() {
        return new THREE.Euler().setFromQuaternion(this.quaternion, 'YXZ').x;
    }

    _crash(reason) {
        this.crashed = true;
        this.lastCrashReason = reason;
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
    }
}
