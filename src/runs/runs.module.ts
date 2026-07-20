import { Module } from '@nestjs/common';
import { BattleSessionsModule } from '../battle-sessions/battle-sessions.module';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

@Module({
  imports: [BattleSessionsModule], // 제출 시 세션 대조검증(reconcile)에 사용
  controllers: [RunsController],
  providers: [RunsService],
})
export class RunsModule {}
