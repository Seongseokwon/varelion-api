import { Module } from '@nestjs/common';
import { IdleRewardsController } from './idle-rewards.controller';
import { IdleRewardsService } from './idle-rewards.service';
@Module({ controllers: [IdleRewardsController], providers: [IdleRewardsService] })
export class IdleRewardsModule {}
