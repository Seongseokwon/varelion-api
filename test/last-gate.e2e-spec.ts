import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import { LastGateModule } from '../src/last-gate/last-gate.module';
import { LAST_GATE_PROTOCOL_VERSION } from '../src/last-gate/last-gate.types';

interface RoomSession {
  roomCode: string;
  runSeed: number;
  playerSlot: number;
  reconnectToken: string;
}

function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      3000,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}

describe('LastGateGateway (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const clients: Socket[] = [];

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [LastGateModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = `${await app.getUrl()}/last-gate`;
  });

  afterAll(async () => {
    for (const client of clients) client.disconnect();
    await app.close();
  });

  function connect(): Promise<Socket> {
    const client = io(baseUrl, { transports: ['websocket'], forceNew: true });
    clients.push(client);
    return new Promise((resolve, reject) => {
      client.once('connect', () => resolve(client));
      client.once('connect_error', reject);
    });
  }

  it('creates, joins, relays input, and resumes a room', async () => {
    const host = await connect();
    const hostSessionPromise = waitForEvent<RoomSession>(host, 'room:session');
    host.emit('room:create', { protocolVersion: LAST_GATE_PROTOCOL_VERSION });
    const hostSession = await hostSessionPromise;

    const guest = await connect();
    const guestSessionPromise = waitForEvent<RoomSession>(
      guest,
      'room:session',
    );
    guest.emit('room:join', {
      roomCode: hostSession.roomCode,
      protocolVersion: LAST_GATE_PROTOCOL_VERSION,
    });
    const guestSession = await guestSessionPromise;
    expect(guestSession.runSeed).toBe(hostSession.runSeed);
    expect(guestSession.playerSlot).toBe(2);

    const remoteInputPromise = waitForEvent<{
      tick: number;
      sequence: number;
      playerSlot: number;
    }>(guest, 'input:remote');
    host.emit('input:relay', {
      tick: 12,
      sequence: 3,
      input: { moveX: 1, skillQ: false },
    });
    await expect(remoteInputPromise).resolves.toMatchObject({
      tick: 12,
      sequence: 3,
      playerSlot: 1,
    });

    host.disconnect();
    const resumedHost = await connect();
    const resumedSessionPromise = waitForEvent<RoomSession>(
      resumedHost,
      'room:session',
    );
    resumedHost.emit('room:resume', {
      roomCode: hostSession.roomCode,
      reconnectToken: hostSession.reconnectToken,
    });
    await expect(resumedSessionPromise).resolves.toMatchObject({
      roomCode: hostSession.roomCode,
      playerSlot: 1,
      reconnectToken: hostSession.reconnectToken,
    });
  });
});
