/**
 * Game — Main orchestrator for Crawnfall: War Serpent Arena.
 *
 * Initializes world, systems, rendering, and the game loop.
 * Spawns player + AI leaders with starting armies and scatters shards.
 */

import * as THREE from 'three';
import {
    World,
    CK,
    SIM_DT,
    MAP_SIZE,
    STARTING_ARMY_SIZE,
    UNIT_DEFS,
    LEADER_HP,
    MATCH_DURATION,
    AI_DECISION_INTERVAL,
    GameEventType,
    type TransformC,
    type HealthC,
    type TeamC,
    type UnitC,
    type BannerLeaderC,
    type WarbandMemberC,
    type MovableC,
    type CombatantC,
    type CohesionC,
    type RenderRefC,
    type AIControllerC,
    type EssenceShardC,
    type CrownC,
    type CrownBearerC,
    type ShardFountainC,
    type SelectableC,
    type SelectedC,
    type EntityId,
} from '@crownfall/game-core';

import { MovementSystem } from '@crownfall/game-core';
import { CombatSystem } from '@crownfall/game-core';
import { AISystem } from '@crownfall/game-core';
import { ShardSystem } from '@crownfall/game-core';
import { CrownSystem } from '@crownfall/game-core';
import { QUALITY_PRESETS, type QualityPreset } from '@crownfall/game-core';

import { SceneManager } from '../renderer/SceneManager.js';
import { EntityRenderer } from '../renderer/EntityRenderer.js';
import { TerrainGenerator } from '../renderer/TerrainGenerator.js';
import { VegetationSystem } from '../renderer/VegetationSystem.js';
import { RTSCamera } from '../camera/RTSCamera.js';
import { InputManager } from '../input/InputManager.js';
import { HUD } from '../ui/HUD.js';
import { SettingsMenu } from '../ui/SettingsMenu.js';

export class Game {
    private world: World;
    private sceneManager: SceneManager;
    private entityRenderer: EntityRenderer;
    private terrain: TerrainGenerator;
    private vegetation: VegetationSystem;
    private camera: RTSCamera;
    private input: InputManager;
    private hud: HUD;
    private settings: SettingsMenu;

    // Systems
    private movementSystem: MovementSystem;
    private combatSystem: CombatSystem;
    private aiSystem: AISystem;
    private shardSystem: ShardSystem;
    private crownSystem: CrownSystem;

    private accumulator = 0;
    private running = false;
    private animFrameId = 0;

    private playerLeaderId: EntityId = 0;
    private aiLeaderIds: EntityId[] = [];
    private playerTeamId = 1;
    /** AI teams: 2, 3, 4, 5 */
    private aiTeamIds = [2, 3, 4, 5];

    // Match state
    private matchEnded = false;

