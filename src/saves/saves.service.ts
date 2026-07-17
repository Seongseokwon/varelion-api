import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { GameSave, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { META_LEVEL_CAP } from '../runs/dto/create-run.dto';
import {
  GOLD_BASE_ALLOWANCE,
  MAX_GOLD_PER_SEC,
  MAX_XP_PER_SEC,
  PutSaveDto,
  totalMetaXp,
  XP_BASE_ALLOWANCE,
} from './dto/put-save.dto';

// 와이어 포맷은 GET/PUT/409 모두 { version, save } — 프론트 save 객체(flat)를 그대로
// 주고받고, 서버가 컬럼(metaLevel/metaXp/gold)과 data JSONB로 분해/조립한다.
export interface SaveResponse {
  version: number;
  save: Record<string, unknown>;
}

export interface PutResult {
  conflict: boolean;
  body: SaveResponse;
}

@Injectable()
export class SavesService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(userId: string): Promise<SaveResponse> {
    const row = await this.prisma.gameSave.findUnique({ where: { userId } });
    if (!row) throw new NotFoundException('save not found');
    return this.toResponse(row);
  }

  async putMine(userId: string, dto: PutSaveDto): Promise<PutResult> {
    const columns = this.validateKnownFields(dto.save);
    // 컬럼으로 승격되는 세 필드를 뺀 나머지 전부(미지 필드 포함)가 data JSONB에 저장된다.
    const data: Record<string, unknown> = { ...dto.save };
    delete data.metaLevel;
    delete data.metaXp;
    delete data.gold;

    const existing = await this.prisma.gameSave.findUnique({
      where: { userId },
    });

    if (!existing) {
      // 첫 업로드(FR-5): 기존 로컬/게스트 진행분의 최초 이관이라 기준선이 없으므로
      // 상식 검증은 생략한다(알려진 한계 — docs/save-sync/spec.md FR-7).
      const created = await this.prisma.gameSave.create({
        data: {
          userId,
          ...columns,
          data: data as Prisma.InputJsonObject,
          version: dto.version + 1,
        },
      });
      await this.recordMetaLevels(userId, 0, created.metaLevel);
      return { conflict: false, body: this.toResponse(created) };
    }

    if (existing.version !== dto.version) {
      // 409에 현재 서버 세이브를 동봉해 클라이언트가 재조회 없이 복구하게 한다(FR-4).
      return { conflict: true, body: this.toResponse(existing) };
    }

    this.assertPlausibleIncrease(existing, columns);

    // version 조건을 where에 함께 걸어 동시 요청 경합에서도 한쪽만 성공하게 한다(낙관적 잠금).
    const updated = await this.prisma.gameSave.updateMany({
      where: { userId, version: dto.version },
      data: {
        ...columns,
        data: data as Prisma.InputJsonObject,
        version: dto.version + 1,
        lastActiveAt: new Date(),
      },
    });
    if (updated.count === 0) {
      const current = await this.prisma.gameSave.findUnique({
        where: { userId },
      });
      // current가 없을 수는 없지만(방금 존재 확인), 방어적으로 존재 검사
      if (!current) throw new NotFoundException('save not found');
      return { conflict: true, body: this.toResponse(current) };
    }
    await this.recordMetaLevels(userId, existing.metaLevel, columns.metaLevel);
    return {
      conflict: false,
      body: { version: dto.version + 1, save: dto.save },
    };
  }

  private async recordMetaLevels(
    userId: string,
    before: number,
    after: number,
  ) {
    const reachedAt = new Date();
    for (let level = Math.max(1, before + 1); level <= after; level++) {
      await this.prisma.metaLevelReached.upsert({
        where: { userId_level: { userId, level } },
        create: { userId, level, reachedAt },
        update: {},
      });
    }
  }

  // FR-6: DTO는 save를 통짜 객체로 받으므로(미지 필드 보존) 알려진 필드는 여기서 검증한다.
  private validateKnownFields(save: Record<string, unknown>): {
    metaLevel: number;
    metaXp: number;
    gold: number;
  } {
    const { metaLevel, metaXp, gold } = save;
    if (
      !Number.isInteger(metaLevel) ||
      (metaLevel as number) < 1 ||
      (metaLevel as number) > META_LEVEL_CAP
    ) {
      throw new BadRequestException(
        `save.metaLevel must be an integer in 1..${META_LEVEL_CAP}`,
      );
    }
    if (!Number.isInteger(metaXp) || (metaXp as number) < 0) {
      throw new BadRequestException(
        'save.metaXp must be a non-negative integer',
      );
    }
    if (!Number.isInteger(gold) || (gold as number) < 0) {
      throw new BadRequestException('save.gold must be a non-negative integer');
    }
    return {
      metaLevel: metaLevel as number,
      metaXp: metaXp as number,
      gold: gold as number,
    };
  }

  // FR-7: 경과 시간 기반 상한 — 마지막 저장 이후 벽시계 시간으로 설명 가능한 증가만 허용.
  // Run 기록과 대조하지 않는 이유: 서버 접속 불가 중 플레이하면 Run은 유실되지만 세이브는
  // 정상 증가하므로, Run 합산 기준은 정상 유저를 영구 거절할 수 있다(docs/save-sync/plan.md).
  // 감소는 검증하지 않는다(DEV 초기화·향후 골드 소비처 대비).
  private assertPlausibleIncrease(
    existing: GameSave,
    next: { metaLevel: number; metaXp: number; gold: number },
  ) {
    const elapsedSec = Math.max(
      0,
      (Date.now() - existing.updatedAt.getTime()) / 1000,
    );
    const xpDelta =
      totalMetaXp(next.metaLevel, next.metaXp) -
      totalMetaXp(existing.metaLevel, existing.metaXp);
    if (xpDelta > XP_BASE_ALLOWANCE + MAX_XP_PER_SEC * elapsedSec) {
      throw new BadRequestException(
        'meta xp increase exceeds plausible rate for elapsed time',
      );
    }
    const goldDelta = next.gold - existing.gold;
    if (goldDelta > GOLD_BASE_ALLOWANCE + MAX_GOLD_PER_SEC * elapsedSec) {
      throw new BadRequestException(
        'gold increase exceeds plausible rate for elapsed time',
      );
    }
  }

  private toResponse(row: GameSave): SaveResponse {
    const data = (row.data ?? {}) as Record<string, unknown>;
    return {
      version: row.version,
      save: {
        ...data,
        metaLevel: row.metaLevel,
        metaXp: row.metaXp,
        gold: row.gold,
      },
    };
  }
}
