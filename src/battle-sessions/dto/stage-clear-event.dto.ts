import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

// 스테이지 클리어 이벤트(FR-5) — 이번 범위에서는 기록만 하고 pass/fail 판정에는
// 쓰지 않는다(CreateRunDto에 대조할 stage 필드가 없음 — plan.md 아키텍처 결정).
export class StageClearEventDto {
  @ApiProperty()
  @IsString()
  @MaxLength(32)
  stageId: string;
}
