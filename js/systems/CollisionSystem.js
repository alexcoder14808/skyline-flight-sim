import * as THREE from 'three';

/**
 * Terrain and runway contact are already handled inside FlightPhysics (it
 * needs ground height every physics substep). This system handles the
 * remaining "solid object" collisions — airport buildings/hangars/tower —
 * which are checked less frequently since they're sparse.
 */
export class CollisionSystem {
    constructor(airport) {
        this.obstacles = [];
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
