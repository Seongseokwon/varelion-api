import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BattleSessionsService } from '../battle-sessions/battle-sessions.service';
import { CreateRunDto } from './dto/create-run.dto';

// "물리적으로 불가능한" 제출만 거르기 위한 여유 있는 상한 — 밸런스 검증이 아니라
// 명백한 조작 차단이 목적. docs/landing-auth-leaderboard/plan.md 참고.
const MAX_KILLS_PER_SEC = 5;

@Injectable()
export class RunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly battleSessionsService: BattleSessionsService,
  ) {}

  async create(userId: string, dto: CreateRunDto) {
    // 물리적 상식 검증(400 거부) — 세션 대조검증과 독립적으로 그대로 유지(FR-9).
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

    // 세션 이벤트 로그 대조검증(FR-6~8) — 실패해도 저장은 하되 리더보드에서만 제외.
    // sessionId가 없으면 'no-session'과 동일하게 eligible=false(FR-8).
    const reconciliation = dto.sessionId
      ? await this.battleSessionsService.reconcile(dto.sessionId, userId, {
          kills: dto.kills,
          level: dto.level,
          goldEarned: dto.goldEarned,
        })
      : { eligible: false as const, reason: 'no-session' as const };

    return this.prisma.run.create({
      data: {
        userId,
        job: dto.job,
        survivalTime: dto.survivalTime,
        kills: dto.kills,
        level: dto.level,
        goldEarned: dto.goldEarned,
        metaLevel: dto.metaLevel,
        // 'no-session'은 존재하지 않는 세션 id일 수 있어 FK 위반 방지를 위해 연결하지 않음
        sessionId:
          reconciliation.reason === 'no-session' ? null : dto.sessionId,
        leaderboardEligible: reconciliation.eligible,
      },
    });
  }
}
