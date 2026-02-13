/**
 * CrownSystem — the core "kill the king" mechanic.
 * When a leader dies, their crown drops. Pick it up to absorb their army.
 */

import type { ISystem, EntityId } from '../ecs/types.js';
import type { World } from '../ecs/World.js';
import { CK, type TransformC, type CrownC, type CrownBearerC, type BannerLeaderC, type WarbandMemberC, type TeamC, type RenderRefC, type HealthC } from '../components/index.js';
import { GameEventType } from '../events/GameEvents.js';
import { CROWN_PICKUP_RANGE, CROWN_GLOW_PER_CROWN, CROWN_DROP_SHARDS } from '../data/GameConfig.js';
import type { ShardSystem } from './ShardSystem.js';

export class CrownSystem implements ISystem {
    readonly name = 'CrownSystem';
    private world!: World;
    private shardSystem!: ShardSystem;

    attach(world: World, shardSystem: ShardSystem): void {
        this.world = world;
        this.shardSystem = shardSystem;
    }

    init(): void { }

    update(dt: number): void {
        if (!this.world) return;
        const w = this.world;

        const transforms = w.getStore<TransformC>(CK.Transform);
        const crowns = w.getStore<CrownC>(CK.Crown);
        const leaders = w.getStore<BannerLeaderC>(CK.BannerLeader);
        const bearers = w.getStore<CrownBearerC>(CK.CrownBearer);
        const teams = w.getStore<TeamC>(CK.Team);

        // Check for dropped crowns that can be picked up
        for (const [crownId, crown] of crowns.entries()) {
            if (!crown.dropped) continue;

            crown.dropTimer++;
            const ct = transforms.get(crownId);
            if (!ct) continue;

            // Check if any leader is close enough to pick up
            for (const [leaderId, leader] of leaders.entries()) {
                const lt = transforms.get(leaderId);
                if (!lt) continue;

                const leaderTeam = teams.get(leaderId);
                if (!leaderTeam || leaderTeam.teamId === crown.originalTeamId) continue;

                const dx = lt.position.x - ct.position.x;
                const dy = lt.position.y - ct.position.y;
                const distSq = dx * dx + dy * dy;

                if (distSq < CROWN_PICKUP_RANGE * CROWN_PICKUP_RANGE) {
                    this.pickUpCrown(leaderId, crownId, crown, leaderTeam.teamId);
                    break;
                }
            }
        }
    }

    /** Called when a leader is killed — drops their crown and creates shard burst */
    handleLeaderDeath(leaderId: EntityId, killerTeamId: number): void {
        const w = this.world;
        const transforms = w.getStore<TransformC>(CK.Transform);
        const lt = transforms.get(leaderId);
        if (!lt) return;

        const team = w.getStore<TeamC>(CK.Team).get(leaderId);
        const teamId = team?.teamId ?? 0;

        // Create crown entity
        const crownId = w.createEntity();
        transforms.set(crownId, {
            position: { x: lt.position.x, y: lt.position.y },
            rotation: 0,
            elevation: 0.3,
        });

        w.getStore<CrownC>(CK.Crown).set(crownId, {
            originalTeamId: teamId,
            dropped: true,
            dropTimer: 0,
        });

        w.getStore<RenderRefC>(CK.RenderRef).set(crownId, {
            meshId: `crown_${crownId}`,
            dirty: true,
            visible: true,
            scale: 0.6,
        });

        // Spawn extra shards from the fallen leader
        this.shardSystem.spawnDeathShards(lt.position, CROWN_DROP_SHARDS);

        // Mark all warband members of dead team as leaderless
        const members = w.getStore<WarbandMemberC>(CK.WarbandMember);
        for (const [memberId, member] of members.entries()) {
            if (member.leaderId === leaderId) {
                member.leaderId = 0; // no leader = neutral
            }
        }

        w.events.emit(GameEventType.CrownDropped, {
            crownId,
            position: { ...lt.position },
            originalTeamId: teamId,
        });

        w.events.emit(GameEventType.LeaderKilled, {
            leaderId,
            teamId,
            killedByTeamId: killerTeamId,
        });

        // Remove leader from the world
        w.destroyEntity(leaderId);
    }

    /** Absorb a crown — gain all neutral warriors from that team */
    private pickUpCrown(leaderId: EntityId, crownId: EntityId, crown: CrownC, collectorTeamId: number): void {
        const w = this.world;
        const members = w.getStore<WarbandMemberC>(CK.WarbandMember);
        const teams = w.getStore<TeamC>(CK.Team);
        const bearers = w.getStore<CrownBearerC>(CK.CrownBearer);

        // Count current warband
        let currentCount = 0;
        for (const [, m] of members.entries()) {
            if (m.leaderId === leaderId) currentCount++;
        }

        // Absorb neutral (leaderless) warriors from the original team
        let absorbed = 0;
        for (const [memberId, member] of members.entries()) {
            if (member.leaderId === 0 && member.teamId === crown.originalTeamId) {
                member.leaderId = leaderId;
                member.teamId = collectorTeamId;
                member.indexInFormation = currentCount + absorbed;
                teams.get(memberId)!.teamId = collectorTeamId;
                absorbed++;
            }
        }

        // Update crown bearer
        const bearer = bearers.get(leaderId) ?? { crownsCollected: 0, glowIntensity: 0 };
        bearer.crownsCollected++;
        bearer.glowIntensity = Math.min(1.0, bearer.crownsCollected * CROWN_GLOW_PER_CROWN);
        bearers.set(leaderId, bearer);

        // Destroy the crown entity
        w.destroyEntity(crownId);

        w.events.emit(GameEventType.CrownPickedUp, {
            crownId,
            collectorId: leaderId,
            totalCrowns: bearer.crownsCollected,
        });

        w.events.emit(GameEventType.ArmyAbsorbed, {
            absorberId: leaderId,
            absorbedTeamId: crown.originalTeamId,
            warriorsGained: absorbed,
        });

        // Check win condition — any other leaders alive?
        let otherLeadersAlive = false;
        for (const [lid] of w.getStore<BannerLeaderC>(CK.BannerLeader).entries()) {
            if (lid !== leaderId) {
                otherLeadersAlive = true;
                break;
            }
        }

        if (!otherLeadersAlive) {
            w.events.emit(GameEventType.MatchEnded, {
                winnerId: collectorTeamId,
                reason: 'crown_victory',
                winnerArmySize: currentCount + absorbed,
            });
        }
    }

    dispose(): void { }
}
