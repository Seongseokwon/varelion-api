# battle-session-validation — 구현 계획서

> 작성 2026-07-14 · 근거: 승인된 `docs/battle-session-validation/spec.md`
> 상태: **초안 (승인 대기)**
> 계획 단계 확정 사항: 이벤트 저장은 **개별 이벤트 로그 테이블(BattleEvent)** 방식 (사용자 결정)

## 접근 방식 요약

백엔드는 `BattleSession`(유저당 여러 개, 세션 하나=판 하나) + `BattleEvent`(세션에 속한 개별 이벤트, `type`+`payload` JSON) 모델을 신설하고, 기존 `runs/`·`saves/` 모듈과 동일한 controller/service/dto 패턴으로 `battle-sessions/` 모듈을 만든다. 세션 생성·이벤트 수신 API 3종을 두고, 기존 `POST /runs`에 `sessionId`(선택)를 추가해 제출 시점에 그 세션의 이벤트를 집계해 킬/레벨/골드를 대조한다. 불일치나 세션 부재는 `Run.leaderboardEligible=false`로 표시되며, 리더보드 쿼리(`leaderboard.service.ts`의 `$queryRaw` 2곳)에 이 필터를 추가한다. 프론트는 신규 `systems/battleSession.js` 하나에 세션 상태·킬 누적·배치 타이머·재시도 큐 로직을 모으고, `enemies.js`/`flow.js`/`update.js`/`PlayView.vue`의 기존 진입점에서 얇게 호출만 추가한다.

## 아키텍처 결정

| 결정 | 선택 | 이유 |
|------|------|------|
| 이벤트 저장 형태 | **`BattleEvent` 로그 테이블**(세션당 N행, `type`+`payload` JSON) | 사용자 결정 — 집계 컬럼만 두면 구현은 간단하지만 원본 이벤트 이력이 사라져 spec의 "기대 효과"(리플레이·통계 기반)를 후속 기능이 쓸 수 없음. 대조검증 자체는 종료 시 `GROUP BY type` 집계 쿼리 한 번이면 되므로 조회 비용은 크지 않음 |
| 스테이지 클리어 이벤트의 대조검증 범위 | **기록만 하고 이번 범위의 pass/fail 판정(FR-7)에는 포함하지 않음** | `CreateRunDto`에 stage/win 필드 자체가 없어(현재 `job/survivalTime/kills/level/goldEarned/metaLevel`만 존재) 제출값과 대조할 대상이 없다. spec FR-6도 "kills/level/goldEarned"만 대조 대상으로 명시 — FR-5(스테이지클리어 이벤트 API)는 향후 확장(스테이지별 리더보드·이상탐지) 대비 로그 적재가 목적. 새 필드 추가는 명세에 없는 확장이라 이번 범위에서 하지 않음 |
| 세션 소유권/상태 검증 실패 응답 | 이유 불문 **404**(존재/소유/active 여부를 하나로 묶어 판단) | 다른 유저의 세션 id로 찔러봐도 "존재 안 함"과 구분 안 되게 해 정보 노출 최소화 |
| Run ↔ 리더보드 제외 구현 | `Run`에 `leaderboardEligible Boolean @default(true)` 컬럼 추가, 신규 제출은 서비스가 매번 명시적으로 계산해 넣음 | 마이그레이션 시 기존 Run 전부 `true`로 채워져(그랜드파더링) 이 기능 이전 기록이 소급 제외되지 않음. `leaderboard-sort`가 이미 `GROUP BY userId`로 전체 판을 합산하는 구조라, "판 하나 숨김"이 아니라 "그 판을 합계에서 제외"로 동작함 — `leaderboard.service.ts`의 두 `$queryRaw`(getTop/getMyRank) 서브쿼리에 `WHERE "leaderboardEligible" = true` 추가 |
| 킬 배치 재시도 방식 | 별도 큐 자료구조 대신 **누적치 자체를 되돌려 재사용** — 전송 실패 시 방금 꺼낸 델타를 다시 `killAccum`에 더해 다음 배치에 합쳐 보냄 | 킬/골드는 순서가 의미 없는 누적값이라 실패분을 다음 배치에 합산하는 것만으로 FR-17 요건(다음 전송 시도에 재시도)을 만족. 레벨업·스테이지클리어(개별 이벤트)는 순서/존재가 의미 있어 `run.pendingEvents` 배열에 실패분을 쌓아 다음 배치 tick·종료 시 재전송 |
| 골드 획득 계산 중복 방지 | `enemies.js`의 `onEnemyDeath()`에서 골드 획득량(보스 +15, 4% 확률 +1)을 **한 번만 계산**해 `run.runGold`와 킬 누적치(`recordKill(goldGain)`)에 동시 반영 | RNG(`Math.random()<0.04`)를 두 번 호출하면 실제 골드(`runGold`, 제출값)와 이벤트 로그 누적치가 서로 다른 판정을 받아 애초에 검증 취지와 어긋나는 자체 불일치가 생김 |
| 종료 시점 이벤트 정합 | `gameOver()`의 결과 제출 직전에 **대기 중인 킬 배치·재시도 큐를 동기(await)로 먼저 flush**한 뒤 `POST /runs`를 보냄 | flush와 제출이 동시에 나가면 서버가 제출을 먼저 처리해 방금 낸 킬이 집계에 안 잡히는 경쟁 상태가 생겨 정상 플레이도 불일치로 판정될 수 있음. `submitRunResult()`를 async로 바꾸되 `gameOver()`가 이를 기다리진 않아(기존처럼 게임오버 화면은 즉시 렌더) 흐름은 안 막힘 |
| 프론트 신규 파일 | `src/systems/battleSession.js` 신설 | 세션/누적치/타이머/재시도 로직이 `enemies.js`(킬)·`flow.js`(레벨업·게임오버)·`update.js`(타이머 틱)에 흩어지면 `if(run.sessionId)` 가드가 여러 곳에 중복됨. 한 파일에 모아 각 호출부는 `recordKill(gold)`/`sendLevelUp(lv)`/`sendStageClear(id)`/`tickBattleSessionBatch(dt)` 얇은 호출만 추가(기존 `flow.js → api.js` import 전례와 동일한 계층 — systems가 api.js를 참조하는 것은 이미 존재하는 패턴) |
| 신규 엔드포인트 레이트 리밋 | 킬 배치 엔드포인트(및 나머지 이벤트 API)에 `@Throttle`로 전역 기본(10회/60초)보다 넉넉한 한도 지정(예: 30회/60초) | 전역 `ThrottlerGuard`(app.module.ts, 10회/60초)가 이미 걸려 있음. 킬 배치만 7초 주기로도 분당 ~8회라 세션 생성·레벨업·최종 제출과 겹치면 전역 한도에 걸려 정상 플레이가 429를 받을 위험 — `saves`/`runs`처럼 전역 한도를 그대로 쓰지 않고 이 모듈만 상향 |
| 킬 배치 주기 | 고정 7초(랜덤화 안 함) | 게임플레이에 노출되는 타이머(물약 드랍 등)는 예측 불가성이 목적이었지만, 이건 순수 네트워크 하트비트라 고정 주기가 더 단순하고 디버깅하기 쉬움 |

