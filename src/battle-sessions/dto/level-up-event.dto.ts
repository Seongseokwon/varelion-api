import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

// 레벨업 이벤트(FR-4) — 도달한 세션 레벨. 대조 시 최댓값만 쓴다.
export class LevelUpEventDto {
  @ApiProperty()
  @IsInt()
  @Min(2) // 레벨 1은 시작값이라 레벨업 이벤트로 올 수 없음
  level: number;
}
