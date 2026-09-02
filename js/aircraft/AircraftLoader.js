import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

/**
 * Loads the aircraft OBJ, wraps it in a physics-friendly root object, and
 * attaches procedural control-surface stand-ins (the source model has no
 * named aileron/elevator/rudder/gear objects to animate directly).
 *
 * Structure produced:
 *   AircraftRoot (Object3D)              <- physics acts on this
 *     ├── Model (the loaded OBJ, centered/scaled/oriented)
 *     ├── ControlSurfaces.leftAileron / rightAileron / elevator / rudder
 *     ├── Flaps.left / right
 *     ├── Gear (visual placeholders, retract vertically)
 *     ├── Lights: nav (red/green), beacon, strobes, landingLights
 *     └── enginePivots[] (nacelle positions, for exhaust glow + sound anchor)
 */
export class AircraftLoader {
    static async load(config, onProgress) {
        const loader = new OBJLoader();

        let rawObject;
        try {
            rawObject = await new Promise((resolve, reject) => {
                loader.load(
                    config.modelPath,
                    resolve,
                    (xhr) => {
                        if (onProgress && xhr.total) {
                            onProgress(xhr.loaded / xhr.total);
                        }
                    },
                    reject
                );
            });
        } catch (err) {
            throw new Error(`Failed to load aircraft model at "${config.modelPath}": ${err.message || err}`);
        }

        // Give every mesh a reasonable default PBR material since the source
        // .obj referenced a .mtl file that was not included in the upload.
        rawObject.traverse((child) => {
            if (child.isMesh) {
                child.material = new THREE.MeshStandardMaterial({
                    color: 0xe6e9ec,
                    metalness: 0.35,
                    roughness: 0.45
                });
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        // --- Inspect bounding box in raw model space ---
        const box = new THREE.Box3().setFromObject(rawObject);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // The model's longest horizontal axis is assumed to be the fuselage
        // (nose-to-tail) axis. Support either X-major or Z-major source data.
        const forwardAxisIsX = size.x >= size.z;
        const rawLength = forwardAxisIsX ? size.x : size.z;
        const rawSpan = forwardAxisIsX ? size.z : size.x;
        const rawHeight = size.y;

        // Determine nose direction sign by comparing vertex density: airliner
        // fuselages taper to a point at the nose, so the extreme end with the
        // smaller cross-section bounding radius is the nose. We approximate
        // this cheaply using the model's local bounding sphere sampled at both
        // extremes via a quick raycasted vertex scan.
        const noseSign = AircraftLoader._detectNoseSign(rawObject, box, forwardAxisIsX);

        // --- Build a centered "Model" group so rotation/scale pivot is clean ---
        const model = new THREE.Group();
        model.name = 'Model';
        model.add(rawObject);
        // Center horizontally, but keep the bottom of the model at y=0 so the
        // AircraftRoot origin sits at the belly/ground-contact reference.
        rawObject.position.set(-center.x, -box.min.y, -center.z);

        // Rotate so the model's forward axis maps to Three.js "forward" (-Z),
        // with nose pointing away from camera by default.
        let yaw = 0;
        if (forwardAxisIsX) {
            // Local +X or -X (whichever is the nose) needs to map to -Z.
            // Rotation by -90 deg maps -X -> -Z; +90 deg maps +X -> -Z.
            yaw = noseSign < 0 ? -Math.PI / 2 : Math.PI / 2;
        } else {
            // Already on Z axis; just flip if the nose points +Z instead of -Z.
            yaw = noseSign < 0 ? 0 : Math.PI;
        }
        model.rotation.y = yaw;

        // --- Auto-scale to the configured real-world length ---
        const scale = config.targetLengthMeters / rawLength;
        model.scale.setScalar(scale);

        const scaledSpan = rawSpan * scale;
        const scaledHeight = rawHeight * scale;
        const scaledLength = rawLength * scale;

        // --- Assemble the physics root ---
        const root = new THREE.Group();
        root.name = 'AircraftRoot';
        root.add(model);

        // --- Procedural control surfaces (visual only, attached near the
        // real wing/tail locations inferred from the scaled bounding box) ---
        const surfaces = AircraftLoader._buildControlSurfaces(scaledSpan, scaledLength, scaledHeight);
        root.add(surfaces.group);

        // --- Landing gear visual placeholders ---
        const gear = AircraftLoader._buildGear(scaledSpan, scaledLength);
        root.add(gear.group);

        // --- Lights ---
        const lights = AircraftLoader._buildLights(scaledSpan, scaledLength, scaledHeight);
        root.add(lights.group);

        return {
            root,
            model,
            dimensions: { length: scaledLength, span: scaledSpan, height: scaledHeight },
            controlSurfaces: surfaces.parts,
            gear,
            lights
        };
    }

    static _detectNoseSign(object, box, forwardAxisIsX) {
        // Sample vertex positions and compare the spread (cross-section
        // "thickness") near each extreme of the forward axis. The narrower
        // end (smaller spread) is the nose.
        let minExtremeSpread = 0, maxExtremeSpread = 0;
        let minCount = 0, maxCount = 0;
        const axis = forwardAxisIsX ? 'x' : 'z';
        const lo = box.min[axis];
        const hi = box.max[axis];
        const span = hi - lo;
        const band = span * 0.08;

        object.traverse((child) => {
            if (!child.isMesh) return;
            const posAttr = child.geometry.attributes.position;
            if (!posAttr) return;
            const worldMatrix = child.matrixWorld;
            const v = new THREE.Vector3();
            for (let i = 0; i < posAttr.count; i += 5) { // sample every 5th vertex for speed
                v.fromBufferAttribute(posAttr, i).applyMatrix4(worldMatrix);
                const a = v[axis];
                const other = forwardAxisIsX ? Math.hypot(v.y, v.z) : Math.hypot(v.x, v.y);
                if (a <= lo + band) { minExtremeSpread += other; minCount++; }
                else if (a >= hi - band) { maxExtremeSpread += other; maxCount++; }
            }
        });

        const minAvg = minCount ? minExtremeSpread / minCount : 0;
        const maxAvg = maxCount ? maxExtremeSpread / maxCount : 0;
        // Nose = narrower end. Return -1 if nose is at the "min" extreme, +1 if at "max".
        return minAvg <= maxAvg ? -1 : 1;
    }

    static _buildControlSurfaces(span, length, height) {
        const group = new THREE.Group();
        group.name = 'ControlSurfaces';
        const mat = new THREE.MeshStandardMaterial({ color: 0xd8dbe0, metalness: 0.3, roughness: 0.5 });

        const halfSpan = span / 2;
        const wingChord = length * 0.13;
        const wingZ = -length * 0.02; // wing root roughly mid-fuselage

        function makePanel(w, d, h) {
            const geo = new THREE.BoxGeometry(w, h, d);
            return new THREE.Mesh(geo, mat);
        }

        // Ailerons: outboard trailing edge of each wing, pivot at leading edge of panel.
        const aileronSpan = halfSpan * 0.28;
        const aileronChord = wingChord * 0.55;
        const leftAileron = makePanel(aileronSpan, aileronChord, 0.12);
        leftAileron.position.set(-(halfSpan * 0.68), height * 0.02, wingZ + wingChord * 0.5);
        const rightAileron = makePanel(aileronSpan, aileronChord, 0.12);
        rightAileron.position.set(halfSpan * 0.68, height * 0.02, wingZ + wingChord * 0.5);

        // Elevator: on tailplane near the rear.
        const elevatorSpan = span * 0.22;
        const elevator = makePanel(elevatorSpan, wingChord * 0.4, 0.1);
        elevator.position.set(0, height * 0.75, -length * 0.46);

        // Rudder: on vertical fin.
        const rudder = makePanel(0.14, wingChord * 0.45, height * 0.32);
        rudder.position.set(0, height * 0.7, -length * 0.47);

        group.add(leftAileron, rightAileron, elevator, rudder);

        return {
            group,
            parts: { leftAileron, rightAileron, elevator, rudder }
        };
    }

    static _buildGear(span, length) {
        const group = new THREE.Group();
        group.name = 'Gear';
        const mat = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, metalness: 0.2, roughness: 0.6 });
        const strutMat = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: 0.6, roughness: 0.3 });

