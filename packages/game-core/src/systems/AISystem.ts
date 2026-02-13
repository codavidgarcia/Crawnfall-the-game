/**
 * AISystem — Multi-personality AI controller for enemy warbands.
 *
 * Each AI has a personality (aggression level) that affects behavior:
 *   - High aggression: hunts player immediately, rarely farms
 *   - Low aggression: farms shards, only fights when provoked or strong
 *
 * States:
 *   farm   → seek nearest shard cluster and grow
 *   hunt   → move toward the nearest enemy to attack
 *   engage → in combat, hold position
 *   retreat → run away when weakened, seek shards to heal
 *   flank  → circle around to attack from behind
 */

import type { ISystem, EntityId } from '../ecs/types.js';
import type { World } from '../ecs/World.js';
import { CK, type AIControllerC, type TransformC, type BannerLeaderC, type WarbandMemberC, type MovableC, type HealthC, type TeamC, type EssenceShardC } from '../components/index.js';
import { AI_DECISION_INTERVAL, AI_AGGRESSION_THRESHOLD, AI_RETREAT_THRESHOLD, AI_PERSONALITY_VARIANCE, MAP_SIZE } from '../data/GameConfig.js';
import { v2Dist, type Vec2 } from '../utils/MathUtils.js';

export class AISystem implements ISystem {
    readonly name = 'AISystem';
    private world!: World;

    init(): void { }

    attach(world: World): void {
        this.world = world;
    }

    update(dt: number): void {
        if (!this.world) return;
        const w = this.world;

        const aiControllers = w.getStore<AIControllerC>(CK.AIController);
        const transforms = w.getStore<TransformC>(CK.Transform);
        const leaders = w.getStore<BannerLeaderC>(CK.BannerLeader);
        const movables = w.getStore<MovableC>(CK.Movable);
        const members = w.getStore<WarbandMemberC>(CK.WarbandMember);
        const teams = w.getStore<TeamC>(CK.Team);
        const shards = w.getStore<EssenceShardC>(CK.EssenceShard);
        const health = w.getStore<HealthC>(CK.Health);

        for (const [leaderId, ai] of aiControllers.entries()) {
            const t = transforms.get(leaderId);
            const mov = movables.get(leaderId);
            const team = teams.get(leaderId);
            if (!t || !mov || !team) continue;

            ai.decisionCooldown--;
            ai.stateTimer++;

            if (ai.decisionCooldown > 0) continue;

            // Decision interval varies slightly per AI for desync
            const personalInterval = Math.max(8, Math.floor(AI_DECISION_INTERVAL * (1 + (ai.aggression - 0.5) * 0.3)));
            ai.decisionCooldown = personalInterval;

            const myArmy = this.countArmy(leaderId, members);

            // Find nearest enemy leader (not just player — could be another AI!)
            const { enemyId, enemyPos, enemyDist, enemyArmy } = this.findNearestEnemy(
                leaderId, team.teamId, leaders, transforms, teams, members
            );

            // Personality-adjusted thresholds
            const aggressionThreshold = Math.floor(AI_AGGRESSION_THRESHOLD * (1 - ai.aggression * AI_PERSONALITY_VARIANCE));
            const retreatThreshold = AI_RETREAT_THRESHOLD * (1 + (1 - ai.aggression) * AI_PERSONALITY_VARIANCE);

            // ── State machine ────────────────────────────────────────────
            switch (ai.state) {
                case 'idle':
                    ai.state = myArmy < aggressionThreshold ? 'farm' : 'hunt';
                    ai.stateTimer = 0;
                    break;

                case 'farm': {
                    // Move toward nearest cluster of shards
                    const shardTarget = this.findNearestShardCluster(t.position, transforms, shards);
                    if (shardTarget) {
                        mov.targetPosition = shardTarget;
                    } else {
                        mov.targetPosition = this.randomMapPoint(w);
                    }

                    // Transition: strong enough to hunt, or enemy is very close
                    if (myArmy >= aggressionThreshold || (enemyDist < 20 && myArmy > 3)) {
                        ai.state = 'hunt';
                        ai.stateTimer = 0;
                    }

                    // Aggressive AIs get bored of farming quickly
                    if (ai.aggression > 0.7 && ai.stateTimer > 40 && myArmy > 3) {
                        ai.state = 'hunt';
                        ai.stateTimer = 0;
                    }
                    break;
                }

                case 'hunt': {
                    if (!enemyPos) {
                        ai.state = 'farm';
                        break;
                    }

                    // Should we retreat?
                    if (enemyArmy > 0 && myArmy / enemyArmy < retreatThreshold && myArmy < 5) {
                        ai.state = 'retreat';
                        ai.stateTimer = 0;
                        break;
                    }

                    // Try flanking if we have a larger army and aren't too close
                    if (myArmy > enemyArmy * 1.2 && enemyDist > 12 && enemyDist < 40) {
                        ai.state = 'flank';
                        ai.stateTimer = 0;
                        break;
                    }

                    // Move toward enemy
                    mov.targetPosition = { x: enemyPos.x, y: enemyPos.y };

                    // Transition to engage when close
                    if (enemyDist < 8) {
                        ai.state = 'engage';
                        ai.stateTimer = 0;
                    }

                    // If hunting for too long without engaging, switch to farming
                    if (ai.stateTimer > 100 && enemyDist > 30) {
                        ai.state = 'farm';
                        ai.stateTimer = 0;
                    }
                    break;
                }

                case 'engage': {
                    if (!enemyPos) {
                        ai.state = 'farm';
                        break;
                    }

                    // Stay close to enemy
                    mov.targetPosition = { x: enemyPos.x, y: enemyPos.y };

                    // Retreat if losing badly
                    if (enemyArmy > 0 && myArmy / enemyArmy < retreatThreshold) {
                        ai.state = 'retreat';
                        ai.stateTimer = 0;
                        break;
                    }

                    // Return to hunt if enemy ran away
                    if (enemyDist > 15) {
                        ai.state = 'hunt';
                        ai.stateTimer = 0;
                    }

                    // Try split tactics — if prolonged engagement, attempt flank
                    if (ai.stateTimer > 50 && ai.aggression > 0.5 && myArmy > enemyArmy) {
                        ai.state = 'flank';
                        ai.stateTimer = 0;
                    }
                    break;
                }

                case 'retreat': {
                    // Run opposite direction from enemy
                    if (enemyPos) {
                        const dx = t.position.x - enemyPos.x;
                        const dy = t.position.y - enemyPos.y;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                        const retreatDist = 35;

                        // Retreat toward nearest shard cluster if possible
                        const shardTarget = this.findNearestShardCluster(t.position, transforms, shards);
                        if (shardTarget && v2Dist(t.position, shardTarget) < 30) {
                            // Retreat toward shards
                            mov.targetPosition = shardTarget;
                        } else {
                            mov.targetPosition = {
                                x: Math.max(-MAP_SIZE / 2 + 10, Math.min(MAP_SIZE / 2 - 10, t.position.x + (dx / dist) * retreatDist)),
                                y: Math.max(-MAP_SIZE / 2 + 10, Math.min(MAP_SIZE / 2 - 10, t.position.y + (dy / dist) * retreatDist)),
                            };
                        }
                    }

                    // After recovering, go back to farming
                    if (ai.stateTimer > 40) {
                        ai.state = 'farm';
                        ai.stateTimer = 0;
                    }

                    // If we grew strong during retreat, hunt immediately
                    if (myArmy >= aggressionThreshold) {
                        ai.state = 'hunt';
                        ai.stateTimer = 0;
                    }
                    break;
                }

                case 'flank': {
                    if (!enemyPos) {
                        ai.state = 'hunt';
                        break;
                    }

                    // Circle around the enemy to attack from behind
                    const dx = t.position.x - enemyPos.x;
                    const dy = t.position.y - enemyPos.y;
                    const angle = Math.atan2(dy, dx);

                    // Swing wide — direction based on which side we're already on
                    const flankSide = dx > 0 ? 1 : -1;
                    const flankAngle = angle + Math.PI * 0.55 * flankSide;
                    const flankDist = 12;
                    mov.targetPosition = {
                        x: enemyPos.x + Math.cos(flankAngle) * flankDist,
                        y: enemyPos.y + Math.sin(flankAngle) * flankDist,
                    };

                    // After circling, engage
                    if (ai.stateTimer > 30 || enemyDist < 6) {
                        ai.state = 'engage';
                        ai.stateTimer = 0;
                    }
                    break;
                }
            }
        }
    }

