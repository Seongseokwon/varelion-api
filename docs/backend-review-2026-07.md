# 백엔드 전체 점검 체크리스트 (2026-07)

> 작성 2026-07-17 · 근거: DB 스키마(`prisma/schema.prisma`) + 전 모듈 소스 + 마이그레이션 이력 전체 리뷰
> 프로젝트가 커지는 시점에 진행한 1회성 점검. 신규 이슈가 아니라 "지금 고쳐두면 나중에 편한 것" 위주.
> **역할 분담**: 구현은 사용자, QA(검증)는 Claude가 진행. 각 항목은 두 단계로 완료된다.
> - **구현 완료**: 코드/마이그레이션 변경이 실제로 적용됨 (체크는 구현자가)
> - **QA 검증 완료**: 변경이 의도대로 동작하는지 확인됨 (체크는 QA가, 확인 방법은 각 항목 "QA 방법" 참고)

## 상태 요약

| # | 항목 | 우선순위 | 구현 완료 | QA 완료 |
|---|------|----------|:---:|:---:|
| 1 | RefreshToken.tokenHash 인덱스 추가 | 🔴 | ☑ | ☐ |
| 2 | RefreshToken 만료/폐기 토큰 정리 | 🔴 | ☑ | ☐ |
| 3 | Run_survivalTime_idx 죽은 인덱스 정리 | 🔴 | ☑ | ☐ |
| 4 | 리더보드 쿼리 캐싱 전환 기준 수립 | 🟡 | ☑ | ☐ |
| 5 | leaderboard.service.ts 쿼리 중복 제거 | 🟡 | ☑ | ☐ |
| 6 | 프론트-백 상수 동기화 구조 개선 | 🟡 | ☑ | ☐ |
| 7 | battle-sessions/runs 유닛 테스트 추가 | 🟡 | ☑ | ☐ |
| 8 | User 삭제 캐스케이드 전략 설계 | 🟡 | ☑ | ☐ |

체크는 완료 시 `☐` → `☑`로 직접 바꿔서 표시.

---

## 1. RefreshToken.tokenHash 인덱스 추가 🔴

- **파일**: `prisma/schema.prisma` (`RefreshToken` 모델)
- **문제**: 로그인/리프레시/로그아웃마다 `findFirst({ where: { tokenHash } })`(`src/auth/auth.service.ts:74`)가 실행되는데 `tokenHash`에 인덱스가 없음(`userId`에만 있음). 유저가 늘면 풀스캔이 된다.
- **제안**: `@@index([tokenHash])` 추가 후 `prisma migrate dev`.
- **QA 방법**: 마이그레이션 SQL에 `CREATE INDEX`가 생성됐는지 확인 → 로컬 PG에서 `EXPLAIN ANALYZE SELECT * FROM "RefreshToken" WHERE "tokenHash" = '...'`로 Index Scan 사용 확인.

- [x] 구현 완료
- [ ] QA 검증 완료

## 2. RefreshToken 만료/폐기 토큰 정리 🔴

- **파일**: `src/auth/` (신규 정리 로직 필요, 크론 or 스케줄러)
- **문제**: 만료(`expiresAt < now()`)되거나 폐기(`revoked = true`)된 토큰을 삭제하는 로직이 없어 테이블이 무한 증식. 항목 1의 인덱스와 별개로, 행 자체가 계속 쌓이면 조회·정리 비용이 커진다.
- **제안**: `@nestjs/schedule` 크론으로 주기적 `deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revoked: true }] } })`.
- **QA 방법**: 만료/폐기 더미 데이터 삽입 후 크론 수동 트리거 → 해당 행 삭제 확인, 유효한 토큰은 보존되는지 확인.

- [x] 구현 완료
- [ ] QA 검증 완료

## 3. Run_survivalTime_idx 죽은 인덱스 정리 🔴

- **파일**: `prisma/schema.prisma` (`Run` 모델 `@@index([survivalTime(sort: Desc)])`), 원본 마이그레이션 `prisma/migrations/20260712225510_add_run`
- **문제**: `leaderboard-sort` 리팩터 이후 리더보드 쿼리가 `GROUP BY userId` 집계 방식(`src/leaderboard/leaderboard.service.ts:34-42`)으로 바뀌어 이 인덱스가 더 이상 쓰이지 않는 것으로 보임. 쓰기 비용만 남은 상태일 가능성.
- **제안**: 로컬/스테이징에서 `EXPLAIN ANALYZE`로 실제 사용 여부 먼저 확인 → 미사용 확정 시 스키마에서 제거 + 마이그레이션.
- **QA 방법**: 제거 전후로 `GET /leaderboard` 응답 결과(순위·정렬)가 동일한지 대조, `pg_stat_user_indexes`로 인덱스 스캔 횟수 확인.

- [x] 구현 완료
- [ ] QA 검증 완료

## 4. 리더보드 쿼리 캐싱 전환 기준 수립 🟡

