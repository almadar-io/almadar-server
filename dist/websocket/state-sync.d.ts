/**
 * State Sync WebSocket Handler
 *
 * Provides real-time state synchronization using Socket.IO.
 *
 * @packageDocumentation
 */
interface Socket {
    data: {
        user: {
            uid: string;
            roles: string[];
            orgId?: string;
        };
    };
    handshake: {
        auth: {
            token: string;
            clientId: string;
        };
    };
    join: (room: string) => void;
    leave: (room: string) => void;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    emit: (event: string, ...args: unknown[]) => void;
    to: (room: string) => {
        emit: (event: string, ...args: unknown[]) => void;
    };
}
interface SocketServer {
    use: (middleware: (socket: Socket, next: (err?: Error) => void) => void) => void;
    on: (event: string, handler: (socket: Socket) => void) => void;
}
/**
 * Set up state sync WebSocket with Firebase Auth
 */
export declare function setupStateSyncWebSocket(io: SocketServer): void;
export {};
//# sourceMappingURL=state-sync.d.ts.map