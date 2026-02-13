/**
 * MovementSystem — Leader follows cursor, army swarms via flocking physics.
 *
 * Leader: moves toward targetPosition (set by InputManager from cursor pos)
 * Warriors have TWO movement modes:
 *   1. FORMATION: flock toward their formation slot behind the leader
 *   2. COMBAT: intercept their attack target, stop at attack range distance
 * This creates distinct "marching" vs "battle line" behaviors.
 */

import type { ISystem, EntityId } from '../ecs/types.js';
import type { World } from '../ecs/World.js';
import { CK, type TransformC, type BannerLeaderC, type WarbandMemberC, type MovableC, type UnitC, type CohesionC, type CombatantC } from '../components/index.js';
import { FORMATIONS, ARMY_SPEED_PENALTY_PER_10, ARMY_MAX_SPEED_PENALTY, SWARM_SEPARATION_RADIUS, SWARM_COHESION_RADIUS, SWARM_JITTER, MAP_SIZE } from '../data/GameConfig.js';
import { type Vec2, v2Add, v2Sub, v2Scale, v2Normalize, v2Len, v2Dist } from '../utils/MathUtils.js';

export class MovementSystem implements ISystem {
    readonly name = 'MovementSystem';
    private world!: World;
    private getTerrainHeight: (x: number, z: number) => number;

    constructor(getTerrainHeight: (x: number, z: number) => number) {
        this.getTerrainHeight = getTerrainHeight;
    }

    init(): void { }

    attach(world: World): void {
        this.world = world;
    }

    update(dt: number): void {
        if (!this.world) return;
        const w = this.world;

        const transforms = w.getStore<TransformC>(CK.Transform);
        const leaders = w.getStore<BannerLeaderC>(CK.BannerLeader);
        const members = w.getStore<WarbandMemberC>(CK.WarbandMember);
        const movables = w.getStore<MovableC>(CK.Movable);
        const units = w.getStore<UnitC>(CK.Unit);
        const cohesion = w.getStore<CohesionC>(CK.Cohesion);
        const combatants = w.getStore<CombatantC>(CK.Combatant);

        // ── Move Leaders toward cursor/target ────────────────────────────────
        for (const [leaderId, leader] of leaders.entries()) {
            const t = transforms.get(leaderId);
            const mov = movables.get(leaderId);
            if (!t || !mov || !mov.targetPosition) continue;

            const dx = mov.targetPosition.x - t.position.x;
            const dy = mov.targetPosition.y - t.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0.5) {
                const armySize = this.getArmySize(leaderId, members);
                const armyPenalty = Math.min(ARMY_MAX_SPEED_PENALTY, (armySize / 10) * ARMY_SPEED_PENALTY_PER_10);
                const speed = mov.moveSpeed * (1 - armyPenalty);

                const step = Math.min(speed * dt, dist);
                t.position.x += (dx / dist) * step;
                t.position.y += (dy / dist) * step;
                t.rotation = Math.atan2(dy, dx);
            }

            const half = MAP_SIZE / 2 - 2;
            t.position.x = Math.max(-half, Math.min(half, t.position.x));
            t.position.y = Math.max(-half, Math.min(half, t.position.y));

            if (leader.positionHistory.length === 0 ||
                v2Dist(leader.positionHistory[leader.positionHistory.length - 1], t.position) > 1.0) {
                leader.positionHistory.push({ x: t.position.x, y: t.position.y });
                if (leader.positionHistory.length > leader.maxHistoryLength) {
                    leader.positionHistory.shift();
                }
            }

            mov.arrived = false;
        }

        // ── Move Warband Members ─────────────────────────────────────────────
        const warriorPositions: { id: EntityId; pos: Vec2; leaderId: number }[] = [];
        for (const [id, member] of members.entries()) {
            const t = transforms.get(id);
            if (!t || member.leaderId === 0) continue;
            warriorPositions.push({ id, pos: t.position, leaderId: member.leaderId });
        }

