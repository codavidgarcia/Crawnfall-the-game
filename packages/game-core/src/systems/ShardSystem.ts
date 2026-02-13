/**
 * ShardSystem — Spawns, tracks, and handles collection of essence shards.
 * Shards are the sole growth mechanic: walk through them → gain a warrior.
 */

import type { ISystem, EntityId } from '../ecs/types.js';
import type { World } from '../ecs/World.js';
import { CK, type TransformC, type EssenceShardC, type RenderRefC, type TeamC, type BannerLeaderC, type WarbandMemberC, type MovableC, type HealthC, type UnitC, type CohesionC, type CombatantC } from '../components/index.js';
import { GameEventType } from '../events/GameEvents.js';
import { SHARD_COUNT_INITIAL, SHARD_RESPAWN_TICKS, SHARD_PICKUP_RANGE, SHARD_MAGNET_RANGE, SHARD_MAGNET_SPEED, SHARD_SPAWN_MARGIN, MAP_SIZE, UNIT_DEFS, MAX_ARMY_SIZE } from '../data/GameConfig.js';
import { type ComponentStore } from '../ecs/types.js';
import { type Vec2 } from '../utils/MathUtils.js';

export class ShardSystem implements ISystem {
    readonly name = 'ShardSystem';
    private world!: World;
    private pendingRespawns: { pos: Vec2; timer: number }[] = [];

    constructor(private getTerrainHeight: (x: number, z: number) => number) { }

    init(): void { }

    attach(world: World): void {
        this.world = world;
    }

    /** Spawn initial batch of shards across the map */
    spawnInitialShards(): void {
        const w = this.world;
        for (let i = 0; i < SHARD_COUNT_INITIAL; i++) {
            const pos = this.randomPosition();
            this.createShard(pos);
        }
    }

    private randomPosition(): Vec2 {
        const half = MAP_SIZE / 2 - SHARD_SPAWN_MARGIN;
        return {
            x: (this.world.rng.next() * 2 - 1) * half,
            y: (this.world.rng.next() * 2 - 1) * half,
        };
    }

    private createShard(pos: Vec2): EntityId {
        const w = this.world;
        const eid = w.createEntity();

        w.getStore<TransformC>(CK.Transform).set(eid, {
            position: { x: pos.x, y: pos.y },
            rotation: 0,
            elevation: 0.5, // float slightly above terrain
        });

        w.getStore<EssenceShardC>(CK.EssenceShard).set(eid, {
            amount: 1,
            glowPhase: this.world.rng.next() * Math.PI * 2,
            fountainId: 0,
        });

        w.getStore<RenderRefC>(CK.RenderRef).set(eid, {
            meshId: `shard_${eid}`,
            dirty: true,
            visible: true,
            scale: 0.8,  // larger for visibility
        });

        return eid;
    }

    update(dt: number): void {
        if (!this.world) return;
        const w = this.world;

        const transforms = w.getStore<TransformC>(CK.Transform);
        const shards = w.getStore<EssenceShardC>(CK.EssenceShard);
        const leaders = w.getStore<BannerLeaderC>(CK.BannerLeader);
        const teams = w.getStore<TeamC>(CK.Team);

        // ── Magnet effect: pull nearby shards toward leaders ─────────────
        for (const [leaderId, leader] of leaders.entries()) {
            const lt = transforms.get(leaderId);
            if (!lt) continue;

            for (const [shardId, shard] of shards.entries()) {
                const st = transforms.get(shardId);
                if (!st) continue;

                const dx = lt.position.x - st.position.x;
                const dy = lt.position.y - st.position.y;
                const distSq = dx * dx + dy * dy;
                const dist = Math.sqrt(distSq);

                // Collection check (after magnet pull, so pulled shards get collected)
                if (dist < SHARD_PICKUP_RANGE) {
                    // Collect the shard — but only if army is below cap
                    const team = teams.get(leaderId);
                    if (team) {
                        const armySize = this.getArmySize(leaderId);
                        if (armySize < MAX_ARMY_SIZE) {
                            this.spawnWarrior(leaderId, team.teamId, lt.position);
                        }
                    }

                    this.pendingRespawns.push({
                        pos: this.randomPosition(),
                        timer: SHARD_RESPAWN_TICKS,
                    });

                    w.destroyEntity(shardId);

                    w.events.emit(GameEventType.ShardCollected, {
                        shardId,
                        collectorId: leaderId,
                        amount: shard.amount,
                    });
                    continue;
                }

                // Magnet pull — shard drifts toward leader
                if (dist < SHARD_MAGNET_RANGE && dist > 0.1) {
                    const pullStrength = (1 - dist / SHARD_MAGNET_RANGE) * SHARD_MAGNET_SPEED;
                    st.position.x += (dx / dist) * pullStrength * dt;
                    st.position.y += (dy / dist) * pullStrength * dt;
                }
            }
        }

        // Handle respawns
        for (let i = this.pendingRespawns.length - 1; i >= 0; i--) {
            this.pendingRespawns[i].timer--;
            if (this.pendingRespawns[i].timer <= 0) {
                this.createShard(this.pendingRespawns[i].pos);
                this.pendingRespawns.splice(i, 1);
            }
        }

        // Animate shard glow phase
        for (const [eid, shard] of shards.entries()) {
            shard.glowPhase += dt * 2;
        }
    }

