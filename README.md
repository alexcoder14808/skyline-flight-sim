# Skyline Flight — Browser 3D Flight Simulator (V2)

A from-scratch, browser-based 3D flight simulator built with **Three.js**,
**WebGL**, and the **Web Audio API**. No build step, no backend — open
`index.html` (via a local server) and fly.

---

## What changed in V2

**The aircraft could not take off in V1 — this is fixed.** It wasn't a
controls problem: V1's configured stall speed implied the aircraft needed a
maximum lift coefficient of ~2.12 to fly, but the config only allowed up to
2.0. That made liftoff **mathematically impossible** at any speed, no matter
how it was flown. `AircraftConfig.js` now has physics-validated numbers (with
a startup console check that will flag this class of bug immediately if
future tuning reintroduces it), tuned generously so takeoff is easy and
reliable, not marginal.

Also new in V2:
- **Easier controls**: more forgiving stall angle, a gentle always-on
  wings-level assist when roll input is neutral, quicker throttle response,
  a small ground-effect lift boost right at rotation speed.
- **Free-look camera**: Page Up/Page Down to look up/down, Left/Right arrow
  keys to look around — independent of the flight controls, works in chase/
  cockpit/external views. Mouse wheel zooms the camera in and out
  Kerbal-Space-Program style.
- **Three airports** spread across the world (Skyline International,
  Highland Regional, Coastal Fields), each with its own runway/taxiway/
  apron/buildings/tower — pick your starting airport in Flight Setup, or
  just fly to any of the others and land there.
- **World map screen** (from the main menu, or mid-flight via Pause → Map)
  showing all airports and, while flying, your aircraft's live position and
  heading.
- **Richer procedural music**: a slow 4-chord ambient pad with gentle stereo
  movement plus a sparse randomized bell layer, still fully synthesized (see
  "About the audio" below for why).
- **Lighter-weight graphics upgrades**: clouds and rock formations are now
  GPU-instanced (one draw call each, regardless of count) rather than
  individual meshes, plus a subtle animated water shimmer — visual variety
  without extra render cost.

## 1. What's in this build

- Your uploaded aircraft (`assets/aircraft/aircraft.obj`), loaded, auto-scaled,
  auto-oriented, and flown with a real modular flight-physics model
  (thrust/drag/lift/gravity/stall/ground handling/ground effect).
- Three full airports across a large procedural world: rolling terrain
  (procedural noise, vertex-colored, instanced trees and rocks), each
  airport with a runway (markings), taxiway, apron, terminal, hangars,
  control tower, windsock, and runway lighting.
- Day / sunset / night lighting with a physically-based sky (Three.js `Sky`),
  moving sun, stars at night, fog.
- Clear/cloudy weather and calm/light/moderate wind, all affecting the
  aircraft.
- 4 camera modes: cockpit, chase, external orbit, free look — all with
  Page Up/Down + Left/Right free-look and scroll-wheel zoom.
- A clean aviation-style HUD: airspeed, altitude, vertical speed, heading
  strip, a real attitude indicator, throttle, gear/flap/engine/fuel state,
  stall warning.
- Procedurally synthesized audio (engine, wind, gear, flaps, stall warning,
  crash, ambient chord-progression music, airport ambience) with per-channel
  volume and mute.
- Main menu, flight setup (airport / start position / time / weather /
  wind), a world map, settings (volumes, graphics quality, shadows, render
  distance, sensitivity, invert pitch — all saved to `localStorage`), pause
  menu, crash screen, landing-complete screen.
- A debug overlay (backtick key) showing live FPS/position/velocity/AoA/
  lift/drag/thrust/ground-contact.
- Runs entirely client-side; deployable as static files to GitHub Pages.

## 2. About your aircraft model

You uploaded a `.zip` containing `3d-model.obj` — a single OBJ mesh (25,080
vertices), no `.mtl` material file, and no named sub-objects. Its bounding
box (length ≈1530 units, wingspan ≈1375, height ≈477, ratio ≈1.11), single
vertical tail, swept wings, and two underwing nacelles read as a narrow-body
twin-engine jet airliner (737/A320 class). The loader auto-detects the nose/
orientation, rescales it to a real 37.5m airliner, centers it on an
`AircraftRoot` at belly height, and attaches procedural control-surface
panels (ailerons/elevator/rudder), landing gear, and nav/beacon/landing
lights since nothing in the source file is named to animate directly. Mass,
wing area, thrust, and lift numbers are approximations for that aircraft
class — isolated in `AircraftConfig.js`, validated at startup so they can
never again be silently below what's needed to fly.

## 3. Running it

You need a local static file server:

```bash
python3 -m http.server 8080
# or: npx serve .
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
| Page Up / Page Down | Look up / down (free-look) |
| ← / → | Look left / right (free-look) |
| Scroll wheel | Zoom camera in/out |
| P / Esc | Pause |
| R | Reset flight |
| ` (backtick) | Debug overlay |

Free-look and zoom only move the *camera* — they never touch the aircraft's
actual flight controls, so you can look around mid-maneuver safely.

