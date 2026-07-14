import {
  Controller,
  Get,
  NotFoundException,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { GetLeaderboardDto } from './dto/get-leaderboard.dto';
import {
  DEFAULT_LEADERBOARD_LIMIT,
  LeaderboardService,
} from './leaderboard.service';

@ApiTags('leaderboard')
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get()
  getTop(@Query() query: GetLeaderboardDto) {
    return this.leaderboardService.getTop(
      query.limit ?? DEFAULT_LEADERBOARD_LIMIT,
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getMyRank(@CurrentUser() user: CurrentUserPayload) {
    const result = await this.leaderboardService.getMyRank(user.userId);
    if (!result) {
      throw new NotFoundException('no run submitted yet');
    }
    return result;
  }
}
