import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import {
  LAST_GATE_PROTOCOL_VERSION,
  type LastGatePlayer,
  type LastGatePlayerSlot,
  type LastGateRoom,
  type LastGateRoomSession,
  type LastGateRoomSnapshot,
} from './last-gate.types';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
const DISCONNECTED_ROOM_TTL_MS = 2 * 60 * 1000;
const WAITING_ROOM_TTL_MS = 3 * 60 * 1000;
const ROOM_CLEANUP_INTERVAL_MS = 30 * 1000;

export class LastGateRoomError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

@Injectable()
export class LastGateRoomService {
  private readonly rooms = new Map<string, LastGateRoom>();
  private readonly socketMemberships = new Map<
    string,
    { roomCode: string; slot: LastGatePlayerSlot }
  >();

  createRoom(socketId: string, protocolVersion: number): LastGateRoomSession {
    this.pruneExpiredRooms();
    this.assertProtocol(protocolVersion);
    this.leaveSocket(socketId);

    const room: LastGateRoom = {
      code: this.createUniqueRoomCode(),
      runSeed: randomBytes(4).readUInt32LE(0),
      protocolVersion,
      createdAt: Date.now(),
      players: new Map(),
    };
    const player = this.createPlayer(1, socketId);
    room.players.set(1, player);
    this.rooms.set(room.code, room);
    this.socketMemberships.set(socketId, { roomCode: room.code, slot: 1 });
    return this.toSession(room, player);
  }

  joinRoom(
    socketId: string,
    roomCode: string,
    protocolVersion: number,
  ): LastGateRoomSession {
    this.assertProtocol(protocolVersion);
    const room = this.getRoom(roomCode);
    if (room.protocolVersion !== protocolVersion)
      throw new LastGateRoomError('protocol-mismatch');
    if (room.players.size >= 2) throw new LastGateRoomError('room-full');

    this.leaveSocket(socketId);
    const player = this.createPlayer(2, socketId);
    room.players.set(2, player);
    this.socketMemberships.set(socketId, { roomCode: room.code, slot: 2 });
    return this.toSession(room, player);
  }

  resumeRoom(
    socketId: string,
    roomCode: string,
    reconnectToken: string,
  ): LastGateRoomSession {
    const room = this.getRoom(roomCode);
    const player = [...room.players.values()].find(
      (candidate) => candidate.reconnectToken === reconnectToken,
    );
    if (!player) throw new LastGateRoomError('invalid-reconnect-token');

    this.leaveSocket(socketId);
    if (player.socketId) this.socketMemberships.delete(player.socketId);
    player.socketId = socketId;
    player.disconnectedAt = null;
    this.socketMemberships.set(socketId, {
      roomCode: room.code,
      slot: player.slot,
    });
    return this.toSession(room, player);
  }

  disconnectSocket(socketId: string): void {
    const membership = this.socketMemberships.get(socketId);
    if (!membership) return;
    const room = this.rooms.get(membership.roomCode);
    const player = room?.players.get(membership.slot);
    if (player?.socketId === socketId) {
      player.socketId = null;
      player.disconnectedAt = Date.now();
    }
    this.socketMemberships.delete(socketId);
  }

  getMembership(socketId: string): {
    room: LastGateRoom;
    player: LastGatePlayer;
  } {
    const membership = this.socketMemberships.get(socketId);
    if (!membership) throw new LastGateRoomError('not-in-room');
    const room = this.rooms.get(membership.roomCode);
    const player = room?.players.get(membership.slot);
    if (!room || !player) throw new LastGateRoomError('room-not-found');
    return { room, player };
  }

  getSnapshot(roomCode: string): LastGateRoomSnapshot {
    const room = this.getRoom(roomCode);
    return {
      roomCode: room.code,
      runSeed: room.runSeed,
      protocolVersion: room.protocolVersion,
      status: room.players.size === 2 ? 'ready' : 'waiting',
      players: [...room.players.values()]
        .sort((left, right) => left.slot - right.slot)
        .map((player) => ({
          slot: player.slot,
          connected: player.socketId !== null,
        })),
    };
  }

  getRoomCount(): number {
    this.pruneExpiredRooms();
    return this.rooms.size;
  }

  @Interval('last-gate-room-cleanup', ROOM_CLEANUP_INTERVAL_MS)
  cleanupExpiredRooms(): void {
    this.pruneExpiredRooms();
  }

  private getRoom(roomCode: string): LastGateRoom {
    this.pruneExpiredRooms();
    const normalizedCode = roomCode.trim().toUpperCase();
    const room = this.rooms.get(normalizedCode);
    if (!room) throw new LastGateRoomError('room-not-found');
    return room;
  }

  private assertProtocol(protocolVersion: number): void {
    if (protocolVersion !== LAST_GATE_PROTOCOL_VERSION) {
      throw new LastGateRoomError('protocol-mismatch');
    }
  }

  private createPlayer(
    slot: LastGatePlayerSlot,
    socketId: string,
  ): LastGatePlayer {
    return {
      slot,
      socketId,
      reconnectToken: randomUUID(),
      disconnectedAt: null,
    };
  }

  private createUniqueRoomCode(): string {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      let code = '';
      for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new LastGateRoomError('room-code-exhausted');
  }

  private toSession(
    room: LastGateRoom,
    player: LastGatePlayer,
  ): LastGateRoomSession {
    return {
      roomCode: room.code,
      runSeed: room.runSeed,
      protocolVersion: room.protocolVersion,
      playerSlot: player.slot,
      reconnectToken: player.reconnectToken,
      status: room.players.size === 2 ? 'ready' : 'waiting',
    };
  }

  private leaveSocket(socketId: string): void {
    const membership = this.socketMemberships.get(socketId);
    if (!membership) return;
    const room = this.rooms.get(membership.roomCode);
    room?.players.delete(membership.slot);
    this.socketMemberships.delete(socketId);
    if (room?.players.size === 0) this.rooms.delete(room.code);
  }

  private pruneExpiredRooms(now = Date.now()): void {
    for (const room of this.rooms.values()) {
      const players = [...room.players.values()];
      const waitingRoomExpired =
        players.length < 2 && now - room.createdAt >= WAITING_ROOM_TTL_MS;
      const allDisconnected = players.every(
        (player) => player.socketId === null,
      );
      const lastDisconnect = Math.max(
        ...players.map((player) => player.disconnectedAt ?? room.createdAt),
      );
      const disconnectedRoomExpired =
        allDisconnected && now - lastDisconnect >= DISCONNECTED_ROOM_TTL_MS;
      if (waitingRoomExpired || disconnectedRoomExpired) {
        this.deleteRoom(room);
      }
    }
  }

  private deleteRoom(room: LastGateRoom): void {
    for (const player of room.players.values()) {
      if (player.socketId) this.socketMemberships.delete(player.socketId);
    }
    this.rooms.delete(room.code);
  }
}
