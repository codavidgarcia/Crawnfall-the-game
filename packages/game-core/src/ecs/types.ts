/**
 * Lightweight ECS type definitions.
 * - Entities are numeric IDs.
 * - Components are plain data objects stored in ComponentStore maps.
 * - Systems implement ISystem and operate on the World.
 */

export type EntityId = number;

/** Component store — one per component type. */
export class ComponentStore<T> {
    private data = new Map<EntityId, T>();

    set(entity: EntityId, component: T): void {
        this.data.set(entity, component);
    }

    get(entity: EntityId): T | undefined {
        return this.data.get(entity);
    }

    has(entity: EntityId): boolean {
        return this.data.has(entity);
    }

    delete(entity: EntityId): boolean {
        return this.data.delete(entity);
    }

    entries(): IterableIterator<[EntityId, T]> {
        return this.data.entries();
    }

    values(): IterableIterator<T> {
        return this.data.values();
    }

    keys(): IterableIterator<EntityId> {
        return this.data.keys();
    }

    get size(): number {
        return this.data.size;
    }

    clear(): void {
        this.data.clear();
    }

    /** Iterate entities that THIS store contains */
    forEach(fn: (component: T, entity: EntityId) => void): void {
        this.data.forEach((comp, eid) => fn(comp, eid));
    }
}

export interface ISystem {
    readonly name: string;
    /** Called every fixed simulation tick (dt is fixed-step in seconds). */
    update(dt: number): void;
    /** Optional init hook when system is registered. */
    init?(): void;
    /** Optional cleanup hook. */
    dispose?(): void;
}