        function makeWheelUnit() {
            const g = new THREE.Group();
            const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 8), strutMat);
            strut.position.y = 0.8;
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 16), mat);
            wheel.rotation.z = Math.PI / 2;
            wheel.position.y = 0;
            g.add(strut, wheel);
            return g;
        }

        const nose = makeWheelUnit();
        nose.position.set(0, 0, length * 0.36);

        const left = makeWheelUnit();
        left.position.set(-span * 0.14, 0, -length * 0.02);

        const right = makeWheelUnit();
        right.position.set(span * 0.14, 0, -length * 0.02);

        group.add(nose, left, right);
        // Store base Y positions so retraction can animate them upward into the fuselage.
        group.userData.units = [nose, left, right];
        group.userData.extendedY = [nose.position.y, left.position.y, right.position.y];

        return { group, units: [nose, left, right] };
    }

    static _buildLights(span, length, height) {
        const group = new THREE.Group();
        group.name = 'AircraftLights';

        const navLeft = new THREE.PointLight(0xff2222, 0, 12);
        navLeft.position.set(-span / 2, height * 0.1, 0);
        const navRight = new THREE.PointLight(0x22ff44, 0, 12);
        navRight.position.set(span / 2, height * 0.1, 0);
        const beacon = new THREE.PointLight(0xff5500, 0, 20);
        beacon.position.set(0, height * 0.55, 0);
        const landing = new THREE.SpotLight(0xffffff, 0, 200, Math.PI / 7, 0.4, 1.2);
        landing.position.set(0, -height * 0.05, length * 0.2);
        landing.target.position.set(0, -20, length * 0.2 + 60);
        group.add(navLeft, navRight, beacon, landing, landing.target);

        return { group, navLeft, navRight, beacon, landing };
    }
}
