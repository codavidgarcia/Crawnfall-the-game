/** 2D vector for sim-layer math (no Three.js dependency). */
export interface Vec2 {
    x: number;
    y: number;
}

export function vec2(x: number, y: number): Vec2 {
    return { x, y };
}

export function v2Add(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x + b.x, y: a.y + b.y };
}

export function v2Sub(a: Vec2, b: Vec2): Vec2 {
    return { x: a.x - b.x, y: a.y - b.y };
}

export function v2Scale(v: Vec2, s: number): Vec2 {
    return { x: v.x * s, y: v.y * s };
}

export function v2Len(v: Vec2): number {
    return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function v2LenSq(v: Vec2): number {
    return v.x * v.x + v.y * v.y;
}

export function v2Normalize(v: Vec2): Vec2 {
    const l = v2Len(v);
    if (l < 1e-8) return { x: 0, y: 0 };
    return { x: v.x / l, y: v.y / l };
}

export function v2Dist(a: Vec2, b: Vec2): number {
    return v2Len(v2Sub(a, b));
}

export function v2DistSq(a: Vec2, b: Vec2): number {
    return v2LenSq(v2Sub(a, b));
}

export function v2Dot(a: Vec2, b: Vec2): number {
    return a.x * b.x + a.y * b.y;
}

export function v2Lerp(a: Vec2, b: Vec2, t: number): Vec2 {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function v2Rotate(v: Vec2, angle: number): Vec2 {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export function v2Angle(v: Vec2): number {
    return Math.atan2(v.y, v.x);
}

export function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export function smoothStep(edge0: number, edge1: number, x: number): number {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

/** Simple 2D Perlin-like value noise from integer coords. Deterministic. */
export function hashNoise2D(ix: number, iy: number): number {
    let n = ix * 73856093 + iy * 19349663;
    n = (n << 13) ^ n;
    return 1.0 - ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 1073741824.0;
}

/** Smooth value noise in [0,1] */
export function valueNoise2D(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const n00 = hashNoise2D(ix, iy);
    const n10 = hashNoise2D(ix + 1, iy);
    const n01 = hashNoise2D(ix, iy + 1);
    const n11 = hashNoise2D(ix + 1, iy + 1);

    const nx0 = n00 * (1 - sx) + n10 * sx;
    const nx1 = n01 * (1 - sx) + n11 * sx;

    return (nx0 * (1 - sy) + nx1 * sy) * 0.5 + 0.5;
}

/** Fractal Brownian Motion noise */
export function fbm2D(x: number, y: number, octaves: number = 4, lacunarity: number = 2, gain: number = 0.5): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
        value += valueNoise2D(x * frequency, y * frequency) * amplitude;
        maxAmplitude += amplitude;
        amplitude *= gain;
        frequency *= lacunarity;
    }

    return value / maxAmplitude;
}
