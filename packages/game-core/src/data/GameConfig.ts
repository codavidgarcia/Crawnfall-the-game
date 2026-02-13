/**
 * Static game balance data for Crawnfall: War Serpent Arena.
 * All values are tunable constants — no magic numbers scattered in systems.
 */

import type { FormationType } from '../events/GameEvents.js';

// ─── Simulation ─────────────────────────────────────────────────────────────

export const SIM_TICK_RATE = 20;
export const SIM_DT = 1 / SIM_TICK_RATE;

// ─── Map ────────────────────────────────────────────────────────────────────

export const MAP_SIZE = 200;
export const TERRAIN_SEGMENTS = 128;
export const TERRAIN_HEIGHT_SCALE = 8;

// ─── Formation spacing ──────────────────────────────────────────────────────

export interface FormationConfig {
    spacing: number;
    type: FormationType;
}

export const FORMATIONS: Record<FormationType, FormationConfig> = {
    column: { spacing: 1.8, type: 'column' },
    line: { spacing: 2.2, type: 'line' },
    wedge: { spacing: 2.5, type: 'wedge' },
};

// ─── Unit definitions ───────────────────────────────────────────────────────

export interface UnitDef {
    unitType: string;
    hp: number;
    speed: number;
    attackDamage: number;
    attackRange: number;
    attackCooldown: number;
    cohesion: number;
}

export const UNIT_DEFS: Record<string, UnitDef> = {
    militia: {
        unitType: 'militia',
        hp: 40,
        speed: 5.0,
        attackDamage: 6,
        attackRange: 1.8,
        attackCooldown: 12,          // was 20 — faster attacks feel more dynamic
        cohesion: 50,
    },
    archer: {
        unitType: 'archer',
        hp: 28,
        speed: 5.5,
        attackDamage: 10,
        attackRange: 14,
        attackCooldown: 22,
        cohesion: 35,
    },
    knight: {
        unitType: 'knight',
        hp: 100,
        speed: 4.0,
        attackDamage: 18,
        attackRange: 2.2,
        attackCooldown: 18,
        cohesion: 80,
    },
};

// ─── Essence Shards ─────────────────────────────────────────────────────────

export const SHARD_COUNT_INITIAL = 200;       // shards at game start
export const SHARD_RESPAWN_TICKS = 140;       // ~7 seconds — faster respawn keeps tension up
export const SHARD_PICKUP_RANGE = 3.5;        // world units (was 2.5)
export const SHARD_MAGNET_RANGE = 8.0;        // shards get pulled toward leader within this range
export const SHARD_MAGNET_SPEED = 3.0;        // pull speed in units/sec
export const MAX_ARMY_SIZE = 60;              // hard cap to prevent runaway growth
export const SHARD_SPAWN_MARGIN = 15;         // min distance from map edges
export const SHARD_CENTER_EXCLUSION = 0;      // no exclusion zone

// ─── Shard Fountains ────────────────────────────────────────────────────────

export const FOUNTAIN_SPAWN_RATE = 40;        // ticks between spawns (~2s)
export const FOUNTAIN_RADIUS = 8;             // spawn radius
export const FOUNTAIN_MAX_SHARDS = 6;         // max active shards per fountain

// ─── Crowns ─────────────────────────────────────────────────────────────────

export const CROWN_PICKUP_RANGE = 3.0;
export const CROWN_GLOW_PER_CROWN = 0.25;    // glow intensity added per crown
export const CROWN_DROP_SHARDS = 5;           // extra shards on leader death

// ─── Army ───────────────────────────────────────────────────────────────────

export const STARTING_ARMY_SIZE = 8;          // warriors around leader at start (was 5)
export const ARMY_SPEED_PENALTY_PER_10 = 0.02; // 2% slower per 10 warriors (less punishing)
export const ARMY_MAX_SPEED_PENALTY = 0.30;   // cap at 30% reduction
export const SWARM_SEPARATION_RADIUS = 1.4;   // min distance between warriors
export const SWARM_COHESION_RADIUS = 14;      // max distance before catch-up
export const SWARM_JITTER = 0.4;              // random movement amplitude (more organic feel)

// ─── Charge Mechanic ────────────────────────────────────────────────────────

