import * as THREE from 'three';
import { Aircraft } from './aircraft/Aircraft.js';
import { AircraftControls } from './aircraft/AircraftControls.js';
import { World } from './world/World.js';
import { CameraManager } from './camera/CameraManager.js';
import { AudioManager } from './audio/AudioManager.js';
import { HUD } from './cockpit/HUD.js';
import { CollisionSystem } from './systems/CollisionSystem.js';
import { WeatherSystem } from './systems/WeatherSystem.js';
import { TimeSystem } from './systems/TimeSystem.js';
import { MainMenu } from './ui/MainMenu.js';
import { FlightSetup } from './ui/FlightSetup.js';
import { Settings } from './ui/Settings.js';
import { PauseMenu, CrashScreen, LandingScreen } from './ui/PauseMenu.js';
import { MapScreen } from './ui/MapScreen.js';
import { Storage } from './utils/Storage.js';
import { msToKnots, msToFpm } from './utils/MathUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

class SkylineFlightApp {
    constructor() {
        this.state = 'loading'; // loading | menu | setup | settings | controls | about | flying | paused | crashed | landed
        this._setLoadingStatus('Loading aircraft...', 0);

        this._initRenderer();
        this._initScene();

        this.aircraft = new Aircraft('uploaded_airliner');
        this.controls = new AircraftControls(this._loadInputSettings());
        this.audio = new AudioManager();

        this.hud = new HUD(document.getElementById('hud'));

        this._prevOnGround = true;
        this._hadTakenOff = false;
        this._touchdownStats = null;
        this._prevGearDown = true;
        this._prevFlaps = 0;
        this._mapOpen = false;

        this._boot();
    }

