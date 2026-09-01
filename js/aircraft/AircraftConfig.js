// Data-driven aircraft definitions.
//
// The uploaded model (assets/aircraft/aircraft.obj) has no material file and
// no named sub-objects, so exact real-world specs can't be read from the
// file itself. Its bounding box (measured on load) has a length/wingspan
// ratio of ~1.11, a single vertical tail, swept wings and two underwing
// nacelles — proportionally a narrow-body twin-engine jet airliner. The
// values below are approximations for that aircraft class, deliberately
// isolated here so they're easy to re-tune without touching physics code.
//
// V2 CHANGE (important): V1 shipped with a physics bug — the configured
// stall speed implied the aircraft needed a lift coefficient of ~2.12 to
// fly, but liftCoefficient.maxClean/maxFlaps only went up to 1.35/2.0. That
// made takeoff *mathematically impossible* at any airspeed, regardless of
// piloting. The numbers below are chosen so max available CL always exceeds
// what's needed to fly (see the validation check at the bottom of this
// file, which runs once at startup and warns in the console if a future
// edit reintroduces the same class of bug).

export const AIRCRAFT_LIBRARY = {
    uploaded_airliner: {
        id: 'uploaded_airliner',
        name: 'Uploaded Aircraft (Twin-Jet Airliner)',
        modelPath: 'assets/aircraft/aircraft.obj',
        engineType: 'jet',
        engineCount: 2,

        targetLengthMeters: 37.5,

        // Mass & aerodynamics — tuned generous/forgiving on purpose (V2:
        // "easier controls" request) rather than razor-thin like a real
        // airliner's performance margins.
        mass: 52000,              // kg
        wingArea: 130,            // m^2
        wingSpanMeters: 34.3,
        liftCoefficient: {
            zero: 0.35,            // CL at zero AoA (cambered wing)
            perRadian: 6.8,        // CL slope per radian of AoA (pre-stall)
            flapsBonus: 0.65,      // extra CL when flaps fully extended
            maxClean: 1.7,         // stall CL, flaps up
            maxFlaps: 2.3          // stall CL, flaps down
        },
        dragCoefficient: {
            zero: 0.022,
            inducedFactor: 0.05,
            gearBonus: 0.018,
            flapsBonus: 0.020,
            speedBrakeBonus: 0.05
        },

        engine: {
            maxThrustPerEngine: 120000, // Newtons, per engine
            spoolTime: 1.7,             // seconds idle -> commanded throttle (V2: quicker response)
            idleThrustFraction: 0.04
        },

        stallSpeed: 61,       // m/s (~119 kt), clean — matches liftCoefficient.maxClean, see validation below
        maxSpeed: 260,        // m/s (~505 kt)
        maxClimbRate: 16,     // m/s

        // Stall AoA is a bit more forgiving than a real airliner's ~14-16°
        // (V2 "easier controls" request).
        stallAngleDeg: 18,

        controlSensitivity: {
            pitch: 1.15,
            roll: 1.3,
            yaw: 0.75
        },
        maxDeflection: {
            aileron: 0.4,
            elevator: 0.36,
            rudder: 0.4,
            flap: 0.6
        },

        // Gentle, always-on wings-level assist when roll input is near
        // neutral (V2 "easier controls" — like the assist modes in most
        // consumer flight sims). Doesn't fight deliberate turns.
        rollAssistGain: 0.6,

        gearHeight: 3.0,
        cockpitOffset: { x: 0, y: 3.4, z: -14.5 },
        chaseCameraOffset: { x: 0, y: 8, z: 32 },

        fuel: {
            capacityLiters: 20000,
            burnRatePerNewtonSecond: 0.000009
        }
    }
};

export function getAircraftConfig(id) {
    return AIRCRAFT_LIBRARY[id] || AIRCRAFT_LIBRARY.uploaded_airliner;
}

// --- Startup validation: catches "can never lift off" bugs before they ---
// --- ship, instead of discovering them mid-flight.                     ---
function validateAircraft(cfg) {
    const RHO = 1.225, G = 9.81;
    const weight = cfg.mass * G;
    const q = 0.5 * RHO * cfg.stallSpeed * cfg.stallSpeed;
    const clNeeded = weight / (q * cfg.wingArea);
    const clAvailable = Math.max(cfg.liftCoefficient.maxClean, cfg.liftCoefficient.maxFlaps);
    if (clNeeded > clAvailable) {
        console.error(
            `[AircraftConfig] "${cfg.name}" cannot physically reach flying speed: ` +
            `needs CL=${clNeeded.toFixed(2)} at its stall speed but only has CL=${clAvailable.toFixed(2)} available. ` +
            `Lower stallSpeed, raise liftCoefficient.maxClean/maxFlaps, raise wingArea, or lower mass.`
        );
    }
}
Object.values(AIRCRAFT_LIBRARY).forEach(validateAircraft);
