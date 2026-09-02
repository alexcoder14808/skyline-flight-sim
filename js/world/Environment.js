import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { lerp } from '../utils/MathUtils.js';

const PRESETS = {
    day: { elevation: 55, azimuth: 150, turbidity: 3.2, rayleigh: 1.4, fogColor: 0xbfd6e8, fogDensity: 0.00003, ambient: 0.55, sunIntensity: 3.2 },
    sunset: { elevation: 6, azimuth: 200, turbidity: 6.5, rayleigh: 2.6, fogColor: 0xe8a86b, fogDensity: 0.00005, ambient: 0.35, sunIntensity: 2.0 },
    night: { elevation: -20, azimuth: 220, turbidity: 2, rayleigh: 0.4, fogColor: 0x030712, fogDensity: 0.00004, ambient: 0.06, sunIntensity: 0.05 }
};

export class Environment {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;

        this.sky = new Sky();
        this.sky.scale.setScalar(45000);
        scene.add(this.sky);

        this.sun = new THREE.Vector3();

        this.sunLight = new THREE.DirectionalLight(0xffffff, 3);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.set(2048, 2048);
        this.sunLight.shadow.camera.near = 10;
        this.sunLight.shadow.camera.far = 4000;
        this.sunLight.shadow.camera.left = -1200;
        this.sunLight.shadow.camera.right = 1200;
        this.sunLight.shadow.camera.top = 1200;
        this.sunLight.shadow.camera.bottom = -1200;
        this.sunLight.shadow.bias = -0.0008;
        scene.add(this.sunLight);
        scene.add(this.sunLight.target);

        this.ambient = new THREE.HemisphereLight(0xbcd7ff, 0x3a3226, 0.5);
        scene.add(this.ambient);

        this.stars = this._buildStars();
        scene.add(this.stars);

        this.moonLight = new THREE.DirectionalLight(0x9fb3ff, 0);
        scene.add(this.moonLight);

        // V2.1: real image-based lighting/reflections generated from the
        // actual sky, not a flat ambient guess — this is what makes the
        // aircraft's metal, the water, and shiny surfaces generally look
        // "high quality" instead of flat. It's regenerated only when the
        // time-of-day actually changes (not every frame), since PMREM
        // generation is too expensive to run continuously.
        this._pmremGenerator = new THREE.PMREMGenerator(renderer);
        this._pmremGenerator.compileEquirectangularShader();
        this._envSceneHolder = new THREE.Scene();
        this._envRenderTarget = null;

        this.currentPreset = 'day';
        this._blend = { ...PRESETS.day };
        this.setTimeOfDay('day', true);
    }

    _buildStars() {
        const count = 2500;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const r = 9000 + Math.random() * 3000;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 0.9); // keep mostly above horizon
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = Math.abs(r * Math.cos(phi));
            positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 5, sizeAttenuation: false, transparent: true, opacity: 0 });
        const points = new THREE.Points(geo, mat);
        points.name = 'Stars';
        return points;
    }

    setTimeOfDay(name, immediate = false) {
        this.currentPreset = name;
        this._targetPreset = PRESETS[name] || PRESETS.day;
        if (immediate) {
            this._blend = { ...this._targetPreset };
            this._applyPreset(this._blend);
            this._updateEnvironmentMap();
        } else {
            // Regenerate reflections once the lighting transition has mostly
            // settled, rather than every frame during the blend (PMREM
            // generation is too costly to run continuously).
            clearTimeout(this._envMapTimeout);
            this._envMapTimeout = setTimeout(() => this._updateEnvironmentMap(), 2700);
        }
    }

    /** Bakes the current sky into a proper IBL environment map (real reflections/ambient light). */
    _updateEnvironmentMap() {
        if (!this._pmremGenerator) return;
        if (this._envRenderTarget) this._envRenderTarget.dispose();
        // Render just the sky (not the whole busy scene) into a small
        // holder scene, per the standard three.js Sky + PMREM pattern.
        this._envSceneHolder.add(this.sky);
        this._envRenderTarget = this._pmremGenerator.fromScene(this._envSceneHolder, 0, 0.1, 1000);
        this.scene.add(this.sky);
        this.scene.environment = this._envRenderTarget.texture;
    }

    isNight() {
        return this.currentPreset === 'night';
    }

    update(dt) {
        if (this._targetPreset) {
            const s = 1 - Math.exp(-dt / 2.5);
            for (const key in this._blend) {
                this._blend[key] = lerp(this._blend[key], this._targetPreset[key], s);
            }
            this._applyPreset(this._blend);
        }
    }

    _applyPreset(p) {
        const uniforms = this.sky.material.uniforms;
        uniforms.turbidity.value = p.turbidity;
        uniforms.rayleigh.value = Math.max(0.05, p.rayleigh);
        // V2.1 fix: mieCoefficient/mieDirectionalG this high created an
        // oversized, overexposed sun-glare halo — looking anywhere near the
        // sun (easy to do with the new free-look camera, or just climbing
        // with a bit of pitch) could wash the entire screen to flat white.
        // Toned down so the sun still glows nicely but never blows out the
        // whole sky.
        uniforms.mieCoefficient.value = 0.0035;
        uniforms.mieDirectionalG.value = 0.76;

        const phi = THREE.MathUtils.degToRad(90 - p.elevation);
        const theta = THREE.MathUtils.degToRad(p.azimuth);
        this.sun.setFromSphericalCoords(1, phi, theta);
        uniforms.sunPosition.value.copy(this.sun);

        const sunDistance = 3000;
        this.sunLight.position.copy(this.sun).multiplyScalar(sunDistance);
        this.sunLight.target.position.set(0, 0, 0);
        this.sunLight.intensity = Math.max(0, p.sunIntensity);

        this.moonLight.position.set(-this.sun.x, Math.abs(this.sun.y) + 0.2, -this.sun.z).multiplyScalar(sunDistance);
        this.moonLight.intensity = p.elevation < 0 ? 0.6 : 0;

        this.ambient.intensity = p.ambient;

        this.scene.fog = new THREE.FogExp2(p.fogColor, p.fogDensity);
        this.renderer.setClearColor(new THREE.Color(p.fogColor));

        this.stars.material.opacity = THREE.MathUtils.clamp((-p.elevation) / 25, 0, 0.9);
    }
}
