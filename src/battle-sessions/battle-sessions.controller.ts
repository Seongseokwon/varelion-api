import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { BattleSessionsService } from './battle-sessions.service';
import { KillBatchEventDto } from './dto/kill-batch-event.dto';
import { LevelUpEventDto } from './dto/level-up-event.dto';
import { StageClearEventDto } from './dto/stage-clear-event.dto';

// 이벤트 API는 전역 한도(10회/60초)보다 상향 — 킬 배치(7초 주기, 분당 ~8회)에
// 레벨업·스테이지클리어·세션 생성이 겹치면 정상 플레이가 429를 받을 수 있다(plan.md).
const EVENT_THROTTLE = { default: { ttl: 60000, limit: 30 } };

@ApiTags('battle-sessions')
@ApiBearerAuth()
@Controller('battle-sessions')
export class BattleSessionsController {
  constructor(private readonly battleSessionsService: BattleSessionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: CurrentUserPayload) {
    return this.battleSessionsService.create(user.userId);
  }

  @Post(':id/events/kills')
  @UseGuards(JwtAuthGuard)
  @Throttle(EVENT_THROTTLE)
  recordKills(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') sessionId: string,
    @Body() dto: KillBatchEventDto,
  ) {
    return this.battleSessionsService.recordEvent(
      sessionId,
      user.userId,
      'kills',
      {
        killsDelta: dto.killsDelta,
        goldDelta: dto.goldDelta,
      },
    );
  }

  @Post(':id/events/level-up')
  @UseGuards(JwtAuthGuard)
  @Throttle(EVENT_THROTTLE)
  recordLevelUp(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') sessionId: string,
    @Body() dto: LevelUpEventDto,
  ) {
    return this.battleSessionsService.recordEvent(
      sessionId,
      user.userId,
      'level-up',
      {
        level: dto.level,
      },
    );
  }

  @Post(':id/events/stage-clear')
  @UseGuards(JwtAuthGuard)
  @Throttle(EVENT_THROTTLE)
  recordStageClear(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') sessionId: string,
    @Body() dto: StageClearEventDto,
  ) {
    return this.battleSessionsService.recordEvent(
      sessionId,
      user.userId,
      'stage-clear',
      {
        stageId: dto.stageId,
      },
    );
  }
}
