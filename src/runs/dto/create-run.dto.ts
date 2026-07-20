import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { META_LEVEL_CAP, VALID_JOB_IDS } from '../../config/game-balance';

export { META_LEVEL_CAP, VALID_JOB_IDS } from '../../config/game-balance';

// 생존시간 상한(초). 상식 검증용 — BACKEND_DESIGN §7 예시(20분)를 따른 튜닝 전 placeholder.
export const MAX_SURVIVAL_TIME_SEC = 1200;

export class CreateRunDto {
  @ApiProperty({ enum: VALID_JOB_IDS })
  @IsIn(VALID_JOB_IDS)
  job: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(MAX_SURVIVAL_TIME_SEC)
  survivalTime: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  kills: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  level: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  goldEarned: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(META_LEVEL_CAP)
  metaLevel: number;

  // battle-session-validation FR-6/FR-8: 없으면(구 클라이언트·세션 생성 실패) 요청은
  // 그대로 처리되고 leaderboardEligible=false로만 저장된다 — 하위 호환 유지.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string;
}
