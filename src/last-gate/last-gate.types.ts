export const LAST_GATE_PROTOCOL_VERSION = 1;
export const LAST_GATE_ROOM_SIZE = 2;

export type LastGatePlayerSlot = 1 | 2;
export type LastGateRoomStatus = 'waiting' | 'ready';

export interface LastGatePlayer {
  slot: LastGatePlayerSlot;
  reconnectToken: string;
  socketId: string | null;
  disconnectedAt: number | null;
}

export interface LastGateRoom {
  code: string;
  runSeed: number;
  protocolVersion: number;
  createdAt: number;
  players: Map<LastGatePlayerSlot, LastGatePlayer>;
}

export interface LastGateRoomSession {
  roomCode: string;
  runSeed: number;
  protocolVersion: number;
  playerSlot: LastGatePlayerSlot;
  reconnectToken: string;
  status: LastGateRoomStatus;
}

export interface LastGateRoomSnapshot {
  roomCode: string;
  runSeed: number;
  protocolVersion: number;
  status: LastGateRoomStatus;
  players: Array<{ slot: LastGatePlayerSlot; connected: boolean }>;
}

export interface LastGateInputFrame {
  tick: number;
  sequence: number;
  input: Record<string, boolean | number | string | null>;
}
