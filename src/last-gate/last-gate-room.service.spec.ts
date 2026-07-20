import { LAST_GATE_PROTOCOL_VERSION } from './last-gate.types';
import {
  LastGateRoomError,
  LastGateRoomService,
} from './last-gate-room.service';

describe('LastGateRoomService', () => {
  let service: LastGateRoomService;

  beforeEach(() => {
    service = new LastGateRoomService();
  });

  it('creates a waiting room with a host-owned run seed', () => {
    const session = service.createRoom(
      'host-socket',
      LAST_GATE_PROTOCOL_VERSION,
    );

    expect(session.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(session.playerSlot).toBe(1);
    expect(session.status).toBe('waiting');
    expect(session.runSeed).toBeGreaterThanOrEqual(0);
    expect(service.getSnapshot(session.roomCode).players).toEqual([
      { slot: 1, connected: true },
    ]);
  });

  it('fills the second slot and rejects a third player', () => {
    const host = service.createRoom('host-socket', LAST_GATE_PROTOCOL_VERSION);
    const guest = service.joinRoom(
      'guest-socket',
      host.roomCode,
      LAST_GATE_PROTOCOL_VERSION,
    );

    expect(guest.playerSlot).toBe(2);
    expect(guest.runSeed).toBe(host.runSeed);
    expect(guest.status).toBe('ready');
    expect(() =>
      service.joinRoom(
        'third-socket',
        host.roomCode,
        LAST_GATE_PROTOCOL_VERSION,
      ),
    ).toThrow(new LastGateRoomError('room-full'));
  });

  it('restores the same slot with a reconnect token', () => {
    const host = service.createRoom('host-socket', LAST_GATE_PROTOCOL_VERSION);
    service.disconnectSocket('host-socket');

    const resumed = service.resumeRoom(
      'new-host-socket',
      host.roomCode,
      host.reconnectToken,
    );

    expect(resumed.playerSlot).toBe(1);
    expect(resumed.reconnectToken).toBe(host.reconnectToken);
    expect(service.getSnapshot(host.roomCode).players[0]).toEqual({
      slot: 1,
      connected: true,
    });
  });

  it('rejects clients using another protocol version', () => {
    expect(() => service.createRoom('host-socket', 999)).toThrow(
      new LastGateRoomError('protocol-mismatch'),
    );
  });

  it('removes a waiting room when no guest joins for three minutes', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const host = service.createRoom('host-socket', LAST_GATE_PROTOCOL_VERSION);

    jest.spyOn(Date, 'now').mockReturnValue(3 * 60 * 1000 + 1_000);
    service.cleanupExpiredRooms();

    expect(service.getRoomCount()).toBe(0);
    expect(() => service.getSnapshot(host.roomCode)).toThrow(
      new LastGateRoomError('room-not-found'),
    );
    expect(() => service.getMembership('host-socket')).toThrow(
      new LastGateRoomError('not-in-room'),
    );
  });

  it('keeps a full room after the waiting-room timeout', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const host = service.createRoom('host-socket', LAST_GATE_PROTOCOL_VERSION);
    service.joinRoom('guest-socket', host.roomCode, LAST_GATE_PROTOCOL_VERSION);

    jest.spyOn(Date, 'now').mockReturnValue(3 * 60 * 1000 + 1_000);
    service.cleanupExpiredRooms();

    expect(service.getRoomCount()).toBe(1);
  });
});
