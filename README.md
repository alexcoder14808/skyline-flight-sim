# Skyline Flight — Browser 3D Flight Simulator (V1)

A from-scratch, browser-based 3D flight simulator built with **Three.js**,
**WebGL**, and the **Web Audio API**. No build step, no backend — open
`index.html` (via a local server) and fly.

This is **V1**: a complete, playable foundation, not a demo. It's designed so
V2+ can layer on more aircraft, real-world terrain, navigation, ATC, and
multiplayer without rewriting the core.

---

## 1. What's in this build

- Your uploaded aircraft (`assets/aircraft/aircraft.obj`), loaded, auto-scaled,
  auto-oriented, and flown with a real modular flight-physics model
  (thrust/drag/lift/gravity/stall/ground handling), not a "move forward when
  key pressed" hack.
- A large procedural world: rolling terrain (procedural noise, vertex-colored,
  with instanced trees), a full airport (runway with markings, taxiway,
  apron, terminal, hangars, control tower, windsock, runway lighting).
- Day / sunset / night lighting with a physically-based sky (Three.js `Sky`),
  moving sun, stars at night, fog.
- Clear/cloudy weather and calm/light/moderate wind, all affecting the
  aircraft.
- 4 camera modes: cockpit, chase, external orbit, free look (drag + scroll).
- A clean aviation-style HUD: airspeed, altitude, vertical speed, heading
  strip, a real attitude indicator (driven by actual pitch/roll — not
  faked), throttle, gear/flap/engine/fuel state, stall warning.
- Procedurally synthesized audio (engine, wind, gear, flaps, stall warning,
  crash, ambient music, airport ambience) with per-channel volume and mute —
  see `assets/audio/SOURCES.md` for why, and how to swap in real recorded
  audio later.
- Main menu, flight setup (start position / time / weather / wind), settings
  (volumes, graphics quality, shadows, render distance, sensitivity, invert
  pitch — all saved to `localStorage`), pause menu, crash screen, and a
  landing-complete screen with touchdown stats.
- A debug overlay (backtick key) showing live FPS/position/velocity/AoA/
  lift/drag/thrust/ground-contact — for tuning the flight model.
- Runs entirely client-side; deployable as static files to GitHub Pages.

## 2. About your aircraft model

You uploaded a `.zip` containing `3d-model.obj` — a single OBJ mesh (25,080
vertices), **no `.mtl` material file**, and **no named sub-objects**
(everything is generic `Group_###` / `Component_#_###`). There were no
identifiable `aileron`/`elevator`/`rudder`/`gear`/`propeller` objects to
animate directly.

Its bounding box, though, is unambiguous: length ≈1530 units, wingspan
≈1375 units, height ≈477 units (length/span ratio ≈1.11), a single vertical
tail, swept wings, and two underwing nacelles — proportionally a narrow-body
twin-engine jet airliner (737/A320 class). The loader:

1. Loads the OBJ with `OBJLoader`.
2. Computes its bounding box, detects the fuselage (longest horizontal) axis,
   and figures out which end is the nose by comparing cross-sectional
   "thickness" at each end (the nose end is narrower).
3. Rotates the model so the nose points along the simulator's forward axis
   (local **-Z**), and re-centers/rescales it so it sits on an `AircraftRoot`
   `Object3D` at a real-world length of **37.5 m** (configurable — see
   `js/aircraft/AircraftConfig.js`) with its belly at the root's `y = 0`.
4. Since there's nothing named to animate, it attaches small procedural
   panel meshes at the correct wing/tail locations (ailerons, elevator,
   rudder) that visibly deflect with control input, plus procedural landing
   gear (retracts on `G`) and point/spot lights for nav/beacon/landing
   lights.
5. Because there's no `.mtl`, every mesh gets a default light-gray PBR
   material (`MeshStandardMaterial`) so it reads well under the sky/sun
   lighting.