        for (const [id, member] of members.entries()) {
            if (member.leaderId === 0) continue;

            const t = transforms.get(id);
            const unit = units.get(id);
            const coh = cohesion.get(id);
            if (!t || !unit) continue;

            // Scattered units flee
            if (coh?.broken) {
                if (coh.scatterDir) {
                    t.position.x += coh.scatterDir.x * unit.speed * dt * 0.8;
                    t.position.y += coh.scatterDir.y * unit.speed * dt * 0.8;
                }
                continue;
            }

            const leaderT = transforms.get(member.leaderId);
            if (!leaderT) continue;
            const leaderComp = leaders.get(member.leaderId);
            if (!leaderComp) continue;

            // ── Check if this warrior is in combat ───────────────────────
            const combat = combatants.get(id);
            const hasCombatTarget = !!(combat?.inCombat && combat.targetId > 0);
            const combatTargetT = hasCombatTarget ? transforms.get(combat!.targetId) : null;

            let steer: Vec2 = { x: 0, y: 0 };

            if (combatTargetT && hasCombatTarget) {
                // ═══ COMBAT MODE ═════════════════════════════════════════
                // Move toward target but STOP at attack range distance.
                // This creates a visible battle line.
                const toDx = combatTargetT.position.x - t.position.x;
                const toDy = combatTargetT.position.y - t.position.y;
                const toDist = Math.sqrt(toDx * toDx + toDy * toDy);

                if (toDist > unit.attackRange * 0.95 && toDist > 0.1) {
                    // Close in — move toward target
                    const chaseSpeed = unit.speed * 1.3;
                    steer = {
                        x: (toDx / toDist) * chaseSpeed,
                        y: (toDy / toDist) * chaseSpeed,
                    };
                } else if (toDist < unit.attackRange * 0.5 && toDist > 0.1) {
                    // Too close — back off slightly
                    steer = {
                        x: -(toDx / toDist) * unit.speed * 0.4,
                        y: -(toDy / toDist) * unit.speed * 0.4,
                    };
                }
                // Else: at ideal range, hold position

                // Face the target
                if (toDist > 0.1) {
                    t.rotation = Math.atan2(toDy, toDx);
                }
            } else {
                // ═══ FORMATION MODE ══════════════════════════════════════
                const formationTarget = this.getFormationTarget(
                    leaderT.position,
                    leaderComp.positionHistory,
                    leaderComp.formation,
                    member.indexInFormation,
                    leaderT.rotation,
                );

                const toTarget = v2Sub(formationTarget, t.position);
                const dist = v2Len(toTarget);

                if (dist > 0.3) {
                    const norm = v2Normalize(toTarget);
                    const urgency = Math.min(dist / 4, 2.5);
                    steer = v2Scale(norm, unit.speed * urgency);
                }
            }

            // ── Separation from nearby allies ────────────────────────────
            let sepX = 0, sepY = 0;
            for (const other of warriorPositions) {
                if (other.id === id) continue;
                const odx = t.position.x - other.pos.x;
                const ody = t.position.y - other.pos.y;
                const odist = Math.sqrt(odx * odx + ody * ody);
                if (odist < SWARM_SEPARATION_RADIUS && odist > 0.01) {
                    const repel = (SWARM_SEPARATION_RADIUS - odist) / SWARM_SEPARATION_RADIUS;
                    sepX += (odx / odist) * repel * 4;
                    sepY += (ody / odist) * repel * 4;
                }
            }

            // ── Jitter — reduced in combat for stability ─────────────────
            const jMult = hasCombatTarget ? 0.15 : 1.0;
            const jitterX = Math.sin(w.tick * 0.1 + id * 7.31) * SWARM_JITTER * jMult;
            const jitterY = Math.cos(w.tick * 0.1 + id * 3.77) * SWARM_JITTER * jMult;

            // ── Combine forces ───────────────────────────────────────────
            let vx = steer.x + sepX + jitterX;
            let vy = steer.y + sepY + jitterY;

            const vLen = Math.sqrt(vx * vx + vy * vy);
            const maxSpeed = unit.speed * 1.8;
            if (vLen > maxSpeed) {
                vx = (vx / vLen) * maxSpeed;
                vy = (vy / vLen) * maxSpeed;
            }

            t.position.x += vx * dt;
            t.position.y += vy * dt;

            // Face movement direction only in formation mode
            if (!hasCombatTarget && vLen > 0.1) {
                t.rotation = Math.atan2(vy, vx);
            }

            const half = MAP_SIZE / 2 - 2;
            t.position.x = Math.max(-half, Math.min(half, t.position.x));
            t.position.y = Math.max(-half, Math.min(half, t.position.y));
        }
    }

    /** Calculate formation slot position for a member */
    private getFormationTarget(
        leaderPos: Vec2,
        history: Vec2[],
        formation: string,
        index: number,
        leaderRotation: number,
    ): Vec2 {
        const config = FORMATIONS[formation as keyof typeof FORMATIONS] ?? FORMATIONS.column;
        const { spacing, type } = config;

        switch (type) {
            case 'column': {
                // Follow the leader's breadcrumb trail
                const trailDist = (index + 1) * spacing;
                let accumulated = 0;

                for (let i = history.length - 1; i > 0; i--) {
                    const segDist = v2Dist(history[i], history[i - 1]);
                    accumulated += segDist;
                    if (accumulated >= trailDist) {
                        const overshoot = accumulated - trailDist;
                        const t = overshoot / segDist;
                        return {
                            x: history[i - 1].x + (history[i].x - history[i - 1].x) * t,
                            y: history[i - 1].y + (history[i].y - history[i - 1].y) * t,
                        };
                    }
                }

                // Trail too short — extend behind leader
                const angle = leaderRotation + Math.PI;
                return {
                    x: leaderPos.x + Math.cos(angle) * trailDist,
                    y: leaderPos.y + Math.sin(angle) * trailDist,
                };
            }

            case 'line': {
                // Spread in a line perpendicular to leader's facing
                const perpAngle = leaderRotation + Math.PI / 2;
                const halfWidth = Math.floor(index / 2) + 1;
                const side = index % 2 === 0 ? 1 : -1;
                return {
                    x: leaderPos.x + Math.cos(perpAngle) * halfWidth * spacing * side - Math.cos(leaderRotation) * 2,
                    y: leaderPos.y + Math.sin(perpAngle) * halfWidth * spacing * side - Math.sin(leaderRotation) * 2,
                };
            }

            case 'wedge': {
                // V-shape behind leader
                const row = Math.floor(index / 2) + 1;
                const side = index % 2 === 0 ? 1 : -1;
                const backAngle = leaderRotation + Math.PI;
                const perpAngle = leaderRotation + Math.PI / 2;
                return {
                    x: leaderPos.x + Math.cos(backAngle) * row * spacing + Math.cos(perpAngle) * row * spacing * 0.5 * side,
                    y: leaderPos.y + Math.sin(backAngle) * row * spacing + Math.sin(perpAngle) * row * spacing * 0.5 * side,
                };
            }

            default:
                return { x: leaderPos.x, y: leaderPos.y };
        }
    }

    private getArmySize(leaderId: number, members: any): number {
        let count = 0;
        for (const [, m] of members.entries()) {
            if (m.leaderId === leaderId) count++;
        }
        return count;
    }

    dispose(): void { }
}