## 변경 파일 목록

**백엔드 (survivor-api/)**

| 파일 | 변경 |
|------|------|
| `prisma/schema.prisma` | `BattleSession`(id, userId, status String @default("active"), startedAt, finalizedAt DateTime?) + `BattleEvent`(id, sessionId, type String, payload Json, createdAt, @@index([sessionId])) 모델 추가. `Run`에 `sessionId String?`, `session BattleSession? @relation(...)`, `leaderboardEligible Boolean @default(true)` 추가 |
| `prisma/migrations/<ts>_add_battle_session/` | `prisma migrate dev`로 생성 (신규) |
| `src/battle-sessions/battle-sessions.module.ts` (신규) | runs.module 패턴, `RunsModule`에서 import해 서비스 재사용 |
| `src/battle-sessions/battle-sessions.controller.ts` (신규) | `POST /battle-sessions`(생성), `POST /battle-sessions/:id/events/kills`, `.../events/level-up`, `.../events/stage-clear` — 전부 `JwtAuthGuard` + `@CurrentUser`, 이벤트 3종에 상향 `@Throttle` |
| `src/battle-sessions/battle-sessions.service.ts` (신규) | `create(userId)`, `recordEvent(sessionId, userId, type, payload)`(소유권+active 상태 검증 → 404), `reconcile(sessionId, userId, {kills, level, goldEarned})`(이벤트 집계→대조→세션 finalize→`{eligible}` 반환) |
| `src/battle-sessions/dto/*.ts` (신규) | `KillBatchEventDto`(killsDelta/goldDelta, 양의 정수), `LevelUpEventDto`(level), `StageClearEventDto`(stageId) |
| `src/battle-sessions/reconciliation.constants.ts` (신규) | `KILL_TOLERANCE=5`, `GOLD_TOLERANCE=5` (근거 주석 — save-sync FR-7 상수 전례처럼 "즉석 조작 차단" 목적의 여유 마진) |
| `src/runs/dto/create-run.dto.ts` | `sessionId?: string`(선택, `@IsOptional() @IsString()`) 추가 |
| `src/runs/runs.service.ts` | 기존 물리 상식 검증(FR-9, 무변경) 뒤에 `sessionId` 있으면 `BattleSessionsService.reconcile()` 호출 → `leaderboardEligible` 산출해 `Run.create()`에 포함. 없으면 `leaderboardEligible=false` |
| `src/runs/runs.module.ts` | `BattleSessionsModule` import |
| `src/leaderboard/leaderboard.service.ts` | `getTop`/`getMyRank` 두 `$queryRaw`의 내부 집계 서브쿼리(`FROM "Run" GROUP BY "userId"`)와 최신 job LATERAL 조인에 `WHERE "leaderboardEligible" = true` 추가 |
| `src/app.module.ts` | `BattleSessionsModule` 등록 |

