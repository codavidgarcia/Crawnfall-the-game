/**
 * All game event type constants and payload interfaces.
 * Crawnfall: War Serpent Arena
 */

import type { Vec2 } from '../utils/MathUtils.js';

// ─── Event type constants ───────────────────────────────────────────────────

export const GameEventType = {
    // Shards
    ShardCollected: 'shard:collected',
    ShardSpawned: 'shard:spawned',

    // Crowns
    CrownDropped: 'crown:dropped',
    CrownPickedUp: 'crown:picked_up',

    // Units
    WarriorJoined: 'warrior:joined',
    UnitDied: 'unit:died',
    DamageDealt: 'combat:damage',

    // Warband
    FormationChanged: 'warband:formation_changed',
    StanceChanged: 'warband:stance_changed',
    WarbandCommandIssued: 'warband:command',

    // Morale
    MoraleBroken: 'morale:broken',
    MoraleRecovered: 'morale:recovered',

    // Leader
    LeaderKilled: 'leader:killed',
    ArmyAbsorbed: 'army:absorbed',

    // Selection / UI
    EntitySelected: 'ui:entity_selected',
    EntityDeselected: 'ui:entity_deselected',

    // Match
    MatchStarted: 'match:started',
    MatchEnded: 'match:ended',

    // Time
    TimeScaleChanged: 'time:scale_changed',

    // Settings
    SettingsChanged: 'settings:changed',
} as const;

export type GameEventTypeKey = (typeof GameEventType)[keyof typeof GameEventType];

// ─── Payload interfaces ─────────────────────────────────────────────────────

export type ResourceType = 'wood' | 'food' | 'stone'; // legacy compat
export type FormationType = 'column' | 'line' | 'wedge';
export type StanceType = 'aggressive' | 'defensive';

export interface ShardCollectedEvent {
    shardId: number;
    collectorId: number;
    amount: number;
}

export interface CrownDroppedEvent {
    crownId: number;
    position: Vec2;
    originalTeamId: number;
}

export interface CrownPickedUpEvent {
    crownId: number;
    collectorId: number;
    totalCrowns: number;
}

export interface WarriorJoinedEvent {
    unitId: number;
    leaderId: number;
    teamId: number;
    newArmySize: number;
}

export interface UnitDiedEvent {
    unitId: number;
}

export interface DamageDealtEvent {
    attackerId: number;
    victimId: number;
    amount: number;
}

export interface FormationChangedEvent {
    teamId: number;
    formationType: FormationType;
}

export interface StanceChangedEvent {
    teamId: number;
    stance: StanceType;
}

export interface WarbandCommandEvent {
    teamId: number;
    commandType: 'move' | 'attack' | 'rally';
    target: Vec2 | number;
}

export interface LeaderKilledEvent {
    leaderId: number;
    teamId: number;
    killedByTeamId: number;
}

export interface ArmyAbsorbedEvent {
    absorberId: number;
    absorbedTeamId: number;
    warriorsGained: number;
}

export interface MoraleBrokenEvent {
    teamId: number;
    leaderId: number;
}

export interface MatchEndedEvent {
    winnerId: number;
    reason: 'crown_victory' | 'annihilation' | 'timeout';
    winnerArmySize: number;
}

export interface EntitySelectedEvent {
    entityId: number;
}
