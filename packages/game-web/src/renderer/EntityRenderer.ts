/**
 * EntityRenderer — Syncs ECS state with Three.js scene objects.
 *
 * Memory management:
 *  - Shared geometries for units, leaders, health bars (never cloned)
 *  - Materials cloned per entity BUT properly disposed on removal
 *  - PointLights disposed via recursive traverse on removal
 *  - Tracking maps cleaned when entities are removed
 *  - Shard lights REMOVED — use emissive material only (massive perf win)
 */

import * as THREE from 'three';
import type {
    World,
    TransformC,
    RenderRefC,
    HealthC,
    TeamC,
    UnitC,
    BannerLeaderC,
    EssenceShardC,
    CrownC,
    CrownBearerC,
    WarbandMemberC,
    CombatantC,
    EntityId,
} from '@crownfall/game-core';
import { CK } from '@crownfall/game-core';
import { MAP_SIZE } from '@crownfall/game-core';

/** Team colours */
const TEAM_COLORS: Record<number, number> = {
    1: 0x2196F3,  // player — blue
    2: 0xF44336,  // AI 1 — red (aggressive)
    3: 0x4CAF50,  // AI 2 — green (cautious)
    4: 0xFF9800,  // AI 3 — orange (balanced)
    5: 0x9C27B0,  // AI 4 — purple (farmer)
};

const NEUTRAL_COLOR = 0x999999;

export class EntityRenderer {
    private scene: THREE.Scene;
    private meshes = new Map<string, THREE.Object3D>();
    private healthBars = new Map<string, THREE.Mesh>();

    // Shared geometries — ONE instance each, never cloned
    private shardGeo: THREE.OctahedronGeometry;
    private unitGeo: THREE.CylinderGeometry;
    private leaderGeo: THREE.CylinderGeometry;
    private crownGeo: THREE.ConeGeometry;
    private leaderCrownGeo: THREE.ConeGeometry;
    private healthBarGeo: THREE.PlaneGeometry;   // shared across all health bars

    // Shared base materials — cloned per entity
    private shardMat: THREE.MeshStandardMaterial;
    private crownMat: THREE.MeshStandardMaterial;
    private teamMats: Map<number, THREE.MeshStandardMaterial> = new Map();

    // Map meshId → entityId for cleanup of tracking maps
    private meshIdToEid = new Map<string, number>();

    // Track previous HP for damage flash
    private prevHealth = new Map<number, number>();
    // Track damage flash timers
    private damageFlash = new Map<number, number>();

    private getTerrainHeight: (x: number, z: number) => number;

    constructor(scene: THREE.Scene, getTerrainHeight: (x: number, z: number) => number) {
        this.scene = scene;
        this.getTerrainHeight = getTerrainHeight;

        // Shared geometries — allocated ONCE
        this.shardGeo = new THREE.OctahedronGeometry(0.5, 1);
        this.unitGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.0, 8);
        this.leaderGeo = new THREE.CylinderGeometry(0.35, 0.4, 1.4, 8);
        this.crownGeo = new THREE.ConeGeometry(0.4, 0.6, 5);
        this.leaderCrownGeo = new THREE.ConeGeometry(0.25, 0.35, 5);
        this.healthBarGeo = new THREE.PlaneGeometry(1, 0.08);

        // Shard material — glowing cyan
        this.shardMat = new THREE.MeshStandardMaterial({
            color: 0x00FFCC,
            emissive: 0x00FFAA,
            emissiveIntensity: 1.5,
            transparent: true,
            opacity: 0.9,
            roughness: 0.1,
            metalness: 0.8,
        });

        // Crown material — golden
        this.crownMat = new THREE.MeshStandardMaterial({
            color: 0xFFD700,
            emissive: 0xFFAA00,
            emissiveIntensity: 0.6,
            roughness: 0.3,
            metalness: 0.8,
        });