    constructor(private container: HTMLElement) {
        // ── 1. Create world ──────────────────────────────────────────────
        const seed = Date.now();
        this.world = new World(seed);

        // Register all component stores
        this.world.registerStore<TransformC>(CK.Transform);
        this.world.registerStore<HealthC>(CK.Health);
        this.world.registerStore<TeamC>(CK.Team);
        this.world.registerStore<UnitC>(CK.Unit);
        this.world.registerStore<BannerLeaderC>(CK.BannerLeader);
        this.world.registerStore<WarbandMemberC>(CK.WarbandMember);
        this.world.registerStore<MovableC>(CK.Movable);
        this.world.registerStore<CombatantC>(CK.Combatant);
        this.world.registerStore<CohesionC>(CK.Cohesion);
        this.world.registerStore<SelectableC>(CK.Selectable);
        this.world.registerStore<SelectedC>(CK.Selected);
        this.world.registerStore<RenderRefC>(CK.RenderRef);
        this.world.registerStore<AIControllerC>(CK.AIController);
        this.world.registerStore<EssenceShardC>(CK.EssenceShard);
        this.world.registerStore<CrownC>(CK.Crown);
        this.world.registerStore<CrownBearerC>(CK.CrownBearer);
        this.world.registerStore<ShardFountainC>(CK.ShardFountain);

        // ── 2. Terrain + Scene ───────────────────────────────────────────
        this.terrain = new TerrainGenerator();
        this.sceneManager = new SceneManager(container);
        this.sceneManager.scene.add(this.terrain.mesh);

        this.vegetation = new VegetationSystem(this.sceneManager.scene, this.terrain, QUALITY_PRESETS.high);

        // ── 3. Camera ────────────────────────────────────────────────────
        // Game coords are centered at 0, terrain expects 0..MAP_SIZE
        const half = MAP_SIZE / 2;
        const getH = (x: number, z: number) => this.terrain.getHeightAt(x + half, z + half);
        this.camera = new RTSCamera(container, getH);
        // Replace scene manager's camera with ours
        this.sceneManager.setCamera(this.camera.camera);

        // ── 4. Entity renderer ───────────────────────────────────────────
        this.entityRenderer = new EntityRenderer(this.sceneManager.scene, getH);

        // ── 5. Systems ───────────────────────────────────────────────────
        this.movementSystem = new MovementSystem(getH);
        this.movementSystem.attach(this.world);

        this.shardSystem = new ShardSystem(getH);
        this.shardSystem.attach(this.world);

        this.crownSystem = new CrownSystem();
        this.crownSystem.attach(this.world, this.shardSystem);

        this.combatSystem = new CombatSystem();
        this.combatSystem.attach(this.world, this.shardSystem, this.crownSystem);

        this.aiSystem = new AISystem();
        this.aiSystem.attach(this.world);

        this.world.addSystem(this.movementSystem);
        this.world.addSystem(this.shardSystem);
        this.world.addSystem(this.combatSystem);
        this.world.addSystem(this.aiSystem);
        this.world.addSystem(this.crownSystem);

        // ── 6. Input ─────────────────────────────────────────────────────
        this.input = new InputManager(container, this.world, this.playerTeamId);
        this.input.setCamera(this.camera.camera);
        this.input.setTerrainMesh(this.terrain.mesh);
        this.input.bind();

        // ── 7. Spawn entities ────────────────────────────────────────────
        this.spawnLeaders();
        this.shardSystem.spawnInitialShards();

        // ── 8. HUD ───────────────────────────────────────────────────────
        this.hud = new HUD(container, this.world, this.playerTeamId);

        this.settings = new SettingsMenu(
            container,
            this.sceneManager,
            (preset: QualityPreset) => {
                // Vegetation rebuild would go here
            },
        );

        // ── 9. Match events ──────────────────────────────────────────────
        this.world.events.on(GameEventType.MatchEnded, (ev: any) => {
            this.matchEnded = true;
            this.showMatchResult(ev.winnerId === this.playerTeamId, ev.reason, ev.winnerArmySize);
        });

        // Resize
        window.addEventListener('resize', this.onResize);
        this.onResize();
    }

    private spawnLeaders(): void {
        // Player leader — center-south
        this.playerLeaderId = this.spawnLeader(this.playerTeamId, { x: 0, y: MAP_SIZE * 0.3 });
        this.input.setPlayerLeaderId(this.playerLeaderId);
        this.camera.setPlayerLeaderId(this.playerLeaderId);

        // Spawn starting warriors for player
        for (let i = 0; i < STARTING_ARMY_SIZE; i++) {
            this.spawnWarrior(this.playerLeaderId, this.playerTeamId, { x: 0, y: MAP_SIZE * 0.3 }, i);
        }

        // AI leaders — spread around map with different personalities
        const aiSpawns: Array<{ pos: { x: number; y: number }; aggression: number }> = [
            { pos: { x: MAP_SIZE * 0.3, y: -MAP_SIZE * 0.2 }, aggression: 0.9 },  // aggressive NE
            { pos: { x: -MAP_SIZE * 0.3, y: -MAP_SIZE * 0.2 }, aggression: 0.4 },  // cautious NW
            { pos: { x: MAP_SIZE * 0.25, y: MAP_SIZE * 0.1 }, aggression: 0.7 }, // balanced E
            { pos: { x: -MAP_SIZE * 0.25, y: MAP_SIZE * 0.15 }, aggression: 0.3 }, // farmer W
        ];

        for (let i = 0; i < this.aiTeamIds.length; i++) {
            const teamId = this.aiTeamIds[i];
            const spawn = aiSpawns[i];
            const aiLeaderId = this.spawnLeader(teamId, spawn.pos, true, spawn.aggression);
            this.aiLeaderIds.push(aiLeaderId);

            for (let j = 0; j < STARTING_ARMY_SIZE; j++) {
                this.spawnWarrior(aiLeaderId, teamId, spawn.pos, j);
            }
        }
    }