Mass, wing area, thrust, stall speed, etc. are approximated for a
737/A320-class twin-jet and isolated in `AircraftConfig.js` — they're
estimates (the model itself doesn't encode real specs), clearly labeled as
such, and easy to re-tune.

## 3. Running it

You need a local static file server (ES modules and `fetch()`-loaded assets
don't work from a bare `file://` URL in most browsers). From this folder:

```bash
# Option A: Python
python3 -m http.server 8080

# Option B: Node (if you have it)
npx serve .
```

Then open `http://localhost:8080` in Chrome, Edge, or Firefox.

## 4. Controls

| Key | Action |
|---|---|
| W / S | Pitch down / up |
| A / D | Roll left / right |
| Q / E | Yaw (rudder) left / right |
| ↑ / ↓ | Throttle up / down |
| G | Landing gear |
| F | Flaps (cycles 0 → 33 → 66 → 100%) |
| B | Brakes (hold) |
| Space | Parking brake toggle |
| C | Cycle camera (chase → cockpit → external → free) |
| P / Esc | Pause |
| R | Reset flight |
| ` (backtick) | Debug overlay |

**Gamepad** (if connected): left stick = roll/pitch, right stick X = rudder,
triggers = throttle, A button = gear. The reader code in
`AircraftControls._readGamepad()` is intentionally small and isolated so more
buttons/axes are easy to map later.

## 5. How the physics work

`js/aircraft/FlightPhysics.js` runs a simplified but genuine 6DOF-lite model,
entirely in SI units, using **delta time** (so it behaves the same at 30 FPS
or 144 FPS):

- Body-frame airspeed, angle of attack, and sideslip are computed from the
  aircraft's velocity relative to the wind.
- Lift and drag coefficients come from angle of attack, flap setting, gear,
  and speed-brakes, with a stall model that reduces lift and spikes drag past
  ~14–16° AoA (or past the configured max CL) — it degrades lift rather than
  destroying the aircraft.
- Thrust spools up/down over a couple of seconds rather than snapping
  instantly, and burns fuel; fuel-out kills the engine and the plane has to
  glide.
- On the ground, rolling friction + brakes + parking brake decelerate the
  aircraft, and rudder input steers at taxi speed; control-surface authority
  in the air scales with airspeed (so a stalled, slow aircraft is sluggish to
  control, as it should be).
- Hard landings (>8 m/s sink rate), gear-up touchdowns, or excessive bank/
  pitch at touchdown trigger a crash; normal touchdowns just land.

### Coordinate convention

- World **Y is up**.
- Aircraft local **forward is -Z**, local **up is +Y**, local **right is +X**.
- Physics reads/writes `AircraftRoot.position` and `.quaternion` — never the
  loaded mesh directly. Visuals (`Aircraft._syncVisuals`) copy from physics
  state every frame, one direction only.

## 6. Adding another aircraft later

1. Add a new entry to `AIRCRAFT_LIBRARY` in `js/aircraft/AircraftConfig.js`
   with its own `modelPath`, mass, wing area, thrust, etc.
2. Drop the model file under `assets/aircraft/`.
3. Add an option for it in the Flight Setup screen (`js/ui/FlightSetup.js` +
   the aircraft section in `index.html`) once there's more than one to choose
   from.

The loader, physics, controls, camera, and HUD are all already data-driven
off the aircraft's config — none of them hardcode the current aircraft.

## 7. Tuning the flight model

Turn on the debug overlay (`` ` ``) and watch `Lift`, `Drag`, `Thrust`, and
`AoA` while flying. Most of what you'll want to adjust lives in
`AircraftConfig.js`:

- Aircraft feels sluggish to take off → lower `stallSpeed` or raise
  `engine.maxThrustPerEngine`.
- Aircraft floats/won't stop climbing → lower `liftCoefficient.perRadian` or
  raise `dragCoefficient.zero`.
- Controls feel twitchy/sluggish → adjust `controlSensitivity` (also exposed
  as a player-facing "Flight Sensitivity" slider in Settings).
- Stalls happen too early/late → adjust `liftCoefficient.maxClean` /
  `maxFlaps` and the AoA threshold in `FlightPhysics.step()`.

## 8. Known V1 limitations (by design — see priority order below)

- No literal named control-surface animation (see §2) — procedural surrogate
  panels are used instead.
- No real recorded audio (see `assets/audio/SOURCES.md`).
- One aircraft, one airport, one world tile — no real-world terrain,
  multiplayer, ATC, navigation aids, or missions. These are intentionally
  deferred to future versions; the architecture (data-driven aircraft/
  weather, modular systems) is built to make adding them straightforward
  without rewrites.

## 9. Deploying to GitHub Pages

This project uses only relative paths and client-side code — no server, no
build step required.

1. Push this folder to a GitHub repository (commit `assets/aircraft/aircraft.obj`
   as-is — it's a binary-ish text file but small enough for a normal commit).
2. In the repo settings, enable **Pages**, source = the branch/folder
   containing `index.html` (root, or `/docs` if you move it there).
3. GitHub Pages serves static files over HTTPS with correct relative paths
   automatically — no changes needed to `index.html` or the import map.

## 10. Project structure

```
index.html
style.css
README.md
js/
    main.js                    # app bootstrap, state machine, game loop
    aircraft/
        Aircraft.js             # ties model + physics + controls + visuals together
        AircraftLoader.js       # OBJ loading, auto-scale/orient, procedural surfaces
        FlightPhysics.js        # delta-time flight model
        AircraftControls.js     # keyboard + gamepad input, smoothing
        AircraftConfig.js       # data-driven aircraft specs
    world/
        World.js                # assembles terrain + airport + environment + weather
        Terrain.js               # procedural noise terrain, instanced trees
        Airport.js                # runway/taxiway/apron/buildings/tower/lighting
        Environment.js            # sky, sun, fog, day/night blending
    cockpit/
        HUD.js                    # in-flight HUD
        Instruments.js             # attitude indicator
    camera/
        CameraManager.js            # cockpit/chase/external/free cameras
    audio/
        AudioManager.js              # procedural Web Audio engine (see SOURCES.md)
    systems/
        WeatherSystem.js, TimeSystem.js, CollisionSystem.js
    ui/
        MainMenu.js, FlightSetup.js, Settings.js, PauseMenu.js
    utils/
        MathUtils.js, Storage.js
assets/
    aircraft/aircraft.obj
    audio/SOURCES.md
```

## 11. Browser support

Tested against current Chrome, Edge, and Firefox feature sets (WebGL2, ES
modules, Web Audio, Gamepad API). Desktop-focused; menus reflow reasonably on
narrow viewports but the flight experience itself targets desktop.
