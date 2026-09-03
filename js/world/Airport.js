import * as THREE from 'three';

/**
 * Builds one complete airport: runway, taxiway, apron, buildings, hangars,
 * control tower, lighting, windsock.
 *
 * V2: Airport is now positionable/orientable so multiple airports can exist
 * across the world. All the actual building geometry is still authored in
 * a simple local coordinate system (runway centered on local origin,
 * running along local +/-Z) — `root` is the Object3D that gets placed at
 * the airport's real world position/heading, so nothing below has to know
 * or care where in the world it ends up.
 */
export class Airport {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.name = options.name || 'Untitled Airport';
        this.code = options.code || 'XXX';
        this.worldPosition = options.position || new THREE.Vector3(0, 0, 0);
        this.worldHeading = options.heading || 0;

        this.root = new THREE.Group();
        this.root.name = `Airport_${this.code}`;
        this.root.position.copy(this.worldPosition);
        this.root.rotation.y = this.worldHeading;
        scene.add(this.root);

        // Kept as `this.group` too since other systems (CollisionSystem)
        // just need "the airport's geometry root" and don't care about the
        // position/local distinction.
        this.group = this.root;

        this.runwayLength = options.runwayLength || 2600;
        this.runwayWidth = options.runwayWidth || 45;

        // Spawn points in LOCAL space, converted to world space below so
        // Aircraft.reset() (which needs world coordinates) can use them
        // directly regardless of this airport's position/heading.
        const localSpawns = {
            runway: { position: new THREE.Vector3(0, 3.5, this.runwayLength / 2 - 150), heading: 0 },
            parking: { position: new THREE.Vector3(120, 3.5, -this.runwayLength / 2 + 260), heading: Math.PI / 2 }
        };
        this.spawnPoints = {
            runway: this._toWorldSpawn(localSpawns.runway),
            parking: this._toWorldSpawn(localSpawns.parking)
        };

