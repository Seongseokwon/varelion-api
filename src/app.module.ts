import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RunsModule } from './runs/runs.module';
import { SavesModule } from './saves/saves.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { BattleSessionsModule } from './battle-sessions/battle-sessions.module';
import { ScheduleModule } from '@nestjs/schedule';
import { IdleRewardsModule } from './idle-rewards/idle-rewards.module';
// LastGateModule is disabled, not deleted (2026-07-20): last-gate co-op is paused
// (see varelion-last-gate MEMORY.md), and this keeps its WebSocket gateway and
// `/last-gate/*` REST routes from being registered at all so no request can reach
// them. Re-add to the imports array below to resume.
// import { LastGateModule } from './last-gate/last-gate.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    RunsModule,
    SavesModule,
    LeaderboardModule,
    BattleSessionsModule,
    IdleRewardsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