**프론트 (src/)**

| 파일 | 변경 |
|------|------|
| `src/state/run.js` | `sessionId: null`, `killAccum: {kills:0, gold:0}`, `pendingEvents: []`, `eventBatchTimer: 0` 필드 추가 |
| `src/api.js` | `createBattleSession()`, `sendKillBatch(sessionId, killsDelta, goldDelta)`, `sendLevelUpEvent(sessionId, level)`, `sendStageClearEvent(sessionId, stageId)` 헬퍼 추가(기존 `apiFetch` 래퍼·`{ok,...}` 관례). `submitRun()`에 `sessionId` 인자 추가 |
| `src/systems/battleSession.js` (신규) | `startBattleSession()`(비로그인 시 즉시 반환, 로그인 시 `createBattleSession()` 후 `run.sessionId` 세팅) · `recordKill(goldGain)`(누적) · `tickBattleSessionBatch(dt)`(타이머 감소→만료 시 `flushKillBatch()` + `retryPending()`) · `flushKillBatch()`(실패 시 누적치 되돌림) · `sendLevelUp(level)`/`sendStageClear(stageId)`(실패 시 `pendingEvents`에 적재) · `flushAllNow()`(종료 시 동기 대기용 — flushKillBatch+retryPending을 await) |
| `src/systems/player.js` | `newRun()`에 `run.sessionId=null; run.killAccum={kills:0,gold:0}; run.pendingEvents=[]; run.eventBatchTimer=KILL_BATCH_INTERVAL_SEC;` 리셋 추가(FR-12 기반 상태 초기화) |
| `src/views/PlayView.vue` | `newRun(...)` 호출 직후 `startBattleSession()` 비동기 호출(결과를 기다리지 않고 게임 시작, FR-13) |
| `src/systems/enemies.js` | `onEnemyDeath()`에서 골드 획득량을 변수로 한 번만 계산해 `run.runGold`와 `recordKill(goldGain)`에 동시 반영(FR-16, RNG 중복 방지) |
| `src/systems/update.js` | 메인 루프에 `tickBattleSessionBatch(dt)` 호출 추가(기존 `updateTimedPotionDrop(dt)`와 같은 위치·패턴) |
| `src/systems/flow.js` | `levelUp()` 시작부에 `sendLevelUp(run.player.level)` 호출(FR-14). `gameOver()`에서 승리+스테이지런이면 `sendStageClear(run.stage.id)` 호출(FR-15). `submitRunResult()`를 async로 바꿔 `await flushAllNow()` 후 `submitRun(..., run.sessionId)` 호출(FR-18, 위 "종료 시점 이벤트 정합" 결정) |

## 작업 단계

1. **[백엔드] `BattleSession`/`BattleEvent` 모델 + `Run` 컬럼 추가 + 마이그레이션** — FR-1 · 의존: 없음
   - 완료 조건: `prisma migrate dev --name add_battle_session` 성공, 기존 테이블·데이터 영향 없음(`leaderboardEligible` 기존 행 전부 true), 백엔드 빌드 통과
2. **[백엔드] `battle-sessions` 모듈 — 세션 생성 API** — FR-1, FR-2, FR-10 · 의존: 1
   - 완료 조건: 인증 상태로 `POST /battle-sessions` 호출 시 세션 생성+id 반환, 무인증 401