        this._buildRunway();
        this._buildTaxiway();
        this._buildApronAndBuildings();
        this._buildTower();
        this._buildLighting();
        this._buildLabel();
    }

    _toWorldSpawn(local) {
        const worldPos = local.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.worldHeading).add(this.worldPosition);
        return { position: worldPos, heading: local.heading + this.worldHeading };
    }

    /** World-space (x,z) center, used by Terrain to flatten ground here and by the map screen. */
    getWorldXZ() {
        return { x: this.worldPosition.x, z: this.worldPosition.z };
    }

    _buildRunway() {
        const mat = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.95 });
        const geo = new THREE.PlaneGeometry(this.runwayWidth, this.runwayLength);
        geo.rotateX(-Math.PI / 2);
        const runway = new THREE.Mesh(geo, mat);
        runway.receiveShadow = true;
        runway.position.y = 0.02;
        runway.name = 'Runway';
        this.root.add(runway);

        const dashMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
        const dashCount = 40;
        const dashLen = 20, gap = this.runwayLength / dashCount;
        for (let i = 0; i < dashCount; i++) {
            const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.2, dashLen), dashMat);
            dash.rotation.x = -Math.PI / 2;
            dash.position.set(0, 0.03, -this.runwayLength / 2 + i * gap + gap / 2);
            this.root.add(dash);
        }

        [-1, 1].forEach((side) => {
            const edge = new THREE.Mesh(new THREE.PlaneGeometry(1, this.runwayLength), dashMat);
            edge.rotation.x = -Math.PI / 2;
            edge.position.set(side * (this.runwayWidth / 2 - 0.6), 0.03, 0);
            this.root.add(edge);
        });

        [-1, 1].forEach((end) => {
            for (let i = -3; i <= 3; i++) {
                if (i === 0) continue;
                const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 12), dashMat);
                stripe.rotation.x = -Math.PI / 2;
                stripe.position.set(i * 3, 0.03, end * (this.runwayLength / 2 - 20));
                this.root.add(stripe);
            }
        });

        this._paintDesignator(0.03, this.runwayLength / 2 - 60);
        this._paintDesignator(0.03, -this.runwayLength / 2 + 60);
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
        this.root.add(g);
    }

    _buildTaxiway() {
        const mat = new THREE.MeshStandardMaterial({ color: 0x35342f, roughness: 0.95 });
        const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf4c542, roughness: 0.6 });

        const taxiway = new THREE.Mesh(new THREE.PlaneGeometry(25, 400), mat);
        taxiway.rotation.x = -Math.PI / 2;
        taxiway.position.set(90, 0.015, this.runwayLength / 2 - 260);
        taxiway.receiveShadow = true;
        this.root.add(taxiway);

        [-1, 1].forEach((side) => {
            const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 400), edgeMat);
            edge.rotation.x = -Math.PI / 2;
            edge.position.set(90 + side * 12, 0.02, this.runwayLength / 2 - 260);
            this.root.add(edge);
        });
    }

    _buildApronAndBuildings() {
        const apronMat = new THREE.MeshStandardMaterial({ color: 0x3d3c37, roughness: 0.95 });
        const apron = new THREE.Mesh(new THREE.PlaneGeometry(340, 260), apronMat);
        apron.rotation.x = -Math.PI / 2;
        apron.position.set(150, 0.01, this.runwayLength / 2 - 420);
        apron.receiveShadow = true;
        this.root.add(apron);

        const terminal = this._box(90, 16, 30, 0xd7d3c9);
        terminal.position.set(150, 8, this.runwayLength / 2 - 520);
        terminal.castShadow = true;
        this.root.add(terminal);

        const terminalGlass = this._box(88, 6, 2, 0x6fb3d9, 0.6, 0.1);
        terminalGlass.position.set(150, 6, this.runwayLength / 2 - 505);
        this.root.add(terminalGlass);

        for (let i = 0; i < 2; i++) {
            const hangar = this._hangar();
            hangar.position.set(260 + i * 70, 0, this.runwayLength / 2 - 340);
            this.root.add(hangar);
        }

        for (let i = 0; i < 10; i++) {
            const w = 8 + Math.random() * 10;
            const h = 5 + Math.random() * 12;
            const d = 8 + Math.random() * 10;
            const b = this._box(w, h, d, 0xb9b2a3);
            const angle = Math.random() * Math.PI * 2;
            const radius = 500 + Math.random() * 700;
            b.position.set(Math.cos(angle) * radius, h / 2, Math.sin(angle) * radius);
            b.castShadow = true;
            this.root.add(b);
        }

        const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 1 });
        const road = new THREE.Mesh(new THREE.RingGeometry(240, 250, 48), roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(150, 0.008, this.runwayLength / 2 - 500);
        this.root.add(road);
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
        this.root.add(g);
        this.towerBeacon = new THREE.PointLight(0xff2020, 2, 60);
        this.towerBeacon.position.set(230, 54, this.runwayLength / 2 - 460);
        this.root.add(this.towerBeacon);
    }

    _buildLighting() {
        // V3.1 FIX (the actual root cause of every blank-screen report):
        // this used to create one real THREE.PointLight PER BULB (~88 per
        // airport). Real lights are expensive in Three.js's default shader —
        // each one adds several fragment-shader uniforms. With 4 airports
        // that was ~350+ real lights in the scene simultaneously, which blew
        // straight through the GPU's MAX_FRAGMENT_UNIFORM_VECTORS budget and
        // made EVERY standard-lit material fail to compile — hence
        // everything rendering as a blank/white screen. It was never the
        // sky glare; that was a real but much smaller problem.
        //
        // Fix: the bulbs are now a single unlit, self-illuminated
        // InstancedMesh per airport (one draw call, zero light-uniform
        // cost — MeshBasicMaterial ignores scene lighting entirely) that
        // just changes color for day/night. Only 2 real, soft PointLights
        // per airport remain, for actual ground illumination near the
        // runway ends at night.
        const bulbPositions = [];
        for (let i = -1; i <= 1; i += 2) {
            for (let z = -this.runwayLength / 2; z <= this.runwayLength / 2; z += 60) {
                bulbPositions.push([i * (this.runwayWidth / 2 + 1.5), 0.5, z]);
            }
        }
        const bulbGeo = new THREE.SphereGeometry(0.4, 6, 6);
        this.bulbMaterial = new THREE.MeshBasicMaterial({ color: 0x2a2a28 }); // "off" (daytime) look
        const bulbMesh = new THREE.InstancedMesh(bulbGeo, this.bulbMaterial, bulbPositions.length);
        const dummy = new THREE.Object3D();
        bulbPositions.forEach(([x, y, z], i) => {
            dummy.position.set(x, y, z);
            dummy.updateMatrix();
            bulbMesh.setMatrixAt(i, dummy.matrix);
        });
        bulbMesh.instanceMatrix.needsUpdate = true;
        bulbMesh.name = 'RunwayLightBulbs';
        this.root.add(bulbMesh);

        this.runwayGlowLights = [];
        [-1, 1].forEach((end) => {
            const pl = new THREE.PointLight(0xfff2c9, 0, 90);
            pl.position.set(0, 3, end * (this.runwayLength / 2 - 30));
            this.root.add(pl);
            this.runwayGlowLights.push(pl);
        });

        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
        pole.position.set(-60, 3, this.runwayLength / 2 - 250);
        const sock = new THREE.Mesh(new THREE.ConeGeometry(1, 4, 8), new THREE.MeshStandardMaterial({ color: 0xff6a3d }));
        sock.rotation.z = Math.PI / 2;
        sock.position.set(-59, 6, this.runwayLength / 2 - 250);
        this.windsock = sock;
        this.root.add(pole, sock);
    }

    _buildLabel() {
        // A simple painted ICAO-style code near the tower base, as a large
        // flat text-like block using canvas -> texture (cheap, one draw call).
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0a0f16';
        ctx.fillRect(0, 0, 256, 64);
        ctx.fillStyle = '#3fd0ff';
        ctx.font = 'bold 40px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.code, 128, 32);
        const texture = new THREE.CanvasTexture(canvas);
        const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(20, 5), mat);
        plane.position.set(230, 58, this.runwayLength / 2 - 460);
        this.root.add(plane);
    }

    _box(w, h, d, color, metalness = 0.1, roughness = 0.8) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ color, metalness, roughness });
        return new THREE.Mesh(geo, mat);
    }

    setNightLighting(isNight) {
        this.bulbMaterial.color.set(isNight ? 0xfff6d0 : 0x2a2a28);
        this.runwayGlowLights.forEach((l) => { l.intensity = isNight ? 2 : 0; });
    }

    update(dt, windStrength) {
        if (this.windsock) {
            const target = Math.min(1, windStrength) * (Math.PI / 2.4);
            this.windsock.rotation.x = THREE.MathUtils.lerp(this.windsock.rotation.x, target, dt * 2);
        }
    }
}
