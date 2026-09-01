// Thin wrapper around localStorage so the rest of the app never touches
// window.localStorage directly (makes it easy to swap/mock later, and
// keeps failures from throwing if storage is unavailable).

const NAMESPACE = 'skylineFlight.';

export const Storage = {
    get(key, fallback = null) {
        try {
            const raw = window.localStorage.getItem(NAMESPACE + key);
            if (raw === null) return fallback;
            return JSON.parse(raw);
        } catch (e) {
            console.warn('[Storage] read failed for', key, e);
            return fallback;
        }
    },

    set(key, value) {
        try {
            window.localStorage.setItem(NAMESPACE + key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.warn('[Storage] write failed for', key, e);
            return false;
        }
    },

    remove(key) {
        try {
            window.localStorage.removeItem(NAMESPACE + key);
        } catch (e) {
            /* ignore */
        }
    }
};