    private spawnLeader(teamId: number, pos: { x: number; y: number }, isAI = false, aggression = 0.6): EntityId {
        const w = this.world;
        const eid = w.createEntity();

        w.getStore<TransformC>(CK.Transform).set(eid, {
            position: { x: pos.x, y: pos.y },
            rotation: 0,
            elevation: 0,
        });

        w.getStore<TeamC>(CK.Team).set(eid, { teamId });

        w.getStore<HealthC>(CK.Health).set(eid, {
            current: LEADER_HP,
            max: LEADER_HP,
        });

        w.getStore<BannerLeaderC>(CK.BannerLeader).set(eid, {
            teamId,
            formation: 'column',
            stance: 'aggressive',
            rallyCarriers: false,
            positionHistory: [{ x: pos.x, y: pos.y }],
            maxHistoryLength: 120,
        });

        w.getStore<MovableC>(CK.Movable).set(eid, {
            targetPosition: null,
            moveSpeed: 5,
            arrived: true,
        });

        // Leaders do NOT get CombatantC — they stay behind their army
        // They can still be targeted and damaged, but they don't auto-attack

        w.getStore<CrownBearerC>(CK.CrownBearer).set(eid, {
            crownsCollected: 0,
            glowIntensity: 0,
        });

        w.getStore<RenderRefC>(CK.RenderRef).set(eid, {
            meshId: `leader_${eid}`,
            dirty: true,
            visible: true,
            scale: 1.0,
        });

        if (isAI) {
            w.getStore<AIControllerC>(CK.AIController).set(eid, {
                state: 'farm',
                targetEntityId: 0,
                stateTimer: 0,
                decisionCooldown: AI_DECISION_INTERVAL + Math.floor(Math.random() * 10),
                aggression,
            });
        }

        return eid;
    }

    private spawnWarrior(leaderId: EntityId, teamId: number, nearPos: { x: number; y: number }, index: number): EntityId {
        const w = this.world;
        const eid = w.createEntity();
        const def = UNIT_DEFS.militia;

        const angle = (index / STARTING_ARMY_SIZE) * Math.PI * 2;
        const dist = 2 + Math.random() * 2;

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
            indexInFormation: index,
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
            engagementRange: 6,  // warriors engage at distance to form a front line
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

        return eid;
    }

    start(): void {
        this.running = true;

        // Hide loading
        const loadingEl = document.getElementById('loading-screen');
        if (loadingEl) loadingEl.style.display = 'none';

        this.loop(performance.now());
    }

    private loop = (now: number): void => {
        if (!this.running) return;
        this.animFrameId = requestAnimationFrame(this.loop);

        const dt = Math.min(1 / 20, 1 / 60); // fixed frame time for consistency

        // Update input (cursor → leader target)
        this.input.updateCursorTarget();

        // Fixed-step simulation
        this.accumulator += dt;
        while (this.accumulator >= SIM_DT) {
            this.world.update(SIM_DT);
            this.accumulator -= SIM_DT;

            // Check match timeout
            if (!this.matchEnded && this.world.matchTime >= MATCH_DURATION) {
                this.endMatchByTimeout();
            }
        }

        // Camera follow
        this.camera.update(dt, this.world);

        // Render
        this.entityRenderer.sync(this.world);
        this.sceneManager.render(this.camera.camera);

        // HUD
        this.hud.update(this.world, this.playerTeamId, 0, this.playerLeaderId);
    };

