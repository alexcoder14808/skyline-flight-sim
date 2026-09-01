// A lightweight canvas-drawn top-down map. Deliberately simple (a handful
// of canvas draw calls per open, redrawn only while the screen is visible)
// rather than a 3D minimap, so it stays cheap.

export class MapScreen {
    constructor(root, callbacks) {
        this.root = root;
        this.callbacks = callbacks;
        this.canvas = root.querySelector('#map-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.world = null;
        this.getAircraftState = null; // fn -> { x, z, heading } | null when not flying

        root.querySelector('#btn-map-back').addEventListener('click', () => callbacks.onBack());

        this._resizeObserver = new ResizeObserver(() => this._draw());
        this._resizeObserver.observe(this.canvas);

        this._rafId = null;
    }

    /** world: World instance. getAircraftState: () => {x,z,heading}|null */
    setData(world, getAircraftState) {
        this.world = world;
        this.getAircraftState = getAircraftState;
    }

    show() {
        this.root.classList.remove('hidden');
        this._resizeCanvas();
        this._startLoop();
    }

    hide() {
        this.root.classList.add('hidden');
        this._stopLoop();
    }

    _startLoop() {
        const tick = () => {
            this._draw();
            this._rafId = requestAnimationFrame(tick);
        };
        tick();
    }
    _stopLoop() {
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._rafId = null;
    }

    _resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
        this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    }

    _draw() {
        if (!this.world) return;
        const ctx = this.ctx;
        const w = this.canvas.width, h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        // World extent covered by the map, in metres (matches Terrain size).
        const worldSize = this.world.terrain.size;
        const scale = Math.min(w, h) / worldSize;
        const cx = w / 2, cz = h / 2;
        const toScreen = (x, z) => [cx + x * scale, cz + z * scale];

        // Background terrain tint
        ctx.fillStyle = '#12210f';
        ctx.fillRect(0, 0, w, h);

        // Coarse elevation shading (sampled grid — cheap, just for a sense of terrain)
        const gridN = 48;
        const cell = Math.min(w, h) / gridN;
        for (let gx = 0; gx < gridN; gx++) {
            for (let gz = 0; gz < gridN; gz++) {
                const wx = (gx / gridN - 0.5) * worldSize;
                const wz = (gz / gridN - 0.5) * worldSize;
                const elevation = this.world.getGroundHeight(wx, wz);
                const t = Math.max(0, Math.min(1, elevation / 340));
                if (elevation < -1) {
                    ctx.fillStyle = 'rgba(28,92,120,0.9)';
                } else {
                    const green = Math.round(90 + t * 60);
                    ctx.fillStyle = `rgba(${40 + t * 90},${green},${40 + t * 40},0.9)`;
                }
                const [sx, sz] = toScreen(wx, wz);
                ctx.fillRect(sx - cell / 2, sz - cell / 2, cell + 1, cell + 1);
            }
        }

        // Compass ring
        ctx.strokeStyle = 'rgba(63,208,255,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cz, Math.min(w, h) * 0.48, 0, Math.PI * 2);
        ctx.stroke();

        // Airports
        this.world.getAirportList().forEach((a) => {
            const [sx, sz] = toScreen(a.x, a.z);
            ctx.fillStyle = '#ffb648';
            ctx.beginPath();
            ctx.arc(sx, sz, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#0a0f16';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#e7edf3';
            ctx.font = `${Math.max(12, cell * 0.6)}px 'Share Tech Mono', monospace`;
            ctx.textAlign = 'left';
            ctx.fillText(`${a.code} — ${a.name}`, sx + 10, sz + 4);
        });

        // Live aircraft marker, if flying
        const state = this.getAircraftState ? this.getAircraftState() : null;
        if (state) {
            const [sx, sz] = toScreen(state.x, state.z);
            ctx.save();
            ctx.translate(sx, sz);
            ctx.rotate(state.heading);
            ctx.fillStyle = '#3fd0ff';
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(7, 8);
            ctx.lineTo(0, 4);
            ctx.lineTo(-7, 8);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }
}
