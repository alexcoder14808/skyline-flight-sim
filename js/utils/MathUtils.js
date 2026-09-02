// Shared math helpers used across the simulator.

export function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Exponential smoothing that is frame-rate independent.
// `smoothing` is a time constant in seconds (bigger = slower).
export function damp(current, target, smoothing, dt) {
    const t = 1 - Math.exp(-dt / Math.max(smoothing, 1e-4));
    return lerp(current, target, t);
}

export function degToRad(d) {
    return (d * Math.PI) / 180;
}

export function radToDeg(r) {
    return (r * 180) / Math.PI;
}

export function msToKnots(ms) {
    return ms * 1.9438444924;
}

export function metersToFeet(m) {
    return m * 3.280839895;
}

export function msToFpm(ms) {
    // metres/sec vertical speed -> feet per minute
    return ms * 196.850393701;
}

// Wrap an angle (radians) into [-PI, PI]
export function wrapAngle(a) {
    a = a % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a < -Math.PI) a += Math.PI * 2;
    return a;
}

export function randRange(min, max) {
    return min + Math.random() * (max - min);
}
