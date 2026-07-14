import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRunDto } from './dto/create-run.dto';

// "물리적으로 불가능한" 제출만 거르기 위한 여유 있는 상한 — 밸런스 검증이 아니라
// 명백한 조작 차단이 목적. docs/landing-auth-leaderboard/plan.md 참고.
const MAX_KILLS_PER_SEC = 5;

@Injectable()
export class RunsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateRunDto) {
    if (dto.kills > dto.survivalTime * MAX_KILLS_PER_SEC) {
      throw new BadRequestException(
        'kills exceed plausible rate for survivalTime',
      );
    }

    const lastRun = await this.prisma.run.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (lastRun) {
      const secondsSinceLastRun =
        (Date.now() - lastRun.createdAt.getTime()) / 1000;
      if (secondsSinceLastRun < dto.survivalTime) {
        throw new BadRequestException(
          'submission interval shorter than claimed survivalTime',
        );
      }
    }

    return this.prisma.run.create({
      data: {
        userId,
        job: dto.job,
        survivalTime: dto.survivalTime,
        kills: dto.kills,
        level: dto.level,
        goldEarned: dto.goldEarned,
        metaLevel: dto.metaLevel,
      },
    });
  }
}