    private endMatchByTimeout(): void {
        const playerArmy = this.countArmy(this.playerTeamId);

        // Find the AI with the largest army
        let bestAiArmy = 0;
        let bestAiTeamId = this.aiTeamIds[0];
        for (const aiTeamId of this.aiTeamIds) {
            const size = this.countArmy(aiTeamId);
            if (size > bestAiArmy) {
                bestAiArmy = size;
                bestAiTeamId = aiTeamId;
            }
        }

        const winnerId = playerArmy >= bestAiArmy ? this.playerTeamId : bestAiTeamId;
        this.world.events.emit(GameEventType.MatchEnded, {
            winnerId,
            reason: 'timeout',
            winnerArmySize: Math.max(playerArmy, bestAiArmy),
        });
    }

    private countArmy(teamId: number): number {
        let count = 0;
        const members = this.world.getStore<WarbandMemberC>(CK.WarbandMember);
        for (const [, m] of members.entries()) {
            if (m.teamId === teamId) count++;
        }
        return count;
    }

    private showMatchResult(isWin: boolean, reason: string, armySize: number): void {
        const overlay = document.createElement('div');
        overlay.id = 'match-result';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 100;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.7); backdrop-filter: blur(8px);
            font-family: 'Inter', sans-serif; color: #fff;
            animation: fadeIn 0.5s ease;
        `;

        const title = isWin ? 'VICTORY' : 'DEFEAT';
        const titleColor = isWin ? '#FFD700' : '#FF4444';
        const subtitle = reason === 'crown_victory' ? 'Crown Claimed'
            : reason === 'annihilation' ? 'Army Destroyed'
                : 'Time Expired';

        overlay.innerHTML = `
            <h1 style="font-size: 3rem; font-weight: 800; color: ${titleColor}; margin: 0;
                text-shadow: 0 0 30px ${titleColor}40; letter-spacing: 0.1em;">${title}</h1>
            <p style="font-size: 1rem; color: #aaa; margin: 8px 0 24px;">${subtitle} · Army: ${armySize}</p>
            <button id="btn-play-again" style="
                padding: 12px 32px; font-size: 1rem; font-weight: 600;
                background: linear-gradient(135deg, ${titleColor}40, ${titleColor}20);
                border: 1px solid ${titleColor}60; border-radius: 8px;
                color: #fff; cursor: pointer; transition: all 0.2s;
            ">Play Again</button>
        `;

        this.container.appendChild(overlay);

        document.getElementById('btn-play-again')?.addEventListener('click', () => {
            overlay.remove();
            this.restart();
        });
    }

    private restart(): void {
        // Full dispose of all systems, renderers, and event listeners
        this.dispose();

        // Clean up HUD DOM
        const hudEl = document.getElementById('game-hud');
        if (hudEl) hudEl.remove();

        // Remove settings UI
        const settingsEl = document.getElementById('settings-menu');
        if (settingsEl) settingsEl.remove();

        // Re-construct fresh game
        const container = this.container;
        const game = new Game(container);
        game.start();

        (window as any).__crownfall = game;
    }

    private onResize = (): void => {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.sceneManager.handleResize(w, h);
        this.camera.handleResize(w, h);
    };

    dispose(): void {
        this.running = false;
        cancelAnimationFrame(this.animFrameId);
        window.removeEventListener('resize', this.onResize);
        this.world.dispose();
        this.entityRenderer.dispose();
        this.input.dispose();
        this.vegetation.dispose();
        this.camera.dispose();
        this.hud.dispose();
        this.sceneManager.dispose();
    }
}
