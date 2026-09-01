// Data-driven aircraft definitions.
//
// The uploaded model (assets/aircraft/aircraft.obj) has no material file and
// no named sub-objects (aileron/flap/gear/etc are not identifiable in the mesh),
// so exact real-world specs can't be read from the file itself. Its bounding
// box (measured on load) has a length/wingspan ratio of ~1.11, a single
// vertical tail, swept wings and two underwing nacelles — proportionally a
// narrow-body twin-engine jet airliner (737/A320 class). The values below are
// sensible approximations for that aircraft class, deliberately isolated here
// so they're easy to re-tune without touching the physics code.
//
// To add a second aircraft later: add another entry here, add its model file
// under assets/aircraft/, and reference the new id from FlightSetup.

export const AIRCRAFT_LIBRARY = {
    uploaded_airliner: {
        id: 'uploaded_airliner',
        name: 'Uploaded Aircraft (Twin-Jet Airliner)',
        modelPath: 'assets/aircraft/aircraft.obj',
        engineType: 'jet',
        engineCount: 2,

        // Target real-world length (metres, nose to tail) used to auto-scale
        // the raw model on load, since 1 model unit is not 1 metre.
        targetLengthMeters: 37.5,

        // Mass & aerodynamics (approximate, narrow-body jet airliner class)
        mass: 62000,              // kg, typical mid-flight weight
        wingArea: 122,            // m^2
        wingSpanMeters: 34.3,     // used for aileron/nacelle placement
        liftCoefficient: {
            zero: 0.25,           // CL at zero AoA (cambered wing)
            perRadian: 5.2,       // CL slope per radian of AoA (pre-stall)
            flapsBonus: 0.55,     // extra CL when flaps fully extended
            maxClean: 1.35,       // stall CL, flaps up
            maxFlaps: 2.0         // stall CL, flaps down
        },
        dragCoefficient: {
            zero: 0.022,          // parasite drag
            inducedFactor: 0.055, // induced drag factor (k in k*CL^2)
            gearBonus: 0.018,
            flapsBonus: 0.020,
            speedBrakeBonus: 0.05
        },

        engine: {
            maxThrustPerEngine: 110000, // Newtons, per engine (~24,700 lbf)
            spoolTime: 2.2,             // seconds to go from idle to commanded throttle
            idleThrustFraction: 0.04
        },

        stallSpeed: 62,      // m/s (~120 kt), clean, at typical weight
        maxSpeed: 260,       // m/s (~505 kt) structural/practical cap
        maxClimbRate: 15,    // m/s

        controlSensitivity: {
            pitch: 1.0,
            roll: 1.1,
            yaw: 0.6
        },
        // Max control-surface deflection, radians, used for visuals + authority
        maxDeflection: {
            aileron: 0.35,
            elevator: 0.3,
            rudder: 0.35,
            flap: 0.55
        },

        gearHeight: 3.1,       // metres, ground clearance under fuselage belly when gear down
        cockpitOffset: { x: 0, y: 3.4, z: -14.5 }, // relative to aircraft root, metres
        chaseCameraOffset: { x: 0, y: 8, z: 32 },

        fuel: {
            capacityLiters: 20000,
            burnRatePerNewtonSecond: 0.000009 // fuel liters consumed per (N of thrust * second)
        }
    }
};

export function getAircraftConfig(id) {
    return AIRCRAFT_LIBRARY[id] || AIRCRAFT_LIBRARY.uploaded_airliner;
}