    private countArmy(leaderId: EntityId, members: any): number {
        let count = 0;
        for (const [, m] of members.entries()) {
            if (m.leaderId === leaderId) count++;
        }
        return count;
    }

    /** Find the nearest enemy leader (could be player OR another AI) */
    private findNearestEnemy(
        myId: EntityId,
        myTeamId: number,
        leaders: any,
        transforms: any,
        teams: any,
        members: any,
    ): { enemyId: EntityId | null; enemyPos: Vec2 | null; enemyDist: number; enemyArmy: number } {
        let nearestId: EntityId | null = null;
        let nearestPos: Vec2 | null = null;
        let nearestDist = Infinity;
        let nearestArmy = 0;

        const myT = transforms.get(myId);
        if (!myT) return { enemyId: null, enemyPos: null, enemyDist: Infinity, enemyArmy: 0 };

        for (const [lid] of leaders.entries()) {
            if (lid === myId) continue;
            const otherTeam = teams.get(lid);
            if (!otherTeam || otherTeam.teamId === myTeamId) continue;

            const et = transforms.get(lid);
            if (!et) continue;

            const dist = v2Dist(myT.position, et.position);
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestId = lid;
                nearestPos = et.position;
                nearestArmy = this.countArmy(lid, members);
            }
        }

        return { enemyId: nearestId, enemyPos: nearestPos, enemyDist: nearestDist, enemyArmy: nearestArmy };
    }

    private findNearestShardCluster(
        pos: Vec2,
        transforms: any,
        shards: any,
    ): Vec2 | null {
        let bestPos: Vec2 | null = null;
        let bestScore = -Infinity;

        const cellSize = 20;
        const cells = new Map<string, { count: number; x: number; y: number }>();

        for (const [sid] of shards.entries()) {
            const st = transforms.get(sid);
            if (!st) continue;

            const cx = Math.floor(st.position.x / cellSize);
            const cy = Math.floor(st.position.y / cellSize);
            const key = `${cx},${cy}`;

            const cell = cells.get(key) ?? { count: 0, x: 0, y: 0 };
            cell.count++;
            cell.x += st.position.x;
            cell.y += st.position.y;
            cells.set(key, cell);
        }

        for (const cell of cells.values()) {
            if (cell.count < 2) continue;

            const avgX = cell.x / cell.count;
            const avgY = cell.y / cell.count;
            const dist = v2Dist(pos, { x: avgX, y: avgY });

            const score = cell.count * 3 - dist * 0.5;
            if (score > bestScore) {
                bestScore = score;
                bestPos = { x: avgX, y: avgY };
            }
        }

        return bestPos;
    }

    private randomMapPoint(w: World): Vec2 {
        const half = MAP_SIZE / 2 - 15;
        return {
            x: (w.rng.next() * 2 - 1) * half,
            y: (w.rng.next() * 2 - 1) * half,
        };
    }

    dispose(): void { }
}
