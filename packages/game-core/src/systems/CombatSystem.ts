/**
 * CombatSystem — Warriors auto-fight with clear combat roles.
 *
 * Design philosophy:
 *   - Leaders DO NOT FIGHT. They stay behind their army.
 *     Leaders can be attacked, but only when the enemy's warriors reach them.
 *   - Warriors target other WARRIORS first. They only attack leaders
 *     when no enemy warriors are within engagement range.
 *   - Warriors maintain attack range distance (don't overlap into blobs).
 *   - Flanking: attacking from behind deals 1.5x damage + morale penalty.
 *   - Morale: drops when outnumbered or when own leader takes damage.
 *     At 0 morale → scatter for a few seconds → recover to 50%.
 *   - Charge: first hit after closing distance deals 2x damage.
 */

import type { ISystem, EntityId } from '../ecs/types.js';
import type { World } from '../ecs/World.js';
import { CK, type TransformC, type UnitC, type HealthC, type TeamC, type CombatantC, type CohesionC, type WarbandMemberC, type BannerLeaderC, type CrownBearerC } from '../components/index.js';
import { GameEventType } from '../events/GameEvents.js';
import {
    COHESION_FLANK_PENALTY, COHESION_REGEN_RATE,
    MORALE_OUTNUMBER_PENALTY, MORALE_LEADER_HIT_PENALTY,
    DEATH_SHARD_DROP, LEADER_HP, LEADER_REGEN_RATE,
    SCATTER_DURATION, CHARGE_DAMAGE_MULT, CHARGE_COOLDOWN,
} from '../data/GameConfig.js';
import type { ShardSystem } from './ShardSystem.js';
import type { CrownSystem } from './CrownSystem.js';
import { v2Dist } from '../utils/MathUtils.js';

export class CombatSystem implements ISystem {
    readonly name = 'CombatSystem';
    private world!: World;
    private shardSystem!: ShardSystem;
    private crownSystem!: CrownSystem;

    // Track charge state per entity
    private lastChargeHit = new Map<EntityId, number>();

    attach(world: World, shardSystem: ShardSystem, crownSystem: CrownSystem): void {
        this.world = world;
        this.shardSystem = shardSystem;
        this.crownSystem = crownSystem;
    }

    init(): void { }

