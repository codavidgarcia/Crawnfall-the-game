/**
 * Strongly-typed event bus.
 * All game events flow through this single pub/sub hub.
 */

export type EventHandler<T = unknown> = (payload: T) => void;

interface Subscription {
    type: string;
    handler: EventHandler<unknown>;
    once: boolean;
}

export class EventBus {
    private listeners = new Map<string, Subscription[]>();
    private queue: Array<{ type: string; payload: unknown }> = [];
    private processing = false;

    on<T>(type: string, handler: EventHandler<T>): () => void {
        const sub: Subscription = { type, handler: handler as EventHandler<unknown>, once: false };
        const list = this.listeners.get(type) ?? [];
        list.push(sub);
        this.listeners.set(type, list);
        return () => this.off(type, handler);
    }

    once<T>(type: string, handler: EventHandler<T>): () => void {
        const sub: Subscription = { type, handler: handler as EventHandler<unknown>, once: true };
        const list = this.listeners.get(type) ?? [];
        list.push(sub);
        this.listeners.set(type, list);
        return () => this.off(type, handler);
    }

    off<T>(type: string, handler: EventHandler<T>): void {
        const list = this.listeners.get(type);
        if (!list) return;
        const idx = list.findIndex((s) => s.handler === handler);
        if (idx !== -1) list.splice(idx, 1);
    }

    emit<T>(type: string, payload: T): void {
        this.queue.push({ type, payload });
        if (!this.processing) {
            this.flush();
        }
    }

    private flush(): void {
        this.processing = true;
        while (this.queue.length > 0) {
            const event = this.queue.shift()!;
            const list = this.listeners.get(event.type);
            if (list) {
                const toRemove: number[] = [];
                for (let i = 0; i < list.length; i++) {
                    list[i].handler(event.payload);
                    if (list[i].once) toRemove.push(i);
                }
                for (let i = toRemove.length - 1; i >= 0; i--) {
                    list.splice(toRemove[i], 1);
                }
            }
        }
        this.processing = false;
    }

    clear(): void {
        this.listeners.clear();
        this.queue.length = 0;
    }
}