3. **[백엔드] 이벤트 API 3종 + 소유권/상태 검증** — FR-3, FR-4, FR-5, FR-10 · 의존: 2
   - 완료 조건: 본인 활성 세션에 이벤트 전송 시 저장됨 / 남의 세션·존재하지 않는 세션·이미 종료된 세션에는 404 / 무인증 401
4. **[백엔드] `runs` 대조검증 연동** — FR-6, FR-7, FR-8, FR-9 · 의존: 3
   - `CreateRunDto`에 `sessionId` 추가, `RunsService`가 물리 상식 검증(무변경) 후 `sessionId` 유무에 따라 `reconcile()` 호출·세션 finalize·`leaderboardEligible` 산출
   - 완료 조건: 이벤트 로그와 일치하는 제출 → `leaderboardEligible=true` / 로그 대비 과다 제출(허용치 초과) → `false`이지만 200 저장 / `sessionId` 없음·이미 종료된 세션 id → `false` / 기존 물리 검증 400 케이스 그대로 유지
5. **[백엔드] 리더보드 쿼리 필터** — FR-7 · 의존: 4
   - 완료 조건: `leaderboardEligible=false`인 Run은 `GET /leaderboard`, `GET /leaderboard/me` 합계·순위에서 빠짐(수동 확인 — SQL 직접 대조)
6. **[백엔드] 이벤트 API 레이트 리밋 조정** — 비기능(성능) · 의존: 2, 3
   - 완료 조건: 킬 배치 7초 간격으로 5분 연속 발생시켜도 429 없음(수동/로컬 반복 호출 확인), 전역 한도(다른 엔드포인트)는 그대로 유지
7. **[프론트] `run.js` 상태 확장 + `player.js` 리셋** — FR-12 기반 · 의존: 없음(병행 가능)
   - 완료 조건: 새 판 시작마다 세션 관련 필드가 초기화됨(콘솔 확인), 기존 필드 동작 불변
8. **[프론트] `api.js` 헬퍼 추가** — FR-2~6 클라이언트 대응 · 의존: 1(API 계약 확정, 백엔드 완료 전 목업으로 병행 가능)
   - 완료 조건: 각 헬퍼가 기존 `apiFetch` 관례대로 `{ok,...}` 반환, `submitRun()`이 `sessionId`를 옵션으로 전달
9. **[프론트] `systems/battleSession.js` 신설** — FR-12~17 · 의존: 7, 8
   - 완료 조건: 게스트 상태에서 `startBattleSession()` 호출 시 네트워크 요청 0건 / 킬 발생 시 누적 / 7초마다 배치 전송 후 누적 초기화 / 전송 실패 시 누적치·pendingEvents에 복원되어 다음 tick에 재시도
10. **[프론트] 연동 지점 수정** — FR-14, FR-15, FR-16, FR-18, FR-19 · 의존: 9
    - `PlayView.vue`(세션 시작 트리거), `enemies.js`(recordKill 연동+골드 중복 계산 제거), `update.js`(배치 타이머 tick), `flow.js`(레벨업/스테이지클리어 이벤트 전송, 종료 시 flush 후 제출)
    - 완료 조건: 무한 모드/스테이지 모드 모두 게임오버 시 서버에 `sessionId` 포함 제출 확인(Network 탭), 라우트 이탈(FR-19)로 세션 미종료 시에도 게임 진행 자체는 정상
11. **[통합] 시나리오 검증 (Playwright 스모크)** — 전 FR · 의존: 5, 10
    - 관례대로 스크래치에 `playwright-core` 스크립트 작성(저장소 미포함), 새로 띄운 dev 서버 사용(MEMORY 교훈 ③)
    - 완료 조건: 아래 테스트 전략의 시나리오 전부 통과

## 테스트 전략

