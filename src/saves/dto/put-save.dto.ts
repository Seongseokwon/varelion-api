import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsObject, Min } from 'class-validator';
import { META_XP_BASE, META_XP_POW } from '../../config/game-balance';

export {
  GOLD_BASE_ALLOWANCE,
  MAX_GOLD_PER_SEC,
  MAX_XP_PER_SEC,
  META_XP_BASE,
  META_XP_POW,
  XP_BASE_ALLOWANCE,
} from '../../config/game-balance';

// save 본문을 중첩 DTO로 정의하지 않는 이유: 전역 ValidationPipe(whitelist:true)가
// 중첩 DTO에 없는 필드를 조용히 제거한다 — 프론트에 새 세이브 필드가 생기면 서버가
// 벗겨낸 뒤 "서버 우선" 다운로드로 로컬 데이터까지 유실된다(docs/save-sync/plan.md).
// 알려진 필드의 타입/범위는 SavesService에서 수동 검증하고, 미지 필드는 data JSONB에 보존한다.
export class PutSaveDto {
  @ApiProperty({
    description: '클라이언트가 아는 서버 세이브 version (최초 생성은 0)',
  })
  @IsInt()
  @Min(0)
  version: number;

  @ApiProperty({
    description: '프론트 save 객체 전체 (metaLevel/metaXp/gold + 나머지)',
    type: Object,
  })
  @IsObject()
  save: Record<string, unknown>;
}

// ---- FR-7 상식 검증 상수 (튜닝용 분리, docs/save-sync/plan.md 아키텍처 결정) ----
// 목표는 "즉석 대량 조작 차단"이지 밸런스 검증이 아니므로 실측 상한의 2~10배 여유를 둔다.
// 실측 근거(프론트 코드와 수동 동기화 대상):
//   XP: systems/flow.js earnedXp = time*2 + kills*1.5, 킬 상한 5/s(runs 모듈) → 최대 9.5/s
//   골드: systems/enemies.js 킬 4%×1 + 보스 15/45s → 최대 ≈0.53/s
// 기본 허용량: 정산 직후 업로드(경과≈0)와 시계 오차를 흡수 — 최대 1판치(XP 11400)의 ~2배.

// src/state/save.js(프론트)의 메타 레벨업 곡선 복제 — metaXp는 레벨업 시 차감되는
// "현재 레벨 내 잔여 XP"라서 증가폭 비교는 누적 총XP로 환산해야 한다.
export function metaXpFor(lv: number): number {
  return Math.floor(META_XP_BASE * Math.pow(lv, META_XP_POW));
}

export function totalMetaXp(metaLevel: number, metaXp: number): number {
  let total = metaXp;
  for (let lv = 1; lv < metaLevel; lv++) total += metaXpFor(lv);
  return total;
}
