/**
 * Mulberry32 — fast, deterministic 32-bit PRNG.
 * Used throughout the simulation to guarantee replay-ability.
 */
export class SeededRandom {
    private state: number;
    public readonly seed: number;

    constructor(seed: number) {
        this.seed = seed;
        this.state = seed;
    }

    /** Returns a float in [0, 1) */
    next(): number {
        let t = (this.state += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** Integer in [min, max] inclusive */
    nextInt(min: number, max: number): number {
        return min + Math.floor(this.next() * (max - min + 1));
    }

    /** Float in [min, max) */
    nextFloat(min: number, max: number): number {
        return min + this.next() * (max - min);
    }

    /** Clone current state for save/load */
    getState(): number {
        return this.state;
    }

    setState(s: number): void {
        this.state = s;
    }
}
