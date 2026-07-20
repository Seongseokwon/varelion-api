import { BattleSessionsService } from './battle-sessions.service';
import { GOLD_TOLERANCE, KILL_TOLERANCE } from './reconciliation.constants';

describe('BattleSessionsService.reconcile', () => {
  const prisma = {
    battleSession: { updateMany: jest.fn() },
    battleEvent: { findMany: jest.fn() },
  };
  const service = new BattleSessionsService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('accepts a submission matching the event totals', async () => {
    prisma.battleSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.battleEvent.findMany.mockResolvedValue([
      { type: 'kills', payload: { killsDelta: 10, goldDelta: 7 } },
      { type: 'level-up', payload: { level: 3 } },
    ]);

    await expect(
      service.reconcile('session', 'user', {
        kills: 10,
        goldEarned: 7,
        level: 3,
      }),
    ).resolves.toEqual({ eligible: true, reason: 'ok' });
  });

  it('accepts tolerance boundaries and rejects values just outside them', async () => {
    prisma.battleSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.battleEvent.findMany.mockResolvedValue([
      { type: 'kills', payload: { killsDelta: 10, goldDelta: 10 } },
    ]);
    await expect(
      service.reconcile('session', 'user', {
        kills: 10 + KILL_TOLERANCE,
        goldEarned: 10 + GOLD_TOLERANCE,
        level: 1,
      }),
    ).resolves.toEqual({ eligible: true, reason: 'ok' });

    prisma.battleSession.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      service.reconcile('session', 'user', {
        kills: 11 + KILL_TOLERANCE,
        goldEarned: 10,
        level: 1,
      }),
    ).resolves.toEqual({ eligible: false, reason: 'mismatch' });
  });

  it('returns no-session when the conditional finalize loses the race', async () => {
    prisma.battleSession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.reconcile('session', 'user', {
        kills: 0,
        goldEarned: 0,
        level: 1,
      }),
    ).resolves.toEqual({ eligible: false, reason: 'no-session' });
    expect(prisma.battleEvent.findMany).not.toHaveBeenCalled();
  });
});
