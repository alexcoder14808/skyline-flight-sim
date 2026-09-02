import * as THREE from 'three';
import { Terrain } from './Terrain.js';
import { Airport } from './Airport.js';
import { Environment } from './Environment.js';

const WIND_PRESETS = {
    calm: 0,
    light: 3,
    moderate: 9
};

// V2.1: four airports spread across a genuinely large world (furthest pair
// is ~17.6km apart) so flying between them feels like a real cross-country
// trip, not a quick hop. Add more entries here to expand further — nothing
// else needs to change (Terrain reads this list directly, FlightSetup/
// MapScreen read it from World.getAirportList()).
const AIRPORT_LAYOUT = [
    { id: 'skyline', name: 'Skyline International', code: 'SKY', x: 0, z: 0, heading: 0 },
    { id: 'highland', name: 'Highland Regional', code: 'HLR', x: 7500, z: -4200, heading: Math.PI / 2 },
    { id: 'coastal', name: 'Coastal Fields', code: 'CFD', x: -7800, z: 4600, heading: Math.PI * 0.15 },
    { id: 'desert', name: 'Desert Mesa', code: 'DSM', x: -6000, z: -7500, heading: Math.PI * 0.6 }
];
const AIRPORT_FLATTEN_RADIUS = 1400;
const AIRPORT_FLATTEN_BLEND = 900;

export class World {
    constructor(scene, renderer) {
        this.scene = scene;

        const flattenZones = AIRPORT_LAYOUT.map((a) => ({
            x: a.x, z: a.z, radius: AIRPORT_FLATTEN_RADIUS, blend: AIRPORT_FLATTEN_BLEND
        }));
        this.terrain = new Terrain(scene, { size: 26000, segments: 230, maxHeight: 360, flattenZones });

        this.airports = {};
        this.airportList = [];
        AIRPORT_LAYOUT.forEach((a) => {
            const airport = new Airport(scene, {
                name: a.name,
                code: a.code,
                position: new THREE.Vector3(a.x, 0, a.z),
                heading: a.heading
            });
            this.airports[a.id] = airport;
            this.airportList.push({ id: a.id, name: a.name, code: a.code, x: a.x, z: a.z, airport });
        });
        // Default/primary airport, kept for anything that only knows about one.
        this.airport = this.airports.skyline;

        this.environment = new Environment(scene, renderer);

        this.windDirectionRad = Math.random() * Math.PI * 2;
        this.windSpeed = 0;
        this.windVector = new THREE.Vector3();
        this._updateWindVector();

        this.cloudsGroup = null;
        this.weather = 'clear';
    }

    /** For FlightSetup / MapScreen: [{id, name, code, x, z, heading, runwayLength, runwayWidth}, ...] */
    getAirportList() {
        return this.airportList.map(({ id, name, code, x, z, airport }) => ({
            id, name, code, x, z,
            heading: airport.worldHeading,
            runwayLength: airport.runwayLength,
            runwayWidth: airport.runwayWidth
        }));
    }

    getAirport(id) {
        return this.airports[id] || this.airport;
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
        Object.values(this.airports).forEach((a) => a.setNightLighting(name === 'night'));
    }

    getGroundHeight(x, z) {
        return this.terrain.getHeight(x, z);
    }

    _buildClouds() {
        // V2: instanced rendering — one draw call for the whole cloud layer
        // instead of hundreds of individual meshes, so "cloudy" weather stays
        // cheap regardless of how many puffs make up the skyline.
        const geo = new THREE.SphereGeometry(1, 7, 6);
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, roughness: 1, fog: false });

        const clusterCount = 130;
        const puffsPerCluster = 6;
        const totalPuffs = clusterCount * puffsPerCluster;
        const instanced = new THREE.InstancedMesh(geo, mat, totalPuffs);
        instanced.name = 'Clouds';

        const dummy = new THREE.Object3D();
        let idx = 0;
        for (let c = 0; c < clusterCount; c++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * this.terrain.size * 0.46;
            const clusterX = Math.cos(angle) * radius;
            const clusterY = 700 + Math.random() * 900;
            const clusterZ = Math.sin(angle) * radius;
            for (let p = 0; p < puffsPerCluster; p++) {
                const s = 40 + Math.random() * 70;
                dummy.position.set(
                    clusterX + (Math.random() - 0.5) * 140,
                    clusterY + (Math.random() - 0.5) * 30,
                    clusterZ + (Math.random() - 0.5) * 140
                );
                dummy.scale.setScalar(s);
                dummy.updateMatrix();
                instanced.setMatrixAt(idx++, dummy.matrix);
            }
        }
        instanced.instanceMatrix.needsUpdate = true;
        this.scene.add(instanced);
        this.cloudsGroup = instanced;
    }

    update(dt) {
        this.terrain.update(dt);
        this.environment.update(dt);
        Object.values(this.airports).forEach((a) => a.update(dt, this.windSpeed / 10));
        if (this.cloudsGroup && this.cloudsGroup.visible) {
            this.cloudsGroup.rotation.y += dt * 0.0015;
        }
    }
}