- **백엔드 (수동, curl/Swagger + 로컬 PG16)**: 작업 2~6의 완료 조건 시나리오. 예외 필터로 Prisma 정보 미노출 확인
- **프론트 단위 확인 (수동)**: 게스트 플레이 시 세션/이벤트 요청 0건(DevTools Network) / `npm run lint` · `npm run build` 통과
- **통합 (Playwright, dev 서버 2종 기동)**:
  1. 로그인 플레이 → 판 시작 시 `POST /battle-sessions` 1회 확인
  2. 플레이 중 레벨업 발생 → 즉시 이벤트 전송 확인(Network), 몬스터 다수 처치 → 7초 주기 배치 전송 확인(개별 킬마다 전송 안 됨)
  3. 정상 플레이 종료(무한 모드) → `POST /runs`에 `sessionId` 포함, 서버 응답상 리더보드 반영됨(순위 조회로 확인)
  4. 스테이지 클리어(1-1 등) 승리 → 스테이지클리어 이벤트 전송 + 정상 제출·리더보드 반영
  5. 브라우저 콘솔로 제출 직전 `run.kills`를 인위적으로 부풀린 뒤 게임오버 유도 → 이벤트 로그 대비 과다 → `Run` 저장되나 `GET /leaderboard`에서 제외 확인(DB 직접 조회로 `leaderboardEligible=false` 확인)
  6. 세션 생성 API를 오프라인으로 만든 상태로 플레이·종료 → 게임 진행·게임오버 화면 정상, 제출은 `sessionId` 없이 나가고 리더보드 제외
  7. 배치 전송 중 네트워크 일시 차단 → 복구 후 다음 tick에 유실분 포함해 재전송(요청 페이로드의 킬 수로 확인)
  8. 게스트 플레이 종료 → 세션/이벤트/제출 요청 전부 0건
- **자동화 테스트는 추가하지 않음**: 저장소 관례(프론트 test 스크립트 없음, 백엔드 e2e는 Phase 4 항목)

## 리스크

| 리스크 | 대응 |
|--------|------|
| 전역 `ThrottlerGuard`(10회/60초)와 7초 주기 킬 배치 충돌 | 작업 6에서 이벤트 엔드포인트만 `@Throttle` 상향. 장시간 플레이(무한 모드 수십 분)에서도 429 없는지 통합 검증에서 재확인 |
| flush-then-submit 경쟁 상태(작업 10) | `submitRunResult()`를 async로 바꿔 flush를 await 후 제출(위 아키텍처 결정) — 그래도 서버 처리 지연(느린 DB 응답 등)이 남는 극단적 케이스는 KILL_TOLERANCE/GOLD_TOLERANCE 여유로 흡수 |
| KILL_TOLERANCE/GOLD_TOLERANCE 값 오판(정상 플레이 오탐) | save-sync FR-7 전례처럼 상수를 별도 파일에 근거 주석과 함께 분리해 튜닝 용이하게. 오탐돼도 `Run` 자체는 저장되고 리더보드 노출만 빠짐 — 되돌리기 쉬운 실패 모드 |
| `enemies.js` 골드 계산 리팩터 시 기존 `run.runGold` 동작 회귀 | 변경을 "계산 위치 통합"으로 최소화(로직·확률·수치는 무변경), 작업 10 완료 조건에서 게임오버 화면 골드 표시가 리팩터 전후 동일한지 수동 대조 |
| `BattleEvent` 로그 테이블 증가(장시간 플레이·활성 유저 누적) | 이번 범위는 조회·정리 정책 없음(스펙에서도 로드맵 5번 Post-MVP로 이월). 초기 트래픽 규모에서는 문제 없을 것으로 판단, 필요시 별도 정리 작업 제안 |
| 라우트 이탈 등으로 미종료 세션이 쌓임(FR-11/19) | 의도된 동작(방치) — 정리 배치나 TTL은 이번 범위 밖, 필요 시 후속 제안 |
| `leaderboard.service.ts` 쿼리 수정 시 기존 정렬 로직(`leaderboard-sort`) 회귀 | `WHERE leaderboardEligible=true`만 추가하고 `GROUP BY`/`ORDER BY`/LATERAL 조인 구조는 무변경. 작업 5 완료 조건에서 필터 적용 전후 정렬 순서가 그 외에는 동일한지 확인 |

## FR ↔ 작업 매핑 (누락 점검)

FR-1→작업1,2 · FR-2→작업2 · FR-3,4,5→작업3 · FR-6,7,8,9→작업4 · FR-7(리더보드 반영)→작업5 · FR-10→작업2,3 · FR-11→작업1(스키마)+설계상 별도 구현 없음(리스크 표에 명시) · FR-12→작업7,10 · FR-13→작업9(가드) · FR-14,15→작업10 · FR-16→작업10 · FR-17→작업9 · FR-18→작업10 · FR-19→구현 없음(의도적 무동작, 리스크 표에 명시). 전 FR 통합 검증→작업11. **누락 없음.**