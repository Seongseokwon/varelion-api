import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GOLD_TOLERANCE, KILL_TOLERANCE } from './reconciliation.constants';

export const SESSION_STATUS_ACTIVE = 'active';
export const SESSION_STATUS_FINALIZED = 'finalized';

export type BattleEventType = 'kills' | 'level-up' | 'stage-clear';

export interface ReconcileSubmission {
  kills: number;
  level: number;
  goldEarned: number;
}

export interface ReconcileResult {
  eligible: boolean;
  // 'ok' | 'mismatch' | 'no-session' — 로그·튜닝용. 클라이언트 응답에는 노출하지 않는다.
  reason: 'ok' | 'mismatch' | 'no-session';
}

@Injectable()
export class BattleSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string) {
    const session = await this.prisma.battleSession.create({
      data: { userId },
    });
    return { id: session.id, startedAt: session.startedAt };
  }

  // 존재/소유/active 여부를 하나로 묶어 404 — 다른 유저 세션을 찔러봐도
  // "존재하지 않음"과 구분되지 않게 해 정보 노출을 최소화한다(plan.md 아키텍처 결정).
  async recordEvent(
    sessionId: string,
    userId: string,
    type: BattleEventType,
    payload: Prisma.InputJsonValue,
  ) {
    const session = await this.prisma.battleSession.findFirst({
      where: { id: sessionId, userId, status: SESSION_STATUS_ACTIVE },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('session not found');
    await this.prisma.battleEvent.create({
      data: { sessionId, type, payload },
    });
    return { ok: true };
  }

  // POST /runs 제출 시 호출(FR-6~8). 세션의 이벤트 로그 합계와 제출값을 대조하고
  // 세션을 finalize한다. 세션 부재/소유 불일치/이미 종료면 'no-session'으로
  // eligible=false — 제출 자체를 거부하지는 않는다(FR-8, 하드 거부 아님).
  async reconcile(
    sessionId: string,
    userId: string,
    submission: ReconcileSubmission,
  ): Promise<ReconcileResult> {
    // finalize를 조건부 updateMany로 먼저 수행 — 같은 세션으로 중복 제출이 와도
    // 한 요청만 active→finalized 전이에 성공하고 나머지는 no-session이 된다.
    const finalized = await this.prisma.battleSession.updateMany({
      where: { id: sessionId, userId, status: SESSION_STATUS_ACTIVE },
      data: { status: SESSION_STATUS_FINALIZED, finalizedAt: new Date() },
    });
    if (finalized.count === 0) return { eligible: false, reason: 'no-session' };

    const events = await this.prisma.battleEvent.findMany({
      where: { sessionId },
      select: { type: true, payload: true },
    });
    let loggedKills = 0;
    let loggedGold = 0;
    let loggedMaxLevel = 1; // 세션 레벨은 1에서 시작 — 레벨업 이벤트가 없으면 1
    for (const event of events) {
      const payload = event.payload as Record<string, unknown>;
      if (event.type === 'kills') {
        loggedKills +=
          typeof payload.killsDelta === 'number' ? payload.killsDelta : 0;
        loggedGold +=
          typeof payload.goldDelta === 'number' ? payload.goldDelta : 0;
      } else if (event.type === 'level-up') {
        const level = typeof payload.level === 'number' ? payload.level : 1;
        if (level > loggedMaxLevel) loggedMaxLevel = level;
      }
    }

    // 제출값이 로그 합계를 허용 오차 이상 "초과"할 때만 불일치 — 미달(이벤트 유실보다
    // 제출값이 작은 경우)은 리더보드에 유리하지 않으므로 판정하지 않는다.
    const mismatch =
      submission.kills > loggedKills + KILL_TOLERANCE ||
      submission.goldEarned > loggedGold + GOLD_TOLERANCE ||
      submission.level > loggedMaxLevel;
    return mismatch
      ? { eligible: false, reason: 'mismatch' }
      : { eligible: true, reason: 'ok' };
  }
}