    /** Spawn a warrior near the leader and assign to warband */
    private spawnWarrior(leaderId: EntityId, teamId: number, nearPos: Vec2): void {
        const w = this.world;
        const eid = w.createEntity();
        const def = UNIT_DEFS.militia;

        // Count current warband members to determine formation index
        const members = w.getStore<WarbandMemberC>(CK.WarbandMember);
        let count = 0;
        for (const [, m] of members.entries()) {
            if (m.leaderId === leaderId) count++;
        }

        // Spawn offset behind leader
        const angle = this.world.rng.next() * Math.PI * 2;
        const dist = 2 + this.world.rng.next() * 3;

        w.getStore<TransformC>(CK.Transform).set(eid, {
            position: {
                x: nearPos.x + Math.cos(angle) * dist,
                y: nearPos.y + Math.sin(angle) * dist,
            },
            rotation: 0,
            elevation: 0,
        });

        w.getStore<TeamC>(CK.Team).set(eid, { teamId });

        w.getStore<UnitC>(CK.Unit).set(eid, {
            unitType: 'militia',
            speed: def.speed,
            attackDamage: def.attackDamage,
            attackRange: def.attackRange,
            attackCooldown: def.attackCooldown,
            lastAttackTick: 0,
        });

        w.getStore<HealthC>(CK.Health).set(eid, {
            current: def.hp,
            max: def.hp,
        });

        w.getStore<WarbandMemberC>(CK.WarbandMember).set(eid, {
            leaderId,
            indexInFormation: count,
            teamId,
        });

        w.getStore<MovableC>(CK.Movable).set(eid, {
            targetPosition: null,
            moveSpeed: def.speed,
            arrived: true,
        });

        w.getStore<CombatantC>(CK.Combatant).set(eid, {
            inCombat: false,
            targetId: 0,
            engagementRange: def.attackRange + 1,
        });

        w.getStore<CohesionC>(CK.Cohesion).set(eid, {
            current: def.cohesion,
            max: def.cohesion,
            regenRate: 0.5,
            broken: false,
            scatterTimer: 0,
        });

        w.getStore<RenderRefC>(CK.RenderRef).set(eid, {
            meshId: `unit_${eid}`,
            dirty: true,
            visible: true,
            scale: 1.0,
        });

        w.events.emit(GameEventType.WarriorJoined, {
            unitId: eid,
            leaderId,
            teamId,
            newArmySize: count + 1,
        });
    }

    /** Create shards from a dead unit's remains — spawn AWAY from combat */
    spawnDeathShards(position: Vec2, count: number): void {
        for (let i = 0; i < count; i++) {
            // Spawn 5-8 units away from death position to prevent instant collection
            const angle = this.world.rng.next() * Math.PI * 2;
            const dist = 5 + this.world.rng.next() * 3;
            const offset: Vec2 = {
                x: position.x + Math.cos(angle) * dist,
                y: position.y + Math.sin(angle) * dist,
            };
            // Clamp to map bounds
            const half = MAP_SIZE / 2 - 2;
            offset.x = Math.max(-half, Math.min(half, offset.x));
            offset.y = Math.max(-half, Math.min(half, offset.y));
            this.createShard(offset);
        }
    }

    /** Count warriors belonging to a specific leader */
    private getArmySize(leaderId: EntityId): number {
        const members = this.world.getStore<WarbandMemberC>(CK.WarbandMember);
        let count = 0;
        for (const [, m] of members.entries()) {
            if (m.leaderId === leaderId) count++;
        }
        return count;
    }

    dispose(): void {
        this.pendingRespawns.length = 0;
    }
}
