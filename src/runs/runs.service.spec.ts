import { BadRequestException } from '@nestjs/common';
import { RunsService } from './runs.service';
import { CreateRunDto } from './dto/create-run.dto';

describe('RunsService.create', () => {
  const prisma = {
    run: { findFirst: jest.fn(), create: jest.fn() },
  };
  const battleSessions = { reconcile: jest.fn() };
  const service = new RunsService(prisma as never, battleSessions as never);
  const dto: CreateRunDto = {
    job: 'novice',
    survivalTime: 10,
    kills: 50,
    level: 1,
    goldEarned: 0,
    metaLevel: 1,
  };

  beforeEach(() => jest.clearAllMocks());

  it('rejects an impossible kills-per-second ratio', async () => {
    await expect(
      service.create('user', { ...dto, kills: 51 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.run.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a submission interval shorter than the claimed survival time', async () => {
    prisma.run.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 5_000),
    });

    await expect(service.create('user', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.run.create).not.toHaveBeenCalled();
  });

  it('stores a run without a session as leaderboard-ineligible', async () => {
    prisma.run.findFirst.mockResolvedValue(null);
    prisma.run.create.mockResolvedValue({
      userId: 'user',
      ...dto,
      sessionId: null,
      leaderboardEligible: false,
    });

    await expect(service.create('user', dto)).resolves.toMatchObject({
      sessionId: null,
      leaderboardEligible: false,
    });
    expect(battleSessions.reconcile).not.toHaveBeenCalled();
  });
});
