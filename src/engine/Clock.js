/** @returns {{ elapsed: number, delta: number, time: number, tick: (now?: number) => { delta: number, elapsed: number } }} */
export const createClock = () => {
    let elapsed = 0;
    let delta = 0;
    let last = performance.now() / 1000;

    return {
        get elapsed() {
            return elapsed;
        },
        get delta() {
            return delta;
        },
        get time() {
            return elapsed;
        },
        tick(now = performance.now() / 1000) {
            delta = Math.max(0, Math.min(now - last, 0.1));
            last = now;
            elapsed += delta;
            return { delta, elapsed };
        },
    };
};
