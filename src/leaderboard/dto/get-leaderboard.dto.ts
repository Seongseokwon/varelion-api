import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  DEFAULT_LEADERBOARD_LIMIT,
  MAX_LEADERBOARD_LIMIT,
} from '../leaderboard.service';

export class GetLeaderboardDto {
  @ApiPropertyOptional({
    default: DEFAULT_LEADERBOARD_LIMIT,
    maximum: MAX_LEADERBOARD_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LEADERBOARD_LIMIT)
  limit?: number;
}
