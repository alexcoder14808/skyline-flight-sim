import * as THREE from 'three';
import { Terrain } from './Terrain.js';
import { Airport } from './Airport.js';
import { Environment } from './Environment.js';

const WIND_PRESETS = {
    calm: 0,
    light: 3,
    moderate: 9
};

export class World {
    constructor(scene, renderer) {
        this.scene = scene;
        this.terrain = new Terrain(scene, { size: 18000, segments: 200, maxHeight: 340 });
        this.airport = new Airport(scene);
        this.environment = new Environment(scene, renderer);

        this.windDirectionRad = Math.random() * Math.PI * 2;
        this.windSpeed = 0;
        this.windVector = new THREE.Vector3();
        this._updateWindVector();

        this.cloudsGroup = null;
        this.weather = 'clear';
    }

    setWeather(weather) {
        this.weather = weather;
        if (weather === 'cloudy') {
            if (!this.cloudsGroup) this._buildClouds();
            this.cloudsGroup.visible = true;
        } else if (this.cloudsGroup) {
            this.cloudsGroup.visible = false;
        }
    }

    setWind(preset) {
        this.windSpeed = WIND_PRESETS[preset] ?? 0;
        this._updateWindVector();
    }

    _updateWindVector() {
        this.windVector.set(Math.sin(this.windDirectionRad), 0, Math.cos(this.windDirectionRad)).multiplyScalar(this.windSpeed);
    }

    setTimeOfDay(name) {
        this.environment.setTimeOfDay(name);
        this.airport.setNightLighting(name === 'night');
    }

    getGroundHeight(x, z) {
        return this.terrain.getHeight(x, z);
    }

    _buildClouds() {
        const group = new THREE.Group();
        group.name = 'Clouds';
        const geo = new THREE.SphereGeometry(1, 7, 7);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, roughness: 1, fog: false });
        const cloudCount = 90;
        for (let i = 0; i < cloudCount; i++) {
            const cluster = new THREE.Group();
            const puffCount = 4 + Math.floor(Math.random() * 5);
            for (let p = 0; p < puffCount; p++) {
                const puff = new THREE.Mesh(geo, mat);
                const s = 40 + Math.random() * 70;
                puff.scale.setScalar(s);
                puff.position.set((Math.random() - 0.5) * 140, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 140);
                cluster.add(puff);
            }
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 7500;
            cluster.position.set(Math.cos(angle) * radius, 700 + Math.random() * 900, Math.sin(angle) * radius);
            group.add(cluster);
        }
        this.scene.add(group);
        this.cloudsGroup = group;
    }

    update(dt) {
        this.environment.update(dt);
        this.airport.update(dt, this.windSpeed / 10);
        if (this.cloudsGroup && this.cloudsGroup.visible) {
            this.cloudsGroup.rotation.y += dt * 0.0015;
        }
    }
}
