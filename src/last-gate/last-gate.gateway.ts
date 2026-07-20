import { Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import {
  LastGateRoomError,
  LastGateRoomService,
} from './last-gate-room.service';
import type { LastGateInputFrame } from './last-gate.types';

const MAX_INPUT_MESSAGES_PER_SECOND = 120;
const MAX_ROOM_OPERATIONS_PER_MINUTE = 10;

function verifyOrigin(
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
) {
  if (!origin) {
    callback(null, true);
    return;
  }
  const allowedOrigins =
    process.env.CORS_ORIGIN?.split(',').map((value) => value.trim()) ?? [];
  if (allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error('WebSocket origin is not allowed.'));
}

interface CreateRoomMessage {
  protocolVersion: number;
}

interface JoinRoomMessage extends CreateRoomMessage {
  roomCode: string;
}

interface ResumeRoomMessage {
  roomCode: string;
  reconnectToken: string;
}

interface RateWindow {
  startedAt: number;
  count: number;
}

@SkipThrottle()
@WebSocketGateway({
  namespace: '/last-gate',
  transports: ['websocket'],
  cors: { origin: verifyOrigin, credentials: true },
})
export class LastGateGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(LastGateGateway.name);
  private readonly inputRateWindows = new Map<string, RateWindow>();
  private readonly roomRateWindows = new Map<string, RateWindow>();

  constructor(private readonly rooms: LastGateRoomService) {}

  handleConnection(client: Socket): void {
    this.logger.debug(`connected ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.rooms.disconnectSocket(client.id);
    this.inputRateWindows.delete(client.id);
    this.roomRateWindows.delete(client.id);
  }

  @SubscribeMessage('room:create')
  async createRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: CreateRoomMessage,
  ) {
    this.assertRoomOperationRateLimit(client.id);
    return this.handleRoomOperation(client, () =>
      this.rooms.createRoom(client.id, message?.protocolVersion),
    );
  }

  @SubscribeMessage('room:join')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: JoinRoomMessage,
  ) {
    this.assertRoomOperationRateLimit(client.id);
    return this.handleRoomOperation(client, () =>
      this.rooms.joinRoom(
        client.id,
        message?.roomCode ?? '',
        message?.protocolVersion,
      ),
    );
  }

  @SubscribeMessage('room:resume')
  async resumeRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() message: ResumeRoomMessage,
  ) {
    this.assertRoomOperationRateLimit(client.id);
    return this.handleRoomOperation(client, () =>
      this.rooms.resumeRoom(
        client.id,
        message?.roomCode ?? '',
        message?.reconnectToken ?? '',
      ),
    );
  }

  @SubscribeMessage('input:relay')
  relayInput(
    @ConnectedSocket() client: Socket,
    @MessageBody() frame: LastGateInputFrame,
  ) {
    this.assertRateLimit(client.id);
    this.assertInputFrame(frame);
    const { room, player } = this.rooms.getMembership(client.id);
    client
      .to(room.code)
      .emit('input:remote', { ...frame, playerSlot: player.slot });
    return {
      event: 'input:accepted',
      data: { tick: frame.tick, sequence: frame.sequence },
    };
  }

  private async handleRoomOperation(
    client: Socket,
    operation: () => ReturnType<LastGateRoomService['createRoom']>,
  ) {
    try {
      const session = operation();
      for (const joinedRoom of client.rooms) {
        if (joinedRoom !== client.id) await client.leave(joinedRoom);
      }
      await client.join(session.roomCode);
      const snapshot = this.rooms.getSnapshot(session.roomCode);
      this.server.to(session.roomCode).emit('room:state', snapshot);
      return { event: 'room:session', data: session };
    } catch (error) {
      if (error instanceof LastGateRoomError)
        throw new WsException({ code: error.code });
      throw error;
    }
  }

  private assertInputFrame(frame: LastGateInputFrame): void {
    const validInput =
      frame &&
      Number.isSafeInteger(frame.tick) &&
      frame.tick >= 0 &&
      Number.isSafeInteger(frame.sequence) &&
      frame.sequence >= 0 &&
      frame.input !== null &&
      typeof frame.input === 'object' &&
      !Array.isArray(frame.input) &&
      Object.keys(frame.input).length <= 16 &&
      Object.values(frame.input).every(
        (value) =>
          value === null ||
          typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value)) ||
          (typeof value === 'string' && value.length <= 64),
      );
    if (!validInput) throw new WsException({ code: 'invalid-input-frame' });
  }

  private assertRateLimit(socketId: string): void {
    const now = Date.now();
    const window = this.inputRateWindows.get(socketId);
    if (!window || now - window.startedAt >= 1000) {
      this.inputRateWindows.set(socketId, { startedAt: now, count: 1 });
      return;
    }
    window.count += 1;
    if (window.count > MAX_INPUT_MESSAGES_PER_SECOND) {
      throw new WsException({ code: 'input-rate-exceeded' });
    }
  }

  private assertRoomOperationRateLimit(socketId: string): void {
    const now = Date.now();
    const window = this.roomRateWindows.get(socketId);
    if (!window || now - window.startedAt >= 60_000) {
      this.roomRateWindows.set(socketId, { startedAt: now, count: 1 });
      return;
    }
    window.count += 1;
    if (window.count > MAX_ROOM_OPERATIONS_PER_MINUTE) {
      throw new WsException({ code: 'room-rate-exceeded' });
    }
  }
}
