import * as THREE from 'three';

/**
 * Terrain and runway contact are already handled inside FlightPhysics (it
 * needs ground height every physics substep). This system handles the
 * remaining "solid object" collisions — airport buildings/hangars/tower —
 * which are checked less frequently since they're sparse.
 *
 * V2: accepts either a single Airport or an array/object of them, since the
 * world now has multiple airports.
 */
export class CollisionSystem {
    constructor(airports) {
        this.obstacles = [];
        const list = Array.isArray(airports) ? airports : Object.values(airports);
        list.forEach((airport) => this._collectObstacles(airport));
    }

    _collectObstacles(airport) {
        // Ensure world transforms are current even if this runs before the
        // first render() call (matrixWorld is otherwise only refreshed
        // during rendering, and airports placed away from the origin need
        // their real world position for this to be correct).
        airport.group.updateMatrixWorld(true);
        airport.group.traverse((child) => {
            if (child.isMesh && child.geometry && child.geometry.type !== 'PlaneGeometry' && child.geometry.type !== 'RingGeometry') {
                const box = new THREE.Box3().setFromObject(child);
                const sphere = new THREE.Sphere();
                box.getBoundingSphere(sphere);
                if (sphere.radius > 1 && sphere.radius < 60) {
                    this.obstacles.push(sphere);
                }
            }
        });
    }

    /** Returns true if the aircraft position intersects a static obstacle. */
    check(position, aircraftRadius = 6) {
        for (const sphere of this.obstacles) {
            const dist = position.distanceTo(sphere.center);
            if (dist < sphere.radius + aircraftRadius) return true;
        }
        return false;
    }
}
