import * as THREE from 'three';

/**
 * Builds a complete starting airport centered on the world origin.
 * Runway is aligned along world Z (heading 360/180), matching aircraft
 * spawn heading 0 (nose along -Z).
 */
export class Airport {
    constructor(scene) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.name = 'Airport';
        scene.add(this.group);

        this.runwayLength = 2600;
        this.runwayWidth = 45;

        // Spawn points other systems (Aircraft reset, FlightSetup) read from.
        // Runway heading 0 means the aircraft's default forward axis (local
        // -Z) points toward -Z world, i.e. from the +Z spawn point down
        // toward the far threshold — giving nearly the full runway length
        // ahead for the takeoff roll.
        this.spawnPoints = {
            runway: { position: new THREE.Vector3(0, 3.5, this.runwayLength / 2 - 150), heading: 0 },
            parking: { position: new THREE.Vector3(120, 3.5, -this.runwayLength / 2 + 260), heading: Math.PI / 2 }
        };

        this._buildRunway();
        this._buildTaxiway();
        this._buildApronAndBuildings();
        this._buildTower();
        this._buildLighting();
    }

    _buildRunway() {
        const mat = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.95 });
        const geo = new THREE.PlaneGeometry(this.runwayWidth, this.runwayLength);
        geo.rotateX(-Math.PI / 2);
        const runway = new THREE.Mesh(geo, mat);
        runway.receiveShadow = true;
        runway.position.y = 0.02;
        runway.name = 'Runway';
        this.group.add(runway);

        // Centerline dashes
        const dashMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
        const dashCount = 40;
        const dashLen = 20, gap = this.runwayLength / dashCount;
        for (let i = 0; i < dashCount; i++) {
            const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, dashLen), dashMat);
            dash.rotation.x = -Math.PI / 2;
            dash.position.set(0, 0.03, -this.runwayLength / 2 + i * gap + gap / 2);
            this.group.add(dash);
        }

        // Edge markings
        [-1, 1].forEach((side) => {
            const edge = new THREE.Mesh(new THREE.PlaneGeometry(1, this.runwayLength), dashMat);
            edge.rotation.x = -Math.PI / 2;
            edge.position.set(side * (this.runwayWidth / 2 - 0.6), 0.03, 0);
            this.group.add(edge);
        });

        // Threshold stripes at both ends
        [-1, 1].forEach((end) => {
            for (let i = -3; i <= 3; i++) {
                if (i === 0) continue;
                const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 12), dashMat);
                stripe.rotation.x = -Math.PI / 2;
                stripe.position.set(i * 3, 0.03, end * (this.runwayLength / 2 - 20));
                this.group.add(stripe);
            }
        });

        // Runway numbers (simple painted rectangles standing in for "18"/"36")
        this._paintDesignator(0.03, this.runwayLength / 2 - 60, '18');
        this._paintDesignator(0.03, -this.runwayLength / 2 + 60, '36');
    }

    _paintDesignator(y, z) {
        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
        const g = new THREE.Group();
        for (let i = 0; i < 2; i++) {
            const bar = new THREE.Mesh(new THREE.PlaneGeometry(3, 14), mat);
            bar.rotation.x = -Math.PI / 2;
            bar.position.set(i * 6 - 3, y, z);
            g.add(bar);
        }
        this.group.add(g);
    }

    _buildTaxiway() {
        const mat = new THREE.MeshStandardMaterial({ color: 0x35342f, roughness: 0.95 });
        const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf4c542, roughness: 0.6 });

        const taxiway = new THREE.Mesh(new THREE.PlaneGeometry(25, 400), mat);
        taxiway.rotation.x = -Math.PI / 2;
        taxiway.position.set(90, 0.015, this.runwayLength / 2 - 260);
        taxiway.receiveShadow = true;
        this.group.add(taxiway);

        [-1, 1].forEach((side) => {
            const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 400), edgeMat);
            edge.rotation.x = -Math.PI / 2;
            edge.position.set(90 + side * 12, 0.02, this.runwayLength / 2 - 260);
            this.group.add(edge);
        });
    }

    _buildApronAndBuildings() {
        const apronMat = new THREE.MeshStandardMaterial({ color: 0x3d3c37, roughness: 0.95 });
        const apron = new THREE.Mesh(new THREE.PlaneGeometry(340, 260), apronMat);
        apron.rotation.x = -Math.PI / 2;
        apron.position.set(150, 0.01, this.runwayLength / 2 - 420);
        apron.receiveShadow = true;
        this.group.add(apron);

        // Terminal building
        const terminal = this._box(90, 16, 30, 0xd7d3c9);
        terminal.position.set(150, 8, this.runwayLength / 2 - 520);
        terminal.castShadow = true;
        this.group.add(terminal);

        const terminalGlass = this._box(88, 6, 2, 0x6fb3d9, 0.6, 0.1);
        terminalGlass.position.set(150, 6, this.runwayLength / 2 - 505);
        this.group.add(terminalGlass);

        // Hangars
        for (let i = 0; i < 2; i++) {
            const hangar = this._hangar();
            hangar.position.set(260 + i * 70, 0, this.runwayLength / 2 - 340);
            this.group.add(hangar);
        }

        // Surrounding small buildings
        for (let i = 0; i < 10; i++) {
            const w = 8 + Math.random() * 10;
            const h = 5 + Math.random() * 12;
            const d = 8 + Math.random() * 10;
            const b = this._box(w, h, d, 0xb9b2a3);
            const angle = Math.random() * Math.PI * 2;
            const radius = 500 + Math.random() * 700;
            b.position.set(Math.cos(angle) * radius, h / 2, Math.sin(angle) * radius);
            b.castShadow = true;
            this.group.add(b);
        }

        // A simple road loop near the terminal
        const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 1 });
        const road = new THREE.Mesh(new THREE.RingGeometry(240, 250, 48), roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(150, 0.008, this.runwayLength / 2 - 500);
        this.group.add(road);
    }

    _hangar() {
        const g = new THREE.Group();
        const body = this._box(50, 18, 45, 0xaeb0b4);
        body.position.y = 9;
        body.castShadow = true;
        g.add(body);
        const roofGeo = new THREE.CylinderGeometry(25, 25, 45, 16, 1, false, 0, Math.PI);
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x8f9296, roughness: 0.8 });
        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.rotation.z = Math.PI / 2;
        roof.rotation.y = Math.PI / 2;
        roof.position.y = 18;
        roof.castShadow = true;
        g.add(roof);
        return g;
    }

    _buildTower() {
        const g = new THREE.Group();
        const shaft = this._box(10, 45, 10, 0xc7c3b8);
        shaft.position.y = 22.5;
        shaft.castShadow = true;
        const cab = this._box(18, 8, 18, 0x5fa8c9, 0.5, 0.1);
        cab.position.y = 49;
        cab.castShadow = true;
        g.add(shaft, cab);
        g.position.set(230, 0, this.runwayLength / 2 - 460);
        this.group.add(g);
        this.towerBeacon = new THREE.PointLight(0xff2020, 2, 60);
        this.towerBeacon.position.set(230, 54, this.runwayLength / 2 - 460);
        this.group.add(this.towerBeacon);
    }

    _buildLighting() {
        // Runway edge lights
        this.runwayLights = [];
        const lightGeo = new THREE.SphereGeometry(0.4, 6, 6);
        const lightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        for (let i = -1; i <= 1; i += 2) {
            for (let z = -this.runwayLength / 2; z <= this.runwayLength / 2; z += 60) {
                const bulb = new THREE.Mesh(lightGeo, lightMat.clone());
                bulb.position.set(i * (this.runwayWidth / 2 + 1.5), 0.5, z);
                this.group.add(bulb);
                const pl = new THREE.PointLight(0xffffff, 0, 15);
                pl.position.copy(bulb.position);
                this.group.add(pl);
                this.runwayLights.push(pl);
            }
        }

        // Windsock
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        pole.position.set(-60, 3, this.runwayLength / 2 - 250);
        const sock = new THREE.Mesh(new THREE.ConeGeometry(1, 4, 8), new THREE.MeshStandardMaterial({ color: 0xff6a3d }));
        sock.rotation.z = Math.PI / 2;
        sock.position.set(-59, 6, this.runwayLength / 2 - 250);
        this.windsock = sock;
        this.group.add(pole, sock);
    }

    _box(w, h, d, color, metalness = 0.1, roughness = 0.8) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ color, metalness, roughness });
        return new THREE.Mesh(geo, mat);
    }

    setNightLighting(isNight) {
        this.runwayLights.forEach((l) => { l.intensity = isNight ? 3 : 0; });
    }

    update(dt, windStrength) {
        if (this.windsock) {
            const target = Math.min(1, windStrength) * (Math.PI / 2.4);
            this.windsock.rotation.x = THREE.MathUtils.lerp(this.windsock.rotation.x, target, dt * 2);
        }
    }
}
