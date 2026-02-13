/**
 * World — the central ECS container.
 * Manages entity lifecycle, component stores, and system execution order.
 */

import { ComponentStore, type EntityId, type ISystem } from './types.js';
import { EventBus } from '../events/EventBus.js';
import { SeededRandom } from '../utils/SeededRandom.js';

export class World {
    // ── Entity management ──────────────────────────────────────────────────
    private nextEntityId: EntityId = 1;
    private alive = new Set<EntityId>();
    private pendingDestroy: EntityId[] = [];

    // ── Component stores (registered by string key) ────────────────────────
    private stores = new Map<string, ComponentStore<unknown>>();

    // ── Systems ────────────────────────────────────────────────────────────
    private systems: ISystem[] = [];

    // ── Shared services ────────────────────────────────────────────────────
    public readonly events: EventBus;
    public readonly rng: SeededRandom;

    // ── Simulation time ────────────────────────────────────────────────────
    public tick = 0;
    public matchTime = 0; // seconds elapsed in sim-time
    public timeScale = 1; // 0 = paused, 1 = normal, 2 = fast
    public paused = false;

    constructor(seed: number, events?: EventBus) {
        this.rng = new SeededRandom(seed);
        this.events = events ?? new EventBus();
    }

    // ── Entity CRUD ────────────────────────────────────────────────────────

    createEntity(): EntityId {
        const id = this.nextEntityId++;
        this.alive.add(id);
        return id;
    }

    destroyEntity(id: EntityId): void {
        this.pendingDestroy.push(id);
    }

    isAlive(id: EntityId): boolean {
        return this.alive.has(id);
    }

    flushDestroyed(): void {
        for (const id of this.pendingDestroy) {
            this.alive.delete(id);
            // Remove from all component stores
            for (const store of this.stores.values()) {
                store.delete(id);
            }
        }
        this.pendingDestroy.length = 0;
    }

    getAliveEntities(): ReadonlySet<EntityId> {
        return this.alive;
    }

    getEntityCount(): number {
        return this.alive.size;
    }

    // ── Component access ───────────────────────────────────────────────────

    registerStore<T>(key: string): ComponentStore<T> {
        if (this.stores.has(key)) return this.stores.get(key)! as ComponentStore<T>;
        const store = new ComponentStore<T>();
        this.stores.set(key, store as ComponentStore<unknown>);
        return store;
    }

    getStore<T>(key: string): ComponentStore<T> {
        const store = this.stores.get(key);
        if (!store) throw new Error(`ComponentStore "${key}" not registered`);
        return store as ComponentStore<T>;
    }

    hasStore(key: string): boolean {
        return this.stores.has(key);
    }

    // ── System management ──────────────────────────────────────────────────

    addSystem(system: ISystem): void {
        this.systems.push(system);
        system.init?.();
    }

    getSystem<T extends ISystem>(name: string): T | undefined {
        return this.systems.find((s) => s.name === name) as T | undefined;
    }

    /** Runs all systems in registration order. */
    update(dt: number): void {
        if (this.paused) return;
        const scaledDt = dt * this.timeScale;
        this.tick++;
        this.matchTime += scaledDt;
        for (const sys of this.systems) {
            sys.update(scaledDt);
        }
        this.flushDestroyed();
    }

    dispose(): void {
        for (const sys of this.systems) sys.dispose?.();
        this.systems.length = 0;
        this.stores.clear();
        this.alive.clear();
        this.events.clear();
    }

    // ── Serialization helpers ──────────────────────────────────────────────

    serialize(): WorldSnapshot {
        const components: Record<string, Array<[EntityId, unknown]>> = {};
        for (const [key, store] of this.stores.entries()) {
            components[key] = [...store.entries()];
        }
        return {
            version: 1,
            seed: this.rng.seed,
            rngState: this.rng.getState(),
            tick: this.tick,
            matchTime: this.matchTime,
            nextEntityId: this.nextEntityId,
            aliveEntities: [...this.alive],
            components,
        };
    }

    deserialize(snap: WorldSnapshot): void {
        this.rng.setState(snap.rngState);
        this.tick = snap.tick;
        this.matchTime = snap.matchTime;
        this.nextEntityId = snap.nextEntityId;
        this.alive.clear();
        for (const id of snap.aliveEntities) this.alive.add(id);

        for (const [key, entries] of Object.entries(snap.components)) {
            const store = this.registerStore(key);
            store.clear();
            for (const [eid, data] of entries) {
                store.set(eid, data);
            }
        }
    }
}

export interface WorldSnapshot {
    version: number;
    seed: number;
    rngState: number;
    tick: number;
    matchTime: number;
    nextEntityId: number;
    aliveEntities: EntityId[];
    components: Record<string, Array<[EntityId, unknown]>>;
}
