export const TIME_PRESETS = {
    day: { label: 'Day' },
    sunset: { label: 'Sunset' },
    night: { label: 'Night' }
};

export class TimeSystem {
    constructor(world) {
        this.world = world;
        this.current = 'day';
    }

    setTime(key) {
        if (!TIME_PRESETS[key]) return;
        this.current = key;
        this.world.setTimeOfDay(key);
    }

    isNight() {
        return this.world.environment.isNight();
    }
}
