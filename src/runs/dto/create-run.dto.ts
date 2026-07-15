import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// src/data/jobs.js(survival-rpg 프론트)의 직업 id와 수동으로 동기화해야 함 —
// 모노레포지만 타입 공유 설정이 없어 백엔드에 별도로 하드코딩함.
export const VALID_JOB_IDS = [
  'novice',
  'warrior',
  'barbarian',
  'berserker',
  'warlord',
] as const;

// 생존시간 상한(초). 상식 검증용 — BACKEND_DESIGN §7 예시(20분)를 따른 튜닝 전 placeholder.
export const MAX_SURVIVAL_TIME_SEC = 1200;

// src/state/save.js(survival-rpg 프론트)의 META_LEVEL_CAP과 수동으로 동기화해야 함.
export const META_LEVEL_CAP = 100;

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