export const CHARGE_SPEED_MULT = 1.8;         // speed multiplier when charging toward enemy
export const CHARGE_DAMAGE_MULT = 2.0;        // first-hit damage multiplier on charge
export const CHARGE_RANGE = 8.0;              // distance at which charge engages
export const CHARGE_COOLDOWN = 100;           // ticks between charges (~5 sec)

// ─── Combat ─────────────────────────────────────────────────────────────────

export const COHESION_FLANK_PENALTY = 20;
export const COHESION_REGEN_RATE = 0.8;       // faster regen so morale breaks are temporary
export const MORALE_OUTNUMBER_PENALTY = 0.3;  // morale drain per tick when outnumbered
export const MORALE_LEADER_HIT_PENALTY = 5;   // morale drain when own leader takes damage
export const SCATTER_DURATION = 50;           // ticks (~2.5 seconds, was 3)
export const DEATH_SHARD_DROP = 1;            // shards dropped per dead warrior — must be <=1 to prevent exponential growth
export const LEADER_HP = 200;
export const LEADER_REGEN_RATE = 0.2;         // HP per tick when not in combat

// ─── Map Shrink ─────────────────────────────────────────────────────────────

export const SHRINK_START_TIME = 180;         // seconds before shrink begins
export const SHRINK_RATE = 0.15;              // units per second of radius decrease
export const SHRINK_DAMAGE_PER_TICK = 2;      // damage to units outside the zone
export const SHRINK_MIN_RADIUS = 25;          // minimum playable radius

// ─── AI ─────────────────────────────────────────────────────────────────────

export const AI_DECISION_INTERVAL = 15;       // ticks (~0.75 sec) — snappier decisions
export const AI_AGGRESSION_THRESHOLD = 10;    // hunts sooner (was 15)
export const AI_RETREAT_THRESHOLD = 0.25;     // braver — retreats only when very outmatched
export const AI_PERSONALITY_VARIANCE = 0.3;   // ±30% random offset to thresholds per AI

// ─── Match ──────────────────────────────────────────────────────────────────

export const MATCH_DURATION = 300;            // seconds (5 min max)

// ─── Graphics quality presets ───────────────────────────────────────────────

export interface QualityPreset {
    name: string;
    shadowMapSize: number;
    shadowCascades: number;
    ssao: boolean;
    bloom: boolean;
    antialiasing: 'none' | 'fxaa' | 'taa';
    vegetationDensity: number;
    lodDistanceMultiplier: number;
    resolutionScale: number;
    maxLights: number;
}

export const QUALITY_PRESETS: Record<string, QualityPreset> = {
    low: {
        name: 'Low',
        shadowMapSize: 512,
        shadowCascades: 1,
        ssao: false,
        bloom: false,
        antialiasing: 'fxaa',
        vegetationDensity: 0.2,
        lodDistanceMultiplier: 0.5,
        resolutionScale: 0.75,
        maxLights: 2,
    },
    medium: {
        name: 'Medium',
        shadowMapSize: 1024,
        shadowCascades: 2,
        ssao: true,
        bloom: false,
        antialiasing: 'fxaa',
        vegetationDensity: 0.5,
        lodDistanceMultiplier: 1.0,
        resolutionScale: 1.0,
        maxLights: 4,
    },
    high: {
        name: 'High',
        shadowMapSize: 2048,
        shadowCascades: 3,
        ssao: true,
        bloom: true,
        antialiasing: 'fxaa',
        vegetationDensity: 0.8,
        lodDistanceMultiplier: 1.5,
        resolutionScale: 1.0,
        maxLights: 8,
    },
    ultra: {
        name: 'Ultra',
        shadowMapSize: 4096,
        shadowCascades: 4,
        ssao: true,
        bloom: true,
        antialiasing: 'fxaa',
        vegetationDensity: 1.0,
        lodDistanceMultiplier: 2.0,
        resolutionScale: 1.0,
        maxLights: 16,
    },
};

export const MOBILE_QUALITY_PRESETS: Record<string, QualityPreset> = {
    low: { ...QUALITY_PRESETS.low, resolutionScale: 0.5 },
    balanced: { ...QUALITY_PRESETS.medium, shadowMapSize: 512, resolutionScale: 0.75 },
    high: { ...QUALITY_PRESETS.high, shadowMapSize: 1024, resolutionScale: 0.85 },
};