        // Team materials
        for (const [teamId, color] of Object.entries(TEAM_COLORS)) {
            this.teamMats.set(Number(teamId), new THREE.MeshStandardMaterial({
                color,
                roughness: 0.6,
                metalness: 0.3,
            }));
        }
    }

    /** Main sync — call every render frame */
    sync(world: World): void {
        const refs = world.getStore<RenderRefC>(CK.RenderRef);
        const transforms = world.getStore<TransformC>(CK.Transform);
        const healthStore = world.getStore<HealthC>(CK.Health);
        const teams = world.getStore<TeamC>(CK.Team);
        const units = world.getStore<UnitC>(CK.Unit);
        const leaders = world.getStore<BannerLeaderC>(CK.BannerLeader);
        const shards = world.getStore<EssenceShardC>(CK.EssenceShard);
        const crowns = world.getStore<CrownC>(CK.Crown);
        const bearers = world.getStore<CrownBearerC>(CK.CrownBearer);
        const combatants = world.getStore<CombatantC>(CK.Combatant);

        const activeIds = new Set<string>();

        for (const [eid, ref] of refs.entries()) {
            const t = transforms.get(eid);
            if (!t) continue;

            activeIds.add(ref.meshId);

            let obj = this.meshes.get(ref.meshId);

            // Create mesh if it doesn't exist
            if (!obj) {
                obj = this.createMesh(eid, ref, world);
                this.scene.add(obj);
                this.meshes.set(ref.meshId, obj);
                this.meshIdToEid.set(ref.meshId, eid);
            }

            // Update position
            const ox = t.position.x + MAP_SIZE / 2;
            const oz = t.position.y + MAP_SIZE / 2;
            const terrainY = this.getTerrainHeight(t.position.x, t.position.y);

            if (shards.has(eid)) {
                const shard = shards.get(eid)!;
                const bob = Math.sin(shard.glowPhase) * 0.15 + 0.5;
                obj.position.set(ox, terrainY + bob, oz);
                obj.rotation.y += 0.03;
                obj.rotation.x = Math.sin(shard.glowPhase * 0.5) * 0.2;
            } else if (crowns.has(eid)) {
                obj.position.set(ox, terrainY + 0.8 + Math.sin(world.tick * 0.05) * 0.15, oz);
                obj.rotation.y += 0.04;
            } else {
                obj.position.set(ox, terrainY + 0.5, oz);
                obj.rotation.y = -t.rotation + Math.PI / 2;
            }

            obj.visible = ref.visible;

            // Update health bars
            const hp = healthStore.get(eid);
            if (hp) {
                this.updateHealthBar(ref.meshId, obj, hp.current / hp.max);

                // Damage flash detection
                const prevHp = this.prevHealth.get(eid) ?? hp.current;
                if (hp.current < prevHp) {
                    this.damageFlash.set(eid, 6);
                }
                this.prevHealth.set(eid, hp.current);
            }

            // Visual feedback for warriors
            const unit = units.get(eid);
            if (unit && obj instanceof THREE.Mesh) {
                const mat = obj.material as THREE.MeshStandardMaterial;
                const ticksSinceAttack = world.tick - unit.lastAttackTick;
                const flash = this.damageFlash.get(eid) ?? 0;

                if (ticksSinceAttack < 4) {
                    const attackT = ticksSinceAttack / 4;
                    const attackScale = 1 + (1 - attackT) * 0.25;
                    obj.scale.setScalar(attackScale);
                    mat.emissiveIntensity = 0.6;
                } else if (flash > 0) {
                    mat.emissive.setHex(0xFF2200);
                    mat.emissiveIntensity = 0.8 * (flash / 6);
                    obj.scale.setScalar(0.9 + (flash / 6) * 0.1);
                    this.damageFlash.set(eid, flash - 1);
                } else {
                    const combat = combatants.get(eid);
                    if (combat?.inCombat) {
                        mat.emissiveIntensity = 0.15;
                    } else {
                        mat.emissiveIntensity = 0.0;
                    }
                    obj.scale.setScalar(1.0);
                    const team = teams.get(eid);
                    const teamColor = TEAM_COLORS[team?.teamId ?? 0] ?? NEUTRAL_COLOR;
                    mat.emissive.setHex(teamColor);
                }
            }

            // Leader visual feedback
            if (leaders.has(eid)) {
                const bearer = bearers.get(eid);
                if (bearer && obj instanceof THREE.Mesh) {
                    const mat = obj.material as THREE.MeshStandardMaterial;
                    mat.emissiveIntensity = 0.2 + bearer.glowIntensity * 0.8;
                }

                const flash = this.damageFlash.get(eid) ?? 0;
                if (flash > 0) {
                    if (obj instanceof THREE.Mesh) {
                        const mat = obj.material as THREE.MeshStandardMaterial;
                        mat.emissive.setHex(0xFF2200);
                        mat.emissiveIntensity = 0.9;
                    }
                    const pulseScale = 1 + (flash / 6) * 0.15;
                    obj.scale.setScalar(pulseScale);
                    this.damageFlash.set(eid, flash - 1);
                } else {
                    obj.scale.setScalar(1);
                    if (obj instanceof THREE.Mesh) {
                        const mat = obj.material as THREE.MeshStandardMaterial;
                        const team = teams.get(eid);
                        const teamColor = TEAM_COLORS[team?.teamId ?? 0] ?? NEUTRAL_COLOR;
                        mat.emissive.setHex(teamColor);
                    }
                }
            }
        }

        // ── Remove stale meshes with FULL disposal ──────────────────────────
        for (const [meshId, obj] of this.meshes.entries()) {
            if (!activeIds.has(meshId)) {
                this.disposeObject3D(obj);
                this.scene.remove(obj);
                this.meshes.delete(meshId);

                // Dispose health bar
                const hbar = this.healthBars.get(meshId);
                if (hbar) {
                    // Don't dispose shared healthBarGeo — just the material
                    (hbar.material as THREE.Material).dispose();
                    this.scene.remove(hbar);
                    this.healthBars.delete(meshId);
                }

                // Clean up tracking maps
                const eid = this.meshIdToEid.get(meshId);
                if (eid !== undefined) {
                    this.prevHealth.delete(eid);
                    this.damageFlash.delete(eid);
                    this.meshIdToEid.delete(meshId);
                }
            }
        }
    }

    /** Recursively dispose all GPU resources in an Object3D tree */
    private disposeObject3D(obj: THREE.Object3D): void {
        // Traverse children first
        while (obj.children.length > 0) {
            const child = obj.children[0];
            obj.remove(child);
            this.disposeObject3D(child);
        }

        if (obj instanceof THREE.Mesh) {
            // Dispose material (cloned per entity — safe to dispose)
            // Do NOT dispose shared geometries
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    (obj.material as THREE.Material).dispose();
                }
            }
            // Geometry: only dispose if it's NOT one of our shared geometries
            if (obj.geometry &&
                obj.geometry !== this.shardGeo &&
                obj.geometry !== this.unitGeo &&
                obj.geometry !== this.leaderGeo &&
                obj.geometry !== this.crownGeo &&
                obj.geometry !== this.leaderCrownGeo &&
                obj.geometry !== this.healthBarGeo) {
                obj.geometry.dispose();
            }
        }

        if (obj instanceof THREE.Light) {
            obj.dispose();
        }
    }

    private createMesh(eid: number, ref: RenderRefC, world: World): THREE.Object3D {
        const shards = world.getStore<EssenceShardC>(CK.EssenceShard);
        const crowns = world.getStore<CrownC>(CK.Crown);
        const leaders = world.getStore<BannerLeaderC>(CK.BannerLeader);
        const teams = world.getStore<TeamC>(CK.Team);

        if (shards.has(eid)) {
            // Shard — emissive mesh only (NO PointLight = huge perf/memory win)
            const mat = this.shardMat.clone();
            const mesh = new THREE.Mesh(this.shardGeo, mat);
            mesh.scale.setScalar(ref.scale);
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            return mesh;
        }

        if (crowns.has(eid)) {
            const mat = this.crownMat.clone();
            const mesh = new THREE.Mesh(this.crownGeo, mat);
            mesh.scale.setScalar(ref.scale);
            mesh.castShadow = true;
            return mesh;
        }

        // Unit or leader
        const team = teams.get(eid);
        const teamId = team?.teamId ?? 0;
        const isLeader = leaders.has(eid);

        const geo = isLeader ? this.leaderGeo : this.unitGeo;
        const baseMat = this.teamMats.get(teamId) ?? new THREE.MeshStandardMaterial({ color: NEUTRAL_COLOR });
        const mat = baseMat.clone();

        if (isLeader) {
            mat.emissive = new THREE.Color(baseMat.color);
            mat.emissiveIntensity = 0.2;
        }

        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        if (isLeader) {
            // Crown on top — uses shared geometry
            const crownMat = this.crownMat.clone();
            const crownMesh = new THREE.Mesh(this.leaderCrownGeo, crownMat);
            crownMesh.position.y = 0.85;
            mesh.add(crownMesh);

            // Single PointLight per leader (only 5 exist, acceptable)
            const lightColor = TEAM_COLORS[teamId] ?? 0xFFFFFF;
            const light = new THREE.PointLight(lightColor, 1.5, 12);
            light.position.y = 1.2;
            mesh.add(light);
        }

        return mesh;
    }

    private updateHealthBar(meshId: string, parent: THREE.Object3D, ratio: number): void {
        if (ratio >= 1) {
            const bar = this.healthBars.get(meshId);
            if (bar) bar.visible = false;
            return;
        }

        let bar = this.healthBars.get(meshId);
        if (!bar) {
            // Use SHARED geometry, individual material
            const barMat = new THREE.MeshBasicMaterial({
                color: 0x44FF44,
                side: THREE.DoubleSide,
                depthTest: false,
            });
            bar = new THREE.Mesh(this.healthBarGeo, barMat);
            bar.renderOrder = 999;
            this.scene.add(bar);
            this.healthBars.set(meshId, bar);
        }

        bar.visible = true;
        bar.position.copy(parent.position);
        bar.position.y += 1.5;
        bar.scale.x = Math.max(0, ratio);

        const mat = bar.material as THREE.MeshBasicMaterial;
        if (ratio > 0.6) mat.color.setHex(0x44FF44);
        else if (ratio > 0.3) mat.color.setHex(0xFFAA00);
        else mat.color.setHex(0xFF3333);

        bar.lookAt(bar.position.x, bar.position.y, bar.position.z + 1);
    }

    dispose(): void {
        for (const [, obj] of this.meshes) {
            this.disposeObject3D(obj);
            this.scene.remove(obj);
        }
        for (const [, bar] of this.healthBars) {
            (bar.material as THREE.Material).dispose();
            this.scene.remove(bar);
        }
        this.meshes.clear();
        this.healthBars.clear();
        this.prevHealth.clear();
        this.damageFlash.clear();
        this.meshIdToEid.clear();

        // Shared geometries
        this.shardGeo.dispose();
        this.unitGeo.dispose();
        this.leaderGeo.dispose();
        this.crownGeo.dispose();
        this.leaderCrownGeo.dispose();
        this.healthBarGeo.dispose();

        // Shared materials
        this.shardMat.dispose();
        this.crownMat.dispose();
        for (const [, mat] of this.teamMats) mat.dispose();
        this.teamMats.clear();
    }
}