**Gamepad** (if connected): left stick = roll/pitch, right stick X = rudder,
triggers = throttle, A button = gear.

## 5. How the physics work

`js/aircraft/FlightPhysics.js` runs a simplified but genuine 6DOF-lite model
in SI units, using delta time. Lift/drag coefficients come from angle of
attack, flaps, gear, and speed-brakes; a stall model reduces lift and spikes
drag past the configured stall angle (18° by default — more forgiving than a
real airliner's ~14-16°) rather than destroying the aircraft; ground effect
gives a modest lift bonus within about one wingspan of the ground; thrust
spools up/down over ~1.7s and burns fuel; on the ground, rolling friction +
brakes + parking brake decelerate the aircraft and rudder steers at taxi
speed. Control authority in the air scales with airspeed, and a gentle
wings-level assist (`rollAssistGain` in the aircraft config) nudges bank
angle back toward zero whenever roll input is near neutral.

Every aircraft config is validated at startup (`AircraftConfig.js`, bottom of
the file): if a future edit sets a stall speed that needs more lift than the
configured max CL can provide, the console will say so immediately instead
of the plane silently being unable to fly.

### Coordinate convention

World Y is up; aircraft local forward is **-Z**, local up is **+Y**, local
right is **+X**. Physics reads/writes `AircraftRoot.position`/`.quaternion`
only — visuals copy from physics state every frame, one direction.

## 6. Airports & the map

Three airports are laid out across the world in `js/world/World.js`
(`AIRPORT_LAYOUT`): Skyline International (origin), Highland Regional, and
Coastal Fields. Pick your starting airport under Flight Setup, or take off
from one and simply fly to another — landing detection is generic and works
anywhere the aircraft touches down gently, not just at one hardcoded runway.
The Map screen (`js/ui/MapScreen.js`) draws a simple top-down canvas view of
the whole terrain with every airport marked, plus your live position/heading
while flying.

To add a fourth airport: add one entry to `AIRPORT_LAYOUT` in `World.js`
(id/name/code/x/z/heading, far enough from existing airports that their
flatten pads don't overlap) — `Terrain` and `MapScreen` both read that list
directly, so nothing else needs to change.

## 7. Adding another aircraft

1. Add a new entry to `AIRCRAFT_LIBRARY` in `js/aircraft/AircraftConfig.js`.
   **Cross-check your stall speed against your lift coefficients** — the
   startup validator will warn in the console if they're inconsistent, but
   it's worth sanity-checking by hand: `CL_needed = weight / (0.5 * 1.225 *
   stallSpeed² * wingArea)` must be ≤ your `maxClean`/`maxFlaps`.
2. Drop the model file under `assets/aircraft/`.
3. Wire it into the Flight Setup aircraft selector once there's more than
   one.

## 8. About the audio

This build environment has no live internet access, so real files couldn't
actually be downloaded from Pixabay for this delivery — every sound is
synthesized at runtime with the Web Audio API instead (explicitly allowed as
a fallback in the original spec). V2's music layer is a slow 4-chord
generative pad with gentle stereo drift plus a sparse randomized bell layer.
See `assets/audio/SOURCES.md` for exactly where to plug in real licensed
Pixabay audio later — the public API of `AudioManager` (`updateEngine`,
`updateWind`, `playGear`, `playFlaps`, `setStallWarning`, `playCrash`,
`updateMusic`) doesn't need to change, only what's inside those methods.

## 9. Deploying to GitHub Pages

Only relative paths, no build step. Push the whole folder to a repo (keep
`index.html` at the repo root), enable Pages under Settings → Pages,
source = "Deploy from a branch", branch = `main`, folder = `/ (root)`.

## 10. Project structure

```
index.html
style.css
README.md
js/
    main.js
    aircraft/
        Aircraft.js, AircraftLoader.js, FlightPhysics.js,
        AircraftControls.js, AircraftConfig.js
    world/
        World.js            # assembles terrain + all airports + environment + weather
        Terrain.js            # procedural noise terrain, instanced trees/rocks, water shimmer
        Airport.js              # positionable/reusable airport (runway/taxiway/apron/tower/lights)
        Environment.js            # sky, sun, fog, day/night blending
    cockpit/
        HUD.js, Instruments.js
    camera/
        CameraManager.js       # cockpit/chase/external/free + free-look + zoom
    audio/
        AudioManager.js         # procedural Web Audio engine (see SOURCES.md)
    systems/
        WeatherSystem.js, TimeSystem.js, CollisionSystem.js
    ui/
        MainMenu.js, FlightSetup.js, Settings.js, PauseMenu.js, MapScreen.js
    utils/
        MathUtils.js, Storage.js
assets/
    aircraft/aircraft.obj
    audio/SOURCES.md
```

## 11. Browser support

Tested against current Chrome, Edge, and Firefox feature sets (WebGL2, ES
modules, Web Audio, Gamepad API, `ResizeObserver`, `StereoPannerNode`).
Desktop-focused; menus reflow reasonably on narrow viewports but the flight
experience itself targets desktop.