- **파일**: `src/leaderboard/leaderboard.service.ts`
- **문제**: `getTop`/`getMyRank`가 매 요청마다 `Run` 테이블 전체를 재집계. `BACKEND_DESIGN.md` §2에 "느려지면 Redis로" 계획은 있으나 "언제"에 대한 구체 기준이 없음.
- **제안**: 유저 수 또는 Run 행 수 기준 트리거 수치를 정하고(예: Run 10만 행 또는 응답 시간 200ms 초과), 도달 시 Redis Sorted Set 캐시로 전환.
- **QA 방법**: 기준 수치와 근거가 문서(`BACKEND_DESIGN.md` 또는 이 문서)에 기록됐는지 확인. 코드 변경이 아니라 의사결정 문서화 항목이라 "구현"은 문서 갱신을 의미.

- [x] 구현 완료
- [ ] QA 검증 완료

## 5. leaderboard.service.ts 쿼리 중복 제거 🟡

- **파일**: `src/leaderboard/leaderboard.service.ts` (`getTop:34-48`, `getMyRank:69-82`)
- **문제**: 거의 동일한 `$queryRaw` 집계 서브쿼리가 두 메서드에 중복. 정렬 기준이나 필터(`leaderboardEligible`)가 바뀔 때마다 두 곳을 각각 고쳐야 해서 한쪽만 고치고 놓칠 위험이 있음(plan.md에도 리스크로 인지된 지점).
- **제안**: 공통 집계 서브쿼리를 CTE나 헬퍼 함수로 뽑아 `getTop`/`getMyRank`가 공유하도록 리팩터.
- **QA 방법**: 리팩터 전후로 `GET /leaderboard`, `GET /leaderboard/me` 응답이 바이트 단위로 동일한지 대조(동일 시드 데이터 기준).

- [x] 구현 완료
- [ ] QA 검증 완료

## 6. 프론트-백 상수 동기화 구조 개선 🟡

- **파일**: `src/runs/dto/create-run.dto.ts`(`VALID_JOB_IDS`, `META_LEVEL_CAP`), `src/saves/dto/put-save.dto.ts`(XP/골드 공식)
- **문제**: 프론트(`varelion-web`)와 백엔드가 별도 저장소라 타입 공유가 없고, 주석에 "수동 동기화 대상"이라고 명시된 상수들이 여러 곳에 흩어져 있음. 신규 직업 추가나 밸런스 변경 시 한쪽만 고치면 조용히 어긋난다.
- **제안**: 최소한 공유 JSON/YAML 스키마 파일 하나를 두 저장소가 참조하는 구조, 또는 밸런스 데이터 서버 서빙(`BACKEND_DESIGN.md` §1 "어드민/밸런스 데이터" 항목과 연결).
- **QA 방법**: 신규 직업 하나를 추가하는 시나리오를 재현해, 변경 지점이 몇 곳인지·동기화 누락 시 어떤 에러가 나는지 확인.

- [x] 구현 완료
- [ ] QA 검증 완료

## 7. battle-sessions/runs 유닛 테스트 추가 🟡

- **파일**: `src/battle-sessions/battle-sessions.service.ts`(`reconcile`), `src/runs/runs.service.ts`(`create`)
- **문제**: 프로젝트 전체에 `*.spec.ts`가 0개. 특히 `reconcile()`의 허용 오차 판정, finalize 경쟁 처리(`updateMany` 조건부 전이)처럼 분기가 미묘한 로직은 회귀에 취약함.
- **제안**: 최소한 아래 시나리오는 유닛 테스트로 고정
  - 이벤트 로그 합계와 제출값 일치 → `eligible: true`
  - 허용 오차(KILL_TOLERANCE/GOLD_TOLERANCE) 경계값 안/밖
  - `sessionId` 없음 / 이미 종료된 세션 → `no-session`
  - 동시 중복 제출 시 한쪽만 성공(`updateMany` count 확인)
  - `runs.service.ts`의 물리적 상식 검증(kills/survivalTime 비율, 제출 간격) 400 케이스
- **QA 방법**: `npm run test` 통과 + 커버리지 리포트에서 두 서비스 파일 라인 커버리지 확인.

- [x] 구현 완료
- [ ] QA 검증 완료

## 8. User 삭제 캐스케이드 전략 설계 🟡

- **파일**: `prisma/schema.prisma` 전반 (FK가 전부 `ON DELETE RESTRICT`)
- **문제**: 회원탈퇴 기능이 아직 없는데, 지금 스키마 그대로면 `RefreshToken`/`Run`/`GameSave`/`BattleSession`이 남아있는 한 `User` 삭제가 막힌다. 나중에 탈퇴 기능을 추가할 때 스키마 변경(`onDelete: Cascade` 등)이 필요해진다.
- **제안**: 지금 당장 구현하지 않더라도, 탈퇴 시 정책(완전 삭제 vs 익명화)을 먼저 정하고 필요한 모델에 `onDelete` 전략을 미리 기록해두면 나중에 마이그레이션 충격이 적다.
- **QA 방법**: 이 항목은 설계 문서화 항목 — 탈퇴 정책과 각 모델별 `onDelete` 방침이 문서에 기록됐는지만 확인(코드 구현은 별도 기능 스코프).

- [x] 구현 완료
- [ ] QA 검증 완료