    // ---------------------------------------------------------------
    _initRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.95;
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);

        window.addEventListener('resize', () => this._onResize());
    }

    _initScene() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 20000);
        this.cameraManager = new CameraManager(this.camera, this.renderer.domElement);
        this._initPostProcessing();
    }

    _initPostProcessing() {
        // V2.1: subtle bloom for "high" graphics quality — only the
        // brightest pixels (sun disc, runway/aircraft lights at night)
        // bloom, everything else is untouched, so this can't reproduce the
        // sky-glare whiteout issue that was just fixed. Disabled entirely on
        // 'medium'/'low' quality to keep the game light where it matters.
        this.composer = new EffectComposer(this.renderer);
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);
        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            0.28,   // strength — deliberately mild
            0.45,   // radius
            0.9     // luminance threshold — only near-white/light sources bloom
        );
        this.composer.addPass(this.bloomPass);
        this.composer.addPass(new OutputPass());
        this.bloomEnabled = true; // actual on/off resolved by graphics-quality setting
    }

    _onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        if (this.composer) {
            this.composer.setSize(window.innerWidth, window.innerHeight);
            this.bloomPass.setSize(window.innerWidth, window.innerHeight);
        }
    }

    _loadInputSettings() {
        const s = Storage.get('settings', {});
        return { invertPitch: !!s.invertPitch, sensitivity: s.flightSensitivity || 1.0 };
    }

    // ---------------------------------------------------------------
    async _boot() {
        try {
            this._setLoadingStatus('Loading aircraft...', 10);
            await this.aircraft.load((p) => this._setLoadingStatus('Loading aircraft...', 10 + p * 30));
            this.scene.add(this.aircraft.root);

            this._setLoadingStatus('Loading world...', 45);
            this.world = new World(this.scene, this.renderer);

            this._setLoadingStatus('Loading terrain...', 65);
            this.weatherSystem = new WeatherSystem(this.world);
            this.timeSystem = new TimeSystem(this.world);

            this._setLoadingStatus('Loading systems...', 80);
            this.collisionSystem = new CollisionSystem(this.world.airports);

            this._setLoadingStatus('Initializing flight model...', 92);
            this._applySettingsToRenderer(Storage.get('settings', {}));

            this._setLoadingStatus('Ready.', 100);
            setTimeout(() => this._initUI(), 250);
        } catch (err) {
            console.error('[Boot] failed:', err);
            this._showError('AIRCRAFT LOAD ERROR', err.message || 'The aircraft model could not be loaded. Check the aircraft file and try again.');
        }

        this._lastTime = performance.now();
        requestAnimationFrame((t) => this._loop(t));
    }

    _setLoadingStatus(text, pct) {
        const statusEl = document.getElementById('loading-status');
        const fillEl = document.getElementById('loading-progress');
        const pctEl = document.getElementById('loading-pct');
        if (statusEl) statusEl.textContent = text;
        if (fillEl) fillEl.style.width = Math.round(pct) + '%';
        if (pctEl) pctEl.textContent = Math.round(pct) + '%';
    }

    _showError(title, message) {
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('error-title').textContent = title;
        document.getElementById('error-message').textContent = message;
        document.getElementById('error-screen').classList.remove('hidden');
        document.getElementById('btn-error-reload').addEventListener('click', () => window.location.reload());
    }

    // ---------------------------------------------------------------
    _initUI() {
        document.getElementById('loading-screen').classList.add('hidden');

        this.mainMenu = new MainMenu(document.getElementById('main-menu'), {
            onFly: () => this._startFlight(this.flightSetup ? this.flightSetup.getOptions() : Storage.get('flightSetup', { airport: 'skyline', startPosition: 'runway', timeOfDay: 'day', weather: 'clear', wind: 'calm' })),
            onFlightSetup: () => this._switchScreen('setup'),
            onMap: () => this._openMap('menu'),
            onSettings: () => this._switchScreen('settings'),
            onControls: () => this._switchScreen('controls'),
            onAbout: () => this._switchScreen('about')
        });

        this.flightSetup = new FlightSetup(document.getElementById('flight-setup-screen'), {
            onBack: () => this._switchScreen('menu'),
            onFly: (options) => this._startFlight(options)
        });
        this.flightSetup.populateAirports(this.world.getAirportList());

        this.mapScreen = new MapScreen(document.getElementById('map-screen'), {
            onBack: () => this._closeMap()
        });
        this.mapScreen.setData(this.world, () => {
            if (this.state !== 'flying' && this.state !== 'paused') return null;
            const p = this.aircraft.physics;
            return { x: p.position.x, z: p.position.z, heading: THREE.MathUtils.degToRad(p.telemetry.heading) };
        });

        this.settings = new Settings(document.getElementById('settings-screen'), {
            audioManager: this.audio,
            onBack: () => this._switchScreen(this._settingsReturnState || 'menu'),
            onChange: (values) => this._applySettingsToRenderer(values)
        });

        this.pauseMenu = new PauseMenu(document.getElementById('pause-menu'), {
            onResume: () => this._setState('flying'),
            onMap: () => this._openMap('paused'),
            onRestart: () => this._restartFlight(),
            onSettings: () => { this._settingsReturnState = 'paused'; this._switchScreen('settings'); },
            onMainMenu: () => this._returnToMenu()
        });

        this.crashScreen = new CrashScreen(document.getElementById('crash-screen'), {
            onRestart: () => this._restartFlight(),
            onMainMenu: () => this._returnToMenu()
        });

        this.landingScreen = new LandingScreen(document.getElementById('landing-screen'), {
            onFlyAgain: () => this._restartFlight(),
            onMainMenu: () => this._returnToMenu()
        });

        document.getElementById('btn-controls-back').addEventListener('click', () => this._switchScreen('menu'));
        document.getElementById('btn-about-back').addEventListener('click', () => this._switchScreen('menu'));

        this._settingsReturnState = 'menu';
        this._switchScreen('menu');
    }

    _switchScreen(name) {
        ['main-menu', 'flight-setup-screen', 'settings-screen', 'controls-screen', 'about-screen', 'pause-menu'].forEach((id) => {
            document.getElementById(id).classList.add('hidden');
        });
        const map = { menu: 'main-menu', setup: 'flight-setup-screen', settings: 'settings-screen', controls: 'controls-screen', about: 'about-screen', paused: 'pause-menu' };
        document.getElementById(map[name]).classList.remove('hidden');
        this.state = name;
        this.controls.enabled = (name === 'paused');
    }

    // The map can be opened from the main menu OR mid-flight (via the M key
    // or the pause menu), so it's handled as an overlay on top of whichever
    // state it was opened from, rather than going through the normal
    // menu-only _switchScreen.
    _openMap(fromState) {
        this._mapReturnState = fromState;
        this._mapOpen = true;
        if (fromState === 'paused') {
            document.getElementById('pause-menu').classList.add('hidden');
        } else if (fromState === 'flying') {
            // Opened directly from flight (M key) — nothing else to hide,
            // the HUD just sits underneath the map overlay.
        } else {
            ['main-menu', 'flight-setup-screen', 'settings-screen', 'controls-screen', 'about-screen'].forEach((id) => {
                document.getElementById(id).classList.add('hidden');
            });
        }
        document.getElementById('map-screen').classList.remove('hidden');
        this.mapScreen.show();
    }

    _closeMap() {
        document.getElementById('map-screen').classList.add('hidden');
        this.mapScreen.hide();
        this._mapOpen = false;
        if (this._mapReturnState === 'paused') {
            document.getElementById('pause-menu').classList.remove('hidden');
        } else if (this._mapReturnState === 'flying') {
            this._setState('flying');
        } else {
            this._switchScreen('menu');
        }
    }

    _applySettingsToRenderer(values) {
        const quality = values.graphicsQuality || 'high';
        const pixelRatioMap = { low: 1, medium: 1.5, high: Math.min(window.devicePixelRatio, 2) };
        this.renderer.setPixelRatio(pixelRatioMap[quality] || 1);
        this.renderer.shadowMap.enabled = values.shadows !== false;

        const distanceMap = { near: 6000, medium: 12000, far: 20000 };
        this.camera.far = distanceMap[values.renderDistance] || 20000;
        this.camera.updateProjectionMatrix();

        if (this.controls) {
            this.controls.setInvertPitch(!!values.invertPitch);
            this.controls.setSensitivity(values.flightSensitivity || 1.0);
        }

        this.bloomEnabled = quality === 'high';
    }

    // ---------------------------------------------------------------
    _startFlight(options) {
        this.audio.start(); // user gesture already happened (button click)

        this.weatherSystem.setWeather(options.weather);
        this.weatherSystem.setWind(options.wind);
        this.timeSystem.setTime(options.timeOfDay);

        const airport = this.world.getAirport(options.airport || 'skyline');
        const spawn = airport.spawnPoints[options.startPosition] || airport.spawnPoints.runway;
        this.aircraft.reset(spawn.position, spawn.heading);

        this._hadTakenOff = false;
        this._prevOnGround = true;
        this._touchdownStats = null;
        this._mapOpen = false;

        ['main-menu', 'flight-setup-screen', 'settings-screen', 'controls-screen', 'about-screen', 'pause-menu', 'crash-screen', 'landing-screen', 'map-screen'].forEach((id) => {
            document.getElementById(id).classList.add('hidden');
        });
        this.mapScreen.hide();
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('hud-hint').classList.remove('hidden');

        this._setState('flying');
    }

    _restartFlight() {
        const options = this.flightSetup ? this.flightSetup.getOptions() : Storage.get('flightSetup', { airport: 'skyline', startPosition: 'runway', timeOfDay: 'day', weather: 'clear', wind: 'calm' });
        this._startFlight(options);
    }

    _returnToMenu() {
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('hud-hint').classList.add('hidden');
        ['pause-menu', 'crash-screen', 'landing-screen', 'map-screen'].forEach((id) => document.getElementById(id).classList.add('hidden'));
        this.mapScreen.hide();
        this._settingsReturnState = 'menu';
        this._switchScreen('menu');
    }

    _setState(state) {
        this.state = state;
        // Controls stay "enabled" (so pause/resume keeps working) in both the
        // flying and paused states; every other screen ignores flight keys.
        this.controls.enabled = (state === 'flying' || state === 'paused');
        document.getElementById('pause-menu').classList.toggle('hidden', state !== 'paused');
    }

    // ---------------------------------------------------------------
    _loop(now) {
        requestAnimationFrame((t) => this._loop(t));
        const dt = Math.min((now - this._lastTime) / 1000, 0.1);
        this._lastTime = now;

        if (this.world) this.world.update(dt);
        if (this.audio.started) this.audio.updateMusic(dt);

        if (this.state === 'flying' || this.state === 'paused') {
            this.controls.update(dt);

            if (this._mapOpen && (this.controls.events.pause || this.controls.events.mapToggle)) {
                // P/Esc/M all close the map overlay first, rather than
                // resuming flight (or re-showing the pause menu) with the
                // map still visibly on screen.
                this._closeMap();
            } else if (this.controls.events.pause) {
                this._setState(this.state === 'flying' ? 'paused' : 'flying');
            } else if (this.controls.events.mapToggle && this.state === 'flying') {
                // V2.1: the map no longer requires going through the pause
                // menu — M opens it directly mid-flight (physics still
                // pauses while it's open, same as the pause menu does).
                this._setState('paused');
                this._openMap('flying');
            } else if (this.controls.events.mapToggle && this.state === 'paused') {
                this._openMap('paused');
            } else if (this.state === 'flying') {
                if (this.controls.events.reset) {
                    this._restartFlight();
                } else {
                    if (this.controls.events.cameraCycle) this.cameraManager.cycle();
                    if (this.controls.events.debugToggle) this.hud.setDebugEnabled(!this.hud.debugEnabled);
                    this._updateFlight(dt);
                }
            }
        }

        this.cameraManager.update(dt, this.aircraft);
        if (this.bloomEnabled && this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }

    _updateFlight(dt) {
        this.aircraft.applyControls(this.controls.state);
        this.aircraft.__lastDt = dt;
        this.aircraft.step(dt, (x, z) => this.world.getGroundHeight(x, z));

        // Building collisions (terrain/runway handled inside physics already)
        if (!this.aircraft.physics.crashed && this.aircraft.physics.telemetry.altitude < 80) {
            if (this.collisionSystem.check(this.aircraft.physics.position)) {
                this.aircraft.physics._crash('Collided with a structure');
            }
        }

        // Sound
        this.audio.updateEngine(this.aircraft.physics.currentThrustFraction, this.aircraft.physics.engineOn);
        this.audio.updateWind(this.aircraft.physics.telemetry.airspeed / 90);
        this.audio.setStallWarning(this.aircraft.physics.telemetry.stalling);

        // Gear/flap sound cues on state change
        if (this.controls.state.gearDown !== this._prevGearDown) { this.audio.playGear(); this._prevGearDown = this.controls.state.gearDown; }
        if (Math.abs(this.controls.state.flaps - this._prevFlaps) > 0.01) { this.audio.playFlaps(); this._prevFlaps = this.controls.state.flaps; }

        // Track takeoff / touchdown for the landing-complete screen
        if (this.aircraft.physics.telemetry.altitude > 30) this._hadTakenOff = true;

        const onGround = this.aircraft.physics.onGround;
        if (!this.aircraft.physics.crashed && !onGround) this._lastAirborneTelemetry = { ...this.aircraft.physics.telemetry };
        if (!this._prevOnGround && onGround && this._hadTakenOff && !this.aircraft.physics.crashed) {
            const t = this._lastAirborneTelemetry || this.aircraft.physics.telemetry;
            this._touchdownStats = {
                speedKnots: msToKnots(t.airspeed),
                vsFpm: Math.abs(msToFpm(t.verticalSpeed))
            };
            this._hadTakenOff = false; // don't re-trigger until another takeoff
            this._setState('landed');
            document.getElementById('landing-screen').classList.remove('hidden');
            this.landingScreen.show(this._touchdownStats.speedKnots, this._touchdownStats.vsFpm);
        }
        this._prevOnGround = onGround;

        if (this.aircraft.physics.crashed) {
            this.audio.playCrash();
            this._setState('crashed');
            document.getElementById('crash-screen').classList.remove('hidden');
            this.crashScreen.show(this.aircraft.physics.lastCrashReason);
            return;
        }

        this.hud.update(this.aircraft);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new SkylineFlightApp();
});
