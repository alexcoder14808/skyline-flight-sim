// A classic "ball" attitude indicator: a sky/ground disc that rotates with
// roll and translates with pitch, viewed through a fixed circular window with
// a fixed aircraft reference symbol drawn on top. All driven directly by the
// aircraft's actual orientation — never faked/randomized.

export class ArtificialHorizon {
    constructor(container) {
        this.el = document.createElement('div');
        this.el.className = 'ahrs';
        this.el.innerHTML = `
            <div class="ahrs-window">
                <div class="ahrs-ball">
                    <div class="ahrs-sky"></div>
                    <div class="ahrs-ground"></div>
                    <div class="ahrs-pitch-lines"></div>
                </div>
                <div class="ahrs-fixed-ref"></div>
                <div class="ahrs-ring"></div>
            </div>
        `;
        container.appendChild(this.el);
        this.ball = this.el.querySelector('.ahrs-ball');

        const pitchLines = this.el.querySelector('.ahrs-pitch-lines');
        for (let deg = -60; deg <= 60; deg += 10) {
            if (deg === 0) continue;
            const line = document.createElement('div');
            line.className = 'ahrs-line' + (deg % 20 === 0 ? ' major' : '');
            line.style.top = `calc(50% - ${deg * 2.6}px)`;
            line.textContent = deg % 20 === 0 ? Math.abs(deg) : '';
            pitchLines.appendChild(line);
        }
    }

    update(pitchDeg, rollDeg) {
        const clampedPitch = Math.max(-90, Math.min(90, pitchDeg));
        this.ball.style.transform = `translate(-50%, calc(-50% + ${clampedPitch * 2.6}px)) rotate(${-rollDeg}deg)`;
    }
}
