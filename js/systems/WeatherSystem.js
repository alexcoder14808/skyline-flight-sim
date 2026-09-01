// Weather is intentionally data-driven (per the spec's "future expansion"
// goal) so adding rain/storms/snow later is a matter of adding presets here
// and a matching visual in World.js, without touching FlightSetup or main.js.

export const WEATHER_PRESETS = {
    clear: { label: 'Clear', clouds: false },
    cloudy: { label: 'Cloudy', clouds: true }
};

export const WIND_PRESETS = {
    calm: { label: 'Calm' },
    light: { label: 'Light' },
    moderate: { label: 'Moderate' }
};

export class WeatherSystem {
    constructor(world) {
        this.world = world;
        this.current = 'clear';
        this.wind = 'calm';
    }

    setWeather(key) {
        if (!WEATHER_PRESETS[key]) return;
        this.current = key;
        this.world.setWeather(key);
    }

    setWind(key) {
        if (!WIND_PRESETS[key]) return;
        this.wind = key;
        this.world.setWind(key);
    }
}
