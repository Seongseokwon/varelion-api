import { Module } from '@nestjs/common';
import { BattleSessionsController } from './battle-sessions.controller';
import { BattleSessionsService } from './battle-sessions.service';

@Module({
  controllers: [BattleSessionsController],
  providers: [BattleSessionsService],
  exports: [BattleSessionsService], // RunsService가 제출 시 reconcile()에 사용
})
export class BattleSessionsModule {}
