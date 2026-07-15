import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

// 킬 배치 이벤트(FR-3) — 클라이언트가 5~10초 주기로 누적해 보내는 델타.
// 0 이상만 허용: 음수 델타로 남의 판(또는 자기 판)의 집계를 깎는 조작을 막는다.
export class KillBatchEventDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  killsDelta: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  goldDelta: number;
}
