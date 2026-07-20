import { Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { IdleRewardsService } from './idle-rewards.service';
@ApiTags('idle-rewards')
@ApiBearerAuth()
@Controller('idle-rewards')
export class IdleRewardsController {
  constructor(private readonly service: IdleRewardsService) {}
  @Post('claim')
  @UseGuards(JwtAuthGuard)
  claim(@CurrentUser() user: CurrentUserPayload) {
    return this.service.claim(user.userId);
  }
}
