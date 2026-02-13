/**
 * NetworkInterface — Stub interfaces for future authoritative server networking.
 * 
 * ROADMAP: Replace stub implementation with WebSocket/WebRTC transport.
 * The simulation module ONLY interacts through these interfaces,
 * meaning the game-core never depends on any specific network library.
 */

export interface NetworkMessage {
    type: string;
    tick: number;
    payload: unknown;
}

export interface INetworkAdapter {
    /** Connect to a game server */
    connect(url: string, token: string): Promise<boolean>;
    /** Disconnect from game server */
    disconnect(): void;
    /** Send a command to the server */
    send(message: NetworkMessage): void;
    /** Register a handler for incoming messages */
    onMessage(handler: (message: NetworkMessage) => void): void;
    /** Connection state */
    readonly connected: boolean;
    /** Latency in ms */
    readonly latency: number;
}

/**
 * StubNetworkAdapter — local-only pass-through.
 * All commands are applied immediately to the local simulation.
 */
export class StubNetworkAdapter implements INetworkAdapter {
    connected = false;
    latency = 0;
    private handlers: Array<(msg: NetworkMessage) => void> = [];

    async connect(_url: string, _token: string): Promise<boolean> {
        this.connected = true;
        return true;
    }

    disconnect(): void {
        this.connected = false;
    }

    send(message: NetworkMessage): void {
        // In local mode, echo back immediately (authoritative server would validate)
        for (const handler of this.handlers) {
            handler(message);
        }
    }

    onMessage(handler: (message: NetworkMessage) => void): void {
        this.handlers.push(handler);
    }
}
