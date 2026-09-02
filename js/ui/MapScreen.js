// A canvas-drawn top-down map. V2.1: higher-resolution terrain sampling,
// smoother multi-stop color ramp (water -> beach -> lowland -> highland ->
// snow), a compass rose, a distance scale bar, a legend, and airports drawn
// as small runway-oriented rectangles instead of plain dots — while staying
// cheap (a bounded number of canvas draw calls per frame, only while the
// map is actually open).

const TERRAIN_COLOR_STOPS = [
    { t: 0.00, color: [22, 58, 74] },   // deep water
    { t: 0.02, color: [40, 92, 112] },  // shallow water
    { t: 0.05, color: [194, 178, 128] },// beach/shore
    { t: 0.12, color: [76, 122, 58] },  // lowland grass
    { t: 0.35, color: [110, 128, 84] }, // upland scrub
    { t: 0.62, color: [122, 116, 104] },// rock
    { t: 0.85, color: [176, 176, 176] },// high rock
    { t: 1.00, color: [244, 246, 248] } // snow cap
];

function sampleColorRamp(t) {
    t = Math.max(0, Math.min(1, t));
    for (let i = 0; i < TERRAIN_COLOR_STOPS.length - 1; i++) {
        const a = TERRAIN_COLOR_STOPS[i], b = TERRAIN_COLOR_STOPS[i + 1];
        if (t >= a.t && t <= b.t) {
            const localT = (t - a.t) / Math.max(1e-6, b.t - a.t);
            return [
                Math.round(a.color[0] + (b.color[0] - a.color[0]) * localT),
                Math.round(a.color[1] + (b.color[1] - a.color[1]) * localT),
                Math.round(a.color[2] + (b.color[2] - a.color[2]) * localT)
            ];
        }
    }
    return TERRAIN_COLOR_STOPS[TERRAIN_COLOR_STOPS.length - 1].color;
}