    update(dt: number): void {
        if (!this.world) return;
        const w = this.world;
        const tick = w.tick;

        const transforms = w.getStore<TransformC>(CK.Transform);
        const units = w.getStore<UnitC>(CK.Unit);
        const health = w.getStore<HealthC>(CK.Health);
        const teams = w.getStore<TeamC>(CK.Team);
        const combatants = w.getStore<CombatantC>(CK.Combatant);
        const cohesion = w.getStore<CohesionC>(CK.Cohesion);
        const members = w.getStore<WarbandMemberC>(CK.WarbandMember);
        const leaders = w.getStore<BannerLeaderC>(CK.BannerLeader);

        const deadEntities: { id: EntityId; pos: TransformC; isLeader: boolean; teamId: number; killerTeamId: number }[] = [];

        // ── Count armies per team for outnumber mechanic ─────────────────────
        const teamArmyCounts = new Map<number, number>();
        for (const [, m] of members.entries()) {
            if (m.teamId > 0 && m.leaderId > 0) {
                teamArmyCounts.set(m.teamId, (teamArmyCounts.get(m.teamId) ?? 0) + 1);
            }
        }

        // ── Update morale / scatter timers ──────────────────────────────────
        for (const [eid, coh] of cohesion.entries()) {
            if (coh.broken) {
                coh.scatterTimer--;
                if (coh.scatterTimer <= 0) {
                    coh.broken = false;
                    coh.current = coh.max * 0.5;
                    coh.scatterDir = undefined;
                }
                continue;
            }

            if (coh.current <= 0 && !coh.broken) {
                coh.broken = true;
                coh.scatterTimer = SCATTER_DURATION;
                const angle = Math.random() * Math.PI * 2;
                coh.scatterDir = { x: Math.cos(angle), y: Math.sin(angle) };
            }
        }

        // ── Warriors: Target acquisition + attack ────────────────────────────
        // Only entities with CombatantC fight. Leaders DO NOT have it.
        for (const [eid, combat] of combatants.entries()) {
            const t = transforms.get(eid);
            const unit = units.get(eid);
            const hp = health.get(eid);
            const team = teams.get(eid);
            if (!t || !unit || !hp || !team || hp.current <= 0) continue;

            // Skip scattered units
            const coh = cohesion.get(eid);
            if (coh?.broken) {
                combat.inCombat = false;
                combat.targetId = 0;
                continue;
            }

            // ── Find nearest enemy — WARRIORS FIRST, leaders only as fallback ──
            let nearestWarrior = 0;
            let nearestWarriorDist = Infinity;
            let nearestLeader = 0;
            let nearestLeaderDist = Infinity;

            for (const [otherId, otherTeam] of teams.entries()) {
                if (otherId === eid || otherTeam.teamId === team.teamId) continue;
                if (!w.isAlive(otherId)) continue;

                const otherHp = health.get(otherId);
                if (!otherHp || otherHp.current <= 0) continue;

                const ot = transforms.get(otherId);
                if (!ot) continue;

                const dist = v2Dist(t.position, ot.position);

                if (units.has(otherId)) {
                    // It's a warrior — priority target
                    if (dist < nearestWarriorDist) {
                        nearestWarriorDist = dist;
                        nearestWarrior = otherId;
                    }
                } else if (leaders.has(otherId)) {
                    // It's a leader — fallback target only
                    if (dist < nearestLeaderDist) {
                        nearestLeaderDist = dist;
                        nearestLeader = otherId;
                    }
                }
            }

            // Choose target: warriors first, leaders only if no warriors in range
            let targetId = 0;
            let targetDist = Infinity;
            if (nearestWarrior && nearestWarriorDist <= combat.engagementRange) {
                targetId = nearestWarrior;
                targetDist = nearestWarriorDist;
            } else if (nearestLeader && nearestLeaderDist <= combat.engagementRange * 0.7) {
                // Leaders are harder to reach — only target when closer
                targetId = nearestLeader;
                targetDist = nearestLeaderDist;
            }

            // ── Engage / Attack ──────────────────────────────────────────
            if (targetId && targetDist <= combat.engagementRange) {
                combat.inCombat = true;
                combat.targetId = targetId;

                // Face the target
                const tt = transforms.get(targetId)!;
                t.rotation = Math.atan2(
                    tt.position.y - t.position.y,
                    tt.position.x - t.position.x,
                );

                // Only attack if within attack range
                if (targetDist <= unit.attackRange &&
                    tick - unit.lastAttackTick >= unit.attackCooldown) {

                    // Stagger attacks slightly so they don't all sync
                    unit.lastAttackTick = tick + Math.floor(Math.random() * 2);

                    let damage = unit.attackDamage;

                    // ── Charge bonus — first hit deals 2x ────────────────
                    const lastCharge = this.lastChargeHit.get(eid) ?? 0;
                    if (tick - lastCharge > CHARGE_COOLDOWN) {
                        damage = Math.floor(damage * CHARGE_DAMAGE_MULT);
                        this.lastChargeHit.set(eid, tick);
                    }

                    // ── Flanking bonus ────────────────────────────────────
                    const attackAngle = Math.atan2(
                        t.position.y - tt.position.y,
                        t.position.x - tt.position.x,
                    );
                    const angleDiff = Math.abs(attackAngle - tt.rotation);
                    const normalizedAngle = angleDiff > Math.PI ? Math.PI * 2 - angleDiff : angleDiff;
                    const isFlanking = normalizedAngle < Math.PI * 0.4;

                    if (isFlanking) {
                        damage = Math.floor(damage * 1.5);
                        const targetCoh = cohesion.get(targetId);
                        if (targetCoh && !targetCoh.broken) {
                            targetCoh.current = Math.max(0, targetCoh.current - COHESION_FLANK_PENALTY);
                        }
                    }

                    // ── Apply damage ──────────────────────────────────────
                    const targetHp = health.get(targetId)!;
                    targetHp.current -= damage;

                    w.events.emit(GameEventType.DamageDealt, {
                        attackerId: eid,
                        victimId: targetId,
                        amount: damage,
                    });

                    // ── Leader damage → morale cascade ───────────────────
                    if (leaders.has(targetId)) {
                        const leaderTeam = teams.get(targetId);
                        if (leaderTeam) {
                            for (const [memberId, member] of members.entries()) {
                                if (member.leaderId === targetId) {
                                    const memberCoh = cohesion.get(memberId);
                                    if (memberCoh && !memberCoh.broken) {
                                        memberCoh.current = Math.max(0, memberCoh.current - MORALE_LEADER_HIT_PENALTY);
                                    }
                                }
                            }
                        }
                    }

                    // ── Check death ───────────────────────────────────────
                    if (targetHp.current <= 0) {
                        const targetTeam = teams.get(targetId);
                        deadEntities.push({
                            id: targetId,
                            pos: { ...tt },
                            isLeader: leaders.has(targetId),
                            teamId: targetTeam?.teamId ?? 0,
                            killerTeamId: team.teamId,
                        });
                    }
                }
            } else {
                combat.inCombat = false;
                combat.targetId = 0;
            }

            // ── Morale drain when outnumbered ────────────────────────────
            if (combat.inCombat && coh && !coh.broken && targetId) {
                const myTeamCount = teamArmyCounts.get(team.teamId) ?? 0;
                const enemyTeamId = teams.get(targetId)?.teamId ?? 0;
                const enemyTeamCount = teamArmyCounts.get(enemyTeamId) ?? 0;

                if (enemyTeamCount > myTeamCount * 1.3) {
                    const ratio = enemyTeamCount / Math.max(1, myTeamCount);
                    coh.current = Math.max(0, coh.current - MORALE_OUTNUMBER_PENALTY * ratio);
                }
            }

            // ── Cohesion regen when not fighting ─────────────────────────
            if (!combat.inCombat) {
                const rCoh = cohesion.get(eid);
                if (rCoh && !rCoh.broken && rCoh.current < rCoh.max) {
                    rCoh.current = Math.min(rCoh.max, rCoh.current + COHESION_REGEN_RATE);
                }
            }
        }

        // ── Leader health regen when not under attack ────────────────────────
        for (const [leaderId] of leaders.entries()) {
            const hp = health.get(leaderId);
            if (hp && hp.current < hp.max) {
                // Only regen if no enemies are within 8 units
                const lt = transforms.get(leaderId);
                const team = teams.get(leaderId);
                if (!lt || !team) continue;

                let underAttack = false;
                for (const [, combat] of combatants.entries()) {
                    if (combat.inCombat && combat.targetId === leaderId) {
                        underAttack = true;
                        break;
                    }
                }

                if (!underAttack) {
                    hp.current = Math.min(hp.max, hp.current + LEADER_REGEN_RATE);
                }
            }
        }

        // ── Process deaths ───────────────────────────────────────────────────
        for (const dead of deadEntities) {
            if (!w.isAlive(dead.id)) continue;

            // Clean up charge tracking for dead entities
            this.lastChargeHit.delete(dead.id);

            if (dead.isLeader) {
                this.crownSystem.handleLeaderDeath(dead.id, dead.killerTeamId);
            } else {
                this.shardSystem.spawnDeathShards(dead.pos.position, DEATH_SHARD_DROP);
                w.destroyEntity(dead.id);
            }

            w.events.emit(GameEventType.UnitDied, { unitId: dead.id });
        }
    }

    getArmySize(teamId: number): number {
        let count = 0;
        const members = this.world.getStore<WarbandMemberC>(CK.WarbandMember);
        for (const [, m] of members.entries()) {
            if (m.teamId === teamId) count++;
        }
        return count;
    }

    dispose(): void {
        this.lastChargeHit.clear();
    }
}
