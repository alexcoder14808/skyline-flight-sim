# Skyline Flight — Browser 3D Flight Simulator (V3.1)

## V3.1 — the actual root cause, finally found and fixed

The browser console error made this unambiguous:

```
FRAGMENT shader uniforms count exceeds MAX_FRAGMENT_UNIFORM_VECTORS(1024)
```

`Airport._buildLighting()` was creating one **real** `THREE.PointLight` for
every runway edge bulb — about 88 per airport. With 4 airports that put
~350+ real dynamic lights in the scene at once. Three.js compiles a
fragment shader with uniform arrays sized for every active light, and that
many real lights blew straight through the GPU's uniform budget, so *every*
standard-lit material's shader failed to compile — which is why the whole
screen went blank. This had been present since the very first version; it
just happened to survive with one airport (~89 lights, borderline) and
broke the moment a second and third airport were added, which lines up
exactly with when the blank screens started.

**Fix:** runway edge bulbs are now a single unlit, self-illuminated
`InstancedMesh` per airport (one draw call, and zero light-uniform cost —
unlit materials don't reference scene lighting at all), with only 2 real,
soft point lights per airport left for actual illumination near the runway
ends at night. Total real dynamic lights in the scene dropped from ~360 to
19 — a completely ordinary budget for any GPU. Audited the rest of the
codebase for the same mistake; nothing else creates lights in a loop.

This was the actual cause of every blank-screen report across every
previous version — not the sky glare, which was a real but much smaller
issue that's still fixed too.

A from-scratch, browser-based 3D flight simulator built with **Three.js**,
**WebGL**, and the **Web Audio API**. No build step, no backend — open
`index.html` (via a local server) and fly.

---

## What changed in V3 — a deliberate step back to reliability

V2.1 added postprocessing (bloom) and a custom baked environment-reflection
system on top of an already-fresh sky-glare fix, all in one pass, without a
real browser available to verify any of it. The result was still a blank
screen. That was the wrong call — stacking untested, high-risk rendering
code on top of a fix that itself hadn't been confirmed working. V3 reverses
that:

- **Removed entirely**: the `EffectComposer`/`UnrealBloomPass` bloom
  pipeline and the `PMREMGenerator` custom environment-reflection baking.
  Rendering is back to the plain `renderer.render(scene, camera)` call that
  was confirmed working in the very first build.
- **Kept**: the actual sky-glare fix (lower Mie scattering values) and the
  free-look pitch clamp — both are simple, low-risk numeric changes, pushed
  even more conservative here as extra headroom since this still can't be
  tested in a real browser from this environment.
- **World is now genuinely large**: a 4th airport (Desert Mesa) added, and
  the world expanded so the furthest two airports are ~17.6km apart —
  flying between them is a real trip, not a quick hop.
- **Map stays as built in the last pass**: directly accessible mid-flight
  with the **M** key (no detour through Pause), plus the compass rose,
  scale bar, legend, and runway-oriented airport markers.
- Your aircraft, the physics fix, and the multi-airport world are all
  unchanged and confirmed still in place.

## 1. What's in this build

- Your uploaded aircraft (`assets/aircraft/aircraft.obj`), loaded, auto-scaled,
  auto-oriented, and flown with a real modular flight-physics model
  (thrust/drag/lift/gravity/stall/ground handling/ground effect) — numbers
  validated at startup so it can never again be silently unable to fly.
- Four full airports across a large procedural world (furthest pair ~17.6km
  apart), each with a runway, taxiway, apron, terminal, hangars, control
  tower, windsock, and lighting.
- Day/sunset/night sky with a moving sun, stars, fog — plain, proven
  rendering (no postprocessing).
- Clear/cloudy weather and calm/light/moderate wind.
- 4 camera modes with free-look (Page Up/Down, Left/Right, tightly clamped)
  and Kerbal-Space-Program-style scroll-wheel zoom.
- A clean aviation HUD with a real attitude indicator, plus a debug overlay.
- An in-flight-accessible world map (M key) with compass, scale, and legend.
- Procedurally synthesized audio (see `assets/audio/SOURCES.md`) with a
  4-chord ambient pad and per-channel volume/mute.
- Main menu, flight setup, settings (saved to `localStorage`), pause,
  crash, and landing-complete screens.
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
| M | Toggle map (works mid-flight — pauses physics while open) |
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

Four airports are laid out across the world in `js/world/World.js`
(`AIRPORT_LAYOUT`): Skyline International (origin), Highland Regional,
Coastal Fields, and Desert Mesa. Pick your starting airport under Flight Setup, or take off
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