export class MapScreen {
    constructor(root, callbacks) {
        this.root = root;
        this.callbacks = callbacks;
        this.canvas = root.querySelector('#map-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.world = null;
        this.getAircraftState = null;

        root.querySelector('#btn-map-back').addEventListener('click', () => callbacks.onBack());

        this._resizeObserver = new ResizeObserver(() => { this._resizeCanvas(); this._terrainDirty = true; });
        this._resizeObserver.observe(this.canvas);

        this._rafId = null;
        this._terrainDirty = true;
        this._terrainLayer = document.createElement('canvas'); // cached offscreen terrain (only redrawn when needed)
        this._terrainCtx = this._terrainLayer.getContext('2d');
    }

    setData(world, getAircraftState) {
        this.world = world;
        this.getAircraftState = getAircraftState;
        this._terrainDirty = true;
    }

    show() {
        this.root.classList.remove('hidden');
        this._resizeCanvas();
        this._terrainDirty = true;
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
        const w = Math.max(1, Math.round(rect.width * dpr));
        const h = Math.max(1, Math.round(rect.height * dpr));
        this.canvas.width = w;
        this.canvas.height = h;
        this._terrainLayer.width = w;
        this._terrainLayer.height = h;
    }

    // Terrain sampling is the expensive part — bake it to an offscreen
    // canvas once (on open / resize / world change) and just blit it every
    // frame, rather than re-sampling ~4000 points per frame.
    _renderTerrainLayer() {
        if (!this.world) return;
        const ctx = this._terrainCtx;
        const w = this._terrainLayer.width, h = this._terrainLayer.height;
        const worldSize = this.world.terrain.size;
        const cx = w / 2, cz = h / 2;
        const scale = Math.min(w, h) / worldSize;

        const gridN = 96; // higher resolution than V2's 48 for a much smoother look
        const cell = Math.min(w, h) / gridN;
        const imgData = ctx.createImageData(w, h);

        // Sample at grid resolution, then paint filled cells (cheap enough
        // baked once vs. per-pixel every frame).
        ctx.clearRect(0, 0, w, h);
        for (let gx = 0; gx < gridN; gx++) {
            for (let gz = 0; gz < gridN; gz++) {
                const wx = ((gx + 0.5) / gridN - 0.5) * worldSize;
                const wz = ((gz + 0.5) / gridN - 0.5) * worldSize;
                const elevation = this.world.getGroundHeight(wx, wz);
                const t = elevation <= 0 ? 0 : Math.min(1, elevation / 340);
                const [r, g, b] = elevation < -1 ? [22, 58, 74] : sampleColorRamp(Math.max(0.03, t));
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                const sx = cx + wx * scale, sz = cz + wz * scale;
                ctx.fillRect(sx - cell / 2, sz - cell / 2, cell + 1, cell + 1);
            }
        }

        // Faint contour-style graticule for a more "real map" feel.
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        const gridLines = 12;
        for (let i = 1; i < gridLines; i++) {
            const x = (w / gridLines) * i;
            const y = (h / gridLines) * i;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        this._terrainDirty = false;
    }

    _draw() {
        if (!this.world) return;
        if (this._terrainDirty) this._renderTerrainLayer();

        const ctx = this.ctx;
        const w = this.canvas.width, h = this.canvas.height;
        const worldSize = this.world.terrain.size;
        const scale = Math.min(w, h) / worldSize;
        const cx = w / 2, cz = h / 2;
        const toScreen = (x, z) => [cx + x * scale, cz + z * scale];

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(this._terrainLayer, 0, 0);

        // Outer ring + compass rose
        const ringR = Math.min(w, h) * 0.485;
        ctx.strokeStyle = 'rgba(63,208,255,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cz, ringR, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#3fd0ff';
        ctx.font = `bold ${Math.max(13, ringR * 0.055)}px 'Share Tech Mono', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const compassPad = ringR * 0.13;
        ctx.fillText('N', cx, cz - ringR + compassPad * 0.4);
        ctx.fillText('S', cx, cz + ringR - compassPad * 0.4);
        ctx.fillText('E', cx + ringR - compassPad * 0.4, cz);
        ctx.fillText('W', cx - ringR + compassPad * 0.4, cz);

        // Airports — runway-oriented rectangles rather than plain dots.
        this.world.getAirportList().forEach((a) => {
            const [sx, sz] = toScreen(a.x, a.z);

            ctx.save();
            ctx.translate(sx, sz);
            ctx.rotate(a.heading);
            const runwayPxLen = Math.max(14, a.runwayLength * scale);
            // Runway width is exaggerated ~3x versus true scale (45m would
            // render under 2px and be invisible) — standard cartographic
            // practice for thin linear features on a small-scale map.
            const runwayPxWidth = Math.max(4, a.runwayWidth * scale * 3);
            ctx.fillStyle = '#ffb648';
            ctx.fillRect(-runwayPxWidth / 2, -runwayPxLen / 2, runwayPxWidth, runwayPxLen);
            ctx.strokeStyle = '#0a0f16';
            ctx.lineWidth = 1;
            ctx.strokeRect(-runwayPxWidth / 2, -runwayPxLen / 2, runwayPxWidth, runwayPxLen);
            ctx.restore();

            ctx.fillStyle = '#e7edf3';
            ctx.font = `${Math.max(12, ringR * 0.045)}px 'Share Tech Mono', monospace`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillText(`${a.code} — ${a.name}`, sx + 12, sz + 4);
        });

        // Live aircraft marker
        const state = this.getAircraftState ? this.getAircraftState() : null;
        if (state) {
            const [sx, sz] = toScreen(state.x, state.z);
            ctx.save();
            ctx.translate(sx, sz);
            ctx.rotate(state.heading);
            ctx.shadowColor = 'rgba(63,208,255,0.9)';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#3fd0ff';
            ctx.beginPath();
            ctx.moveTo(0, -11);
            ctx.lineTo(8, 9);
            ctx.lineTo(0, 5);
            ctx.lineTo(-8, 9);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // Scale bar (bottom-left) — picks a "nice" round distance that fits.
        this._drawScaleBar(ctx, w, h, scale);

        // Legend (bottom-right)
        this._drawLegend(ctx, w, h);
    }

    _drawScaleBar(ctx, w, h, scale) {
        const niceSteps = [1000, 2000, 5000, 10000, 20000]; // metres
        const maxBarPx = w * 0.18;
        let chosen = niceSteps[0];
        for (const step of niceSteps) {
            if (step * scale <= maxBarPx) chosen = step;
        }
        const barPx = chosen * scale;
        const x0 = 18, y0 = h - 22;
        ctx.strokeStyle = '#e7edf3';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0); ctx.lineTo(x0 + barPx, y0);
        ctx.moveTo(x0, y0 - 5); ctx.lineTo(x0, y0 + 5);
        ctx.moveTo(x0 + barPx, y0 - 5); ctx.lineTo(x0 + barPx, y0 + 5);
        ctx.stroke();
        ctx.fillStyle = '#e7edf3';
        ctx.font = '11px "Share Tech Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        const label = chosen >= 1000 ? `${chosen / 1000} km` : `${chosen} m`;
        ctx.fillText(label, x0, y0 - 8);
    }

    _drawLegend(ctx, w, h) {
        const items = [
            { color: '#ffb648', label: 'Airport / runway' },
            { color: '#3fd0ff', label: 'Your aircraft' },
            { color: 'rgb(40,92,112)', label: 'Water' },
            { color: 'rgb(176,176,176)', label: 'High terrain' }
        ];
        const boxW = 150, rowH = 16, pad = 8;
        const x0 = w - boxW - 14, y0 = h - (items.length * rowH) - pad * 2 - 14;
        ctx.fillStyle = 'rgba(10,15,22,0.55)';
        ctx.fillRect(x0, y0, boxW, items.length * rowH + pad * 2);
        ctx.font = '11px "Share Tech Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        items.forEach((item, i) => {
            const rowY = y0 + pad + i * rowH + rowH / 2;
            ctx.fillStyle = item.color;
            ctx.fillRect(x0 + pad, rowY - 5, 10, 10);
            ctx.fillStyle = '#e7edf3';
            ctx.fillText(item.label, x0 + pad + 16, rowY);
        });
    }
}
