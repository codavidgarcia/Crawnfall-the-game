/**
 * All ECS component data structures.
 * Components are plain data — NO methods, NO references to systems.
 *
 * Crawnfall: War Serpent Arena
 * - Army swarm follows leader via physics-based flocking
 * - Essence shards feed army growth
 * - Crowns are the kill-reward / power beacon mechanic
 */

import type { Vec2 } from '../utils/MathUtils.js';
import type { FormationType, StanceType } from '../events/GameEvents.js';

// ─── Store Keys ──────────────────────────────────────────────────────────────

export const CK = {
    Transform: 'transform',
    Velocity: 'velocity',
    Health: 'health',
    Team: 'team',
    Unit: 'unit',
    BannerLeader: 'banner_leader',
    WarbandMember: 'warband_member',
    Movable: 'movable',
    Combatant: 'combatant',
    Cohesion: 'cohesion',
    Selectable: 'selectable',
    Selected: 'selected',
    RenderRef: 'render_ref',
    AIController: 'ai_controller',
    // ── Crawnfall Arena ──
    EssenceShard: 'essence_shard',
    Crown: 'crown',
    CrownBearer: 'crown_bearer',
    ShardFountain: 'shard_fountain',
} as const;

// ─── Core Components ─────────────────────────────────────────────────────────

export interface TransformC {
    position: Vec2;
    rotation: number;   // radians, facing direction
    elevation: number;  // y-height offset from terrain
}

export interface VelocityC {
    linear: Vec2;
    turnSpeed: number;
}

export interface HealthC {
    current: number;
    max: number;
}

export interface TeamC {
    teamId: number;
}

export interface UnitC {
    unitType: 'militia' | 'archer' | 'knight' | 'carrier';
    speed: number;
    attackDamage: number;
    attackRange: number;
    attackCooldown: number; // ticks between attacks
    lastAttackTick: number;
}

export interface BannerLeaderC {
    teamId: number;
    formation: FormationType;
    stance: StanceType;
    rallyCarriers: boolean;
    /** Breadcrumb trail of recent positions for column formation */
    positionHistory: Vec2[];
    maxHistoryLength: number;
}

export interface WarbandMemberC {
    leaderId: number;
    indexInFormation: number;
    teamId: number;
}

export interface MovableC {
    targetPosition: Vec2 | null;
    moveSpeed: number;
    arrived: boolean;
}

export interface CombatantC {
    inCombat: boolean;
    targetId: number;
    engagementRange: number;
}

/** Cohesion doubles as MORALE in the arena mode */
export interface CohesionC {
    current: number;
    max: number;
    regenRate: number;
    broken: boolean;      // if true, unit is scattered
    scatterTimer: number;
    scatterDir?: Vec2;    // direction to scatter when broken
}

export interface SelectableC {
    radius: number;
}

export interface SelectedC {
    selected: boolean;
}

export interface RenderRefC {
    meshId: string;
    dirty: boolean;
    visible: boolean;
    scale: number;
}

// ─── AI ──────────────────────────────────────────────────────────────────────

export type AIState = 'idle' | 'farm' | 'hunt' | 'engage' | 'retreat' | 'flank';

export interface AIControllerC {
    state: AIState;
    targetEntityId: number;
    stateTimer: number;
    decisionCooldown: number;
    aggression: number; // 0..1 — likelihood of attacking vs farming
}

// ─── Essence Shards ──────────────────────────────────────────────────────────

export interface EssenceShardC {
    amount: number;       // warriors granted on pickup (usually 1)
    glowPhase: number;    // animation phase offset
    fountainId: number;   // source fountain entity (0 = ambient)
}

// ─── Crowns ──────────────────────────────────────────────────────────────────

export interface CrownC {
    originalTeamId: number;
    dropped: boolean;
    dropTimer: number;    // ticks since dropped
}

export interface CrownBearerC {
    crownsCollected: number;
    glowIntensity: number; // 0..1 driven by crown count
}

// ─── Shard Fountains ─────────────────────────────────────────────────────────

export interface ShardFountainC {
    spawnRate: number;    // ticks between shard spawns
    spawnTimer: number;
    radius: number;       // spawn radius around fountain
    maxShards: number;
    activeShards: number;
}

// ─── Legacy types (kept for type compatibility, not used in arena) ───────────

export type NodeType = 'lumber_camp' | 'farmstead' | 'stone_pit';
