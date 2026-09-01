import { msToKnots, metersToFeet, msToFpm } from '../utils/MathUtils.js';
import { ArtificialHorizon } from './Instruments.js';

export class HUD {
    constructor(root) {
        this.root = root;
        this.root.innerHTML = `
            <div class="hud-top-left">
                <div class="hud-tape">
                    <div class="hud-label">AIRSPEED</div>
                    <div class="hud-value" id="hud-airspeed">0</div>
                    <div class="hud-unit">KT</div>
                </div>
            </div>
            <div class="hud-top-right">
                <div class="hud-tape">
                    <div class="hud-label">ALTITUDE</div>
                    <div class="hud-value" id="hud-altitude">0</div>
                    <div class="hud-unit">FT</div>
                </div>
            </div>
            <div class="hud-center-top">
                <div class="hud-heading" id="hud-heading-strip"></div>
            </div>
            <div class="hud-ahrs-container" id="hud-ahrs"></div>
            <div class="hud-bottom-left">
                <div class="hud-row"><span>THR</span><div class="bar"><div class="bar-fill" id="hud-throttle-bar"></div></div><span id="hud-throttle-pct">0%</span></div>
                <div class="hud-row"><span>VS</span><span id="hud-vs">0</span><span class="dim">fpm</span></div>
                <div class="hud-row"><span>G</span><span id="hud-gforce">1.0</span></div>
            </div>
            <div class="hud-bottom-right">
                <div class="hud-row"><span id="hud-gear-state" class="state-ok">GEAR DOWN</span></div>
                <div class="hud-row"><span id="hud-flaps-state">FLAPS 0</span></div>
                <div class="hud-row"><span id="hud-engine-state" class="state-ok">ENGINE ON</span></div>
                <div class="hud-row"><span id="hud-fuel-state">FUEL 100%</span></div>
            </div>
            <div class="hud-stall-warning" id="hud-stall">STALL</div>
            <div class="hud-debug" id="hud-debug"></div>
        `;
        this.ahrs = new ArtificialHorizon(this.root.querySelector('#hud-ahrs'));
        this.debugEnabled = false;
        this.el = {
            airspeed: this.root.querySelector('#hud-airspeed'),
            altitude: this.root.querySelector('#hud-altitude'),
            throttleBar: this.root.querySelector('#hud-throttle-bar'),
            throttlePct: this.root.querySelector('#hud-throttle-pct'),
            vs: this.root.querySelector('#hud-vs'),
            gforce: this.root.querySelector('#hud-gforce'),
            gear: this.root.querySelector('#hud-gear-state'),
            flaps: this.root.querySelector('#hud-flaps-state'),
            engine: this.root.querySelector('#hud-engine-state'),
            fuel: this.root.querySelector('#hud-fuel-state'),
            stall: this.root.querySelector('#hud-stall'),
            debug: this.root.querySelector('#hud-debug'),
            headingStrip: this.root.querySelector('#hud-heading-strip')
        };
    }

    setDebugEnabled(v) {
        this.debugEnabled = v;
        this.el.debug.style.display = v ? 'block' : 'none';
    }

    update(aircraft) {
        const t = aircraft.physics.telemetry;
        const c = aircraft.physics.controls;

        this.el.airspeed.textContent = Math.round(msToKnots(t.airspeed));
        this.el.altitude.textContent = Math.round(metersToFeet(t.altitude));
        this.el.vs.textContent = Math.round(msToFpm(t.verticalSpeed));
        this.el.gforce.textContent = t.gForce.toFixed(1);

        const throttlePct = Math.round(c.throttle * 100);
        this.el.throttleBar.style.width = throttlePct + '%';
        this.el.throttlePct.textContent = throttlePct + '%';

        this.el.gear.textContent = c.gearDown ? 'GEAR DOWN' : 'GEAR UP';
        this.el.gear.className = c.gearDown ? 'state-ok' : 'state-caution';

        this.el.flaps.textContent = 'FLAPS ' + Math.round(c.flaps * 100) + '%';

        const engineOn = aircraft.physics.engineOn;
        this.el.engine.textContent = engineOn ? 'ENGINE ON' : 'ENGINE OFF';
        this.el.engine.className = engineOn ? 'state-ok' : 'state-danger';

        const fuelPct = Math.round((aircraft.physics.fuelLiters / aircraft.config.fuel.capacityLiters) * 100);
        this.el.fuel.textContent = 'FUEL ' + fuelPct + '%';
        this.el.fuel.className = fuelPct < 15 ? 'state-danger' : (fuelPct < 30 ? 'state-caution' : '');

        this.el.stall.style.opacity = t.stalling ? 1 : 0;

        this.ahrs.update(t.pitchDeg, t.rollDeg);

        // Heading strip: show +/- 60 degrees around current heading
        const hdg = Math.round(t.heading);
        let marks = '';
        for (let d = -60; d <= 60; d += 15) {
            const val = ((hdg + d) % 360 + 360) % 360;
            marks += `<span style="left:${50 + d * 0.9}%">${val.toString().padStart(3, '0')}</span>`;
        }
        this.el.headingStrip.innerHTML = marks;

        if (this.debugEnabled) {
            this.el.debug.innerHTML = `
                FPS: ${(1 / Math.max(aircraft.__lastDt || 0.016, 0.0001)).toFixed(0)}<br>
                Pos: ${aircraft.physics.position.x.toFixed(0)}, ${aircraft.physics.position.y.toFixed(0)}, ${aircraft.physics.position.z.toFixed(0)}<br>
                Vel: ${aircraft.physics.velocity.x.toFixed(1)}, ${aircraft.physics.velocity.y.toFixed(1)}, ${aircraft.physics.velocity.z.toFixed(1)}<br>
                Altitude: ${t.altitude.toFixed(1)} m<br>
                Airspeed: ${t.airspeed.toFixed(1)} m/s<br>
                Pitch: ${t.pitchDeg.toFixed(1)} deg | Roll: ${t.rollDeg.toFixed(1)} deg | Hdg: ${t.heading.toFixed(1)}<br>
                AoA: ${t.aoaDeg.toFixed(1)} deg<br>
                Throttle: ${(c.throttle * 100).toFixed(0)}%<br>
                Lift: ${t.lift.toFixed(0)} N | Drag: ${t.drag.toFixed(0)} N | Thrust: ${t.thrust.toFixed(0)} N<br>
                Ground contact: ${aircraft.physics.onGround}<br>
            `;
        }
    }

    showStallAudioHook(cb) {
        this._stallCb = cb;
    }
}
