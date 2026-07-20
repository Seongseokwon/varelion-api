# 백엔드 전체 점검 체크리스트 (2026-07)

> 작성 2026-07-17 · 근거: DB 스키마(`prisma/schema.prisma`) + 전 모듈 소스 + 마이그레이션 이력 전체 리뷰
> 프로젝트가 커지는 시점에 진행한 1회성 점검. 신규 이슈가 아니라 "지금 고쳐두면 나중에 편한 것" 위주.
> **역할 분담**: 구현은 사용자, QA(검증)는 Claude가 진행. 각 항목은 두 단계로 완료된다.
> - **구현 완료**: 코드/마이그레이션 변경이 실제로 적용됨 (체크는 구현자가)
> - **QA 검증 완료**: 변경이 의도대로 동작하는지 확인됨 (체크는 QA가, 확인 방법은 각 항목 "QA 방법" 참고)

## 상태 요약

| # | 항목 | 우선순위 | 구현 완료 | QA 완료 |
|---|------|----------|:---:|:---:|
| 1 | RefreshToken.tokenHash 인덱스 추가 | 🔴 | ☑ | ☑ |
| 2 | RefreshToken 만료/폐기 토큰 정리 | 🔴 | ☑ | ☑ |
| 3 | Run_survivalTime_idx 죽은 인덱스 정리 | 🔴 | ☑ | ☑ |
| 4 | 리더보드 쿼리 캐싱 전환 기준 수립 | 🟡 | ☑ | ☑ |
| 5 | leaderboard.service.ts 쿼리 중복 제거 | 🟡 | ☑ | ☑ |
| 6 | 프론트-백 상수 동기화 구조 개선 | 🟡 | ☑ | ☑ |
| 7 | battle-sessions/runs 유닛 테스트 추가 | 🟡 | ☑ | ☑ |
| 8 | User 삭제 캐스케이드 전략 설계 | 🟡 | ☑ | ☑ |

체크는 완료 시 `☐` → `☑`로 직접 바꿔서 표시. QA 결과는 각 항목의 "QA 결과" 참고(재확인 시 날짜 추가).

---

## 1. RefreshToken.tokenHash 인덱스 추가 🔴

- **파일**: `prisma/schema.prisma` (`RefreshToken` 모델)
- **문제**: 로그인/리프레시/로그아웃마다 `findFirst({ where: { tokenHash } })`(`src/auth/auth.service.ts:74`)가 실행되는데 `tokenHash`에 인덱스가 없음(`userId`에만 있음). 유저가 늘면 풀스캔이 된다.
- **제안**: `@@index([tokenHash])` 추가 후 `prisma migrate dev`.
- **QA 방법**: 마이그레이션 SQL에 `CREATE INDEX`가 생성됐는지 확인 → 로컬 PG에서 `EXPLAIN ANALYZE SELECT * FROM "RefreshToken" WHERE "tokenHash" = '...'`로 Index Scan 사용 확인.

- [x] 구현 완료
- [x] QA 검증 완료

**QA 결과(2026-07-17)**: PASS. `prisma/schema.prisma`에 `@@index([tokenHash])` 추가 확인, 마이그레이션 `20260717090000_refresh_token_index_remove_run_survival_index`에 `CREATE INDEX "RefreshToken_tokenHash_idx"` 포함. 로컬 PG(`varelion-api-db-1`)에 `prisma migrate deploy`로 실제 적용 후 `\d "RefreshToken"`으로 인덱스 존재 직접 확인. `prisma migrate diff`로 스키마-DB drift 없음도 확인.

## 2. RefreshToken 만료/폐기 토큰 정리 🔴

- **파일**: `src/auth/` (신규 정리 로직 필요, 크론 or 스케줄러)
- **문제**: 만료(`expiresAt < now()`)되거나 폐기(`revoked = true`)된 토큰을 삭제하는 로직이 없어 테이블이 무한 증식. 항목 1의 인덱스와 별개로, 행 자체가 계속 쌓이면 조회·정리 비용이 커진다.
- **제안**: `@nestjs/schedule` 크론으로 주기적 `deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revoked: true }] } })`.
- **QA 방법**: 만료/폐기 더미 데이터 삽입 후 크론 수동 트리거 → 해당 행 삭제 확인, 유효한 토큰은 보존되는지 확인.

- [x] 구현 완료
- [x] QA 검증 완료

**QA 결과(2026-07-17)**: PASS. `RefreshTokenCleanupService`가 `@Cron(CronExpression.EVERY_DAY_AT_3AM)`로 등록되고 `AuthModule` providers에 추가됨, `app.module.ts`에 `ScheduleModule.forRoot()`도 추가되어 있어 크론이 실제로 구동될 수 있음(등록 누락 없음). `deleteMany({ where: { OR: [{expiresAt:{lt: now}}, {revoked:true}] } })` 조건이 만료·폐기 토큰만 지우고 유효 토큰은 보존하는 조건과 일치. 유닛 테스트(`refresh-token-cleanup.service.spec.ts`) 통과 확인(`npm test`). 참고: `@nestjs/schedule`가 `package.json`에 실제로 추가되고 `node_modules`에도 설치돼 있음을 확인(문서만 바꾸고 설치 누락된 경우가 아님).

## 3. Run_survivalTime_idx 죽은 인덱스 정리 🔴

- **파일**: `prisma/schema.prisma` (`Run` 모델 `@@index([survivalTime(sort: Desc)])`), 원본 마이그레이션 `prisma/migrations/20260712225510_add_run`
- **문제**: `leaderboard-sort` 리팩터 이후 리더보드 쿼리가 `GROUP BY userId` 집계 방식(`src/leaderboard/leaderboard.service.ts:34-42`)으로 바뀌어 이 인덱스가 더 이상 쓰이지 않는 것으로 보임. 쓰기 비용만 남은 상태일 가능성.
- **제안**: 로컬/스테이징에서 `EXPLAIN ANALYZE`로 실제 사용 여부 먼저 확인 → 미사용 확정 시 스키마에서 제거 + 마이그레이션.
- **QA 방법**: 제거 전후로 `GET /leaderboard` 응답 결과(순위·정렬)가 동일한지 대조, `pg_stat_user_indexes`로 인덱스 스캔 횟수 확인.

- [x] 구현 완료
- [x] QA 검증 완료

**QA 결과(2026-07-17)**: PASS. `prisma/schema.prisma`에서 `@@index([survivalTime(sort: Desc)])` 제거 확인, 마이그레이션에 `DROP INDEX "Run_survivalTime_idx"` 포함. 로컬 PG에 실제 적용 후 `\d "Run"`으로 해당 인덱스가 사라졌고 `Run_userId_createdAt_idx`는 그대로 남아있음을 확인. 현재 리더보드 쿼리(`leaderboard.service.ts`)가 이 인덱스를 참조하는 `ORDER BY survivalTime` 구문을 쓰지 않는 것도 코드로 재확인 — 제거해도 되는 인덱스였음이 맞음.

## 4. 리더보드 쿼리 캐싱 전환 기준 수립 🟡

- **파일**: `src/leaderboard/leaderboard.service.ts`
- **문제**: `getTop`/`getMyRank`가 매 요청마다 `Run` 테이블 전체를 재집계. `BACKEND_DESIGN.md` §2에 "느려지면 Redis로" 계획은 있으나 "언제"에 대한 구체 기준이 없음.
- **제안**: 유저 수 또는 Run 행 수 기준 트리거 수치를 정하고(예: Run 10만 행 또는 응답 시간 200ms 초과), 도달 시 Redis Sorted Set 캐시로 전환.
- **QA 방법**: 기준 수치와 근거가 문서(`BACKEND_DESIGN.md` 또는 이 문서)에 기록됐는지 확인. 코드 변경이 아니라 의사결정 문서화 항목이라 "구현"은 문서 갱신을 의미.

- [x] 구현 완료
- [x] QA 검증 완료

**QA 결과(2026-07-17)**: PASS. `BACKEND_DESIGN.md` §2.1에 전환 기준(Run 10만 행 이상, 또는 p95 응답시간 200ms 초과 7일 관측)과 전환 시 폴백 방침이 구체적으로 기록됨. 이 항목은 코드가 아니라 의사결정 문서화가 목적이므로 문서 존재·구체성만 확인하면 충분 — 조건 확인.

## 5. leaderboard.service.ts 쿼리 중복 제거 🟡

- **파일**: `src/leaderboard/leaderboard.service.ts` (`getTop:34-48`, `getMyRank:69-82`)
- **문제**: 거의 동일한 `$queryRaw` 집계 서브쿼리가 두 메서드에 중복. 정렬 기준이나 필터(`leaderboardEligible`)가 바뀔 때마다 두 곳을 각각 고쳐야 해서 한쪽만 고치고 놓칠 위험이 있음(plan.md에도 리스크로 인지된 지점).
- **제안**: 공통 집계 서브쿼리를 CTE나 헬퍼 함수로 뽑아 `getTop`/`getMyRank`가 공유하도록 리팩터.
- **QA 방법**: 리팩터 전후로 `GET /leaderboard`, `GET /leaderboard/me` 응답이 바이트 단위로 동일한지 대조(동일 시드 데이터 기준).

- [x] 구현 완료
- [x] QA 검증 완료

**QA 결과(2026-07-17)**: PASS. `getTop`/`getMyRank`가 공통 `leaderboardEntriesCte`(Prisma.sql 조각)를 `WITH` 절로 공유하도록 리팩터됨. 리팩터가 결과를 바꾸지 않았는지가 핵심이라, 로컬 PG에 더미 유저 3명·Run 4건(1건은 `leaderboardEligible=false`)을 직접 심어 리팩터된 SQL을 그대로 실행해봄 — `getTop` 결과가 제외 대상(u3) 빠짐, 정렬(metaLevel DESC) 정확, `job`이 LATERAL JOIN으로 최신 판 기준으로 나옴을 확인. `getMyRank`도 동일 데이터로 `rank=2` 정확히 산출됨을 확인. 검증 후 더미 데이터는 삭제해 로컬 DB 원복함.

## 6. 프론트-백 상수 동기화 구조 개선 🟡

- **파일**: `src/runs/dto/create-run.dto.ts`(`VALID_JOB_IDS`, `META_LEVEL_CAP`), `src/saves/dto/put-save.dto.ts`(XP/골드 공식)
- **문제**: 프론트(`varelion-web`)와 백엔드가 별도 저장소라 타입 공유가 없고, 주석에 "수동 동기화 대상"이라고 명시된 상수들이 여러 곳에 흩어져 있음. 신규 직업 추가나 밸런스 변경 시 한쪽만 고치면 조용히 어긋난다.
- **제안**: 최소한 공유 JSON/YAML 스키마 파일 하나를 두 저장소가 참조하는 구조, 또는 밸런스 데이터 서버 서빙(`BACKEND_DESIGN.md` §1 "어드민/밸런스 데이터" 항목과 연결).
- **QA 방법**: 신규 직업 하나를 추가하는 시나리오를 재현해, 변경 지점이 몇 곳인지·동기화 누락 시 어떤 에러가 나는지 확인.

**QA 결과(2026-07-17)**: 🔴 **FAIL — 프로덕션 배포가 깨짐.**

`config/game-balance.json`(프로젝트 루트, `src/` 바깥)을 `src/config/game-balance.ts`에서 `resolveJsonModule`로 import하도록 만들면서, TypeScript가 컴파일 시 `rootDir`을 자동으로 프로젝트 루트까지 확장 추론함. 그 결과 `npm run build`(`nest build`) 산출물 구조가 통째로 바뀜:

- 기존: `dist/main.js`, `dist/app.module.js` (flat)
- 변경 후: `dist/src/main.js`, `dist/src/app.module.js` (src/ 한 겹 더 중첩), `dist/config/game-balance.json`

`package.json`의 `start:prod`는 `"prisma migrate deploy && node dist/main"`이고, `railway.json`의 배포 커맨드가 정확히 이 스크립트를 실행함. 재현 확인:

```
rm -rf dist && npm run build   # 정상 종료(에러 없음, 그래서 눈치채기 어려움)
node dist/main
# Error: Cannot find module '.../dist/main'
```

즉 **로컬/CI에서 `npm run build`는 성공하지만, Railway가 실제로 서버를 기동하는 시점(`node dist/main`)에 100% 크래시**한다. `npm test`, `tsc --noEmit`, `npm run build` 모두 통과해서 겉으로는 문제가 없어 보이지만 배포 커맨드까지 직접 실행해야 드러나는 회귀임.

**부수적으로 lint도 깨짐**(`npm run lint`): `src/saves/dto/put-save.dto.ts`에서 `GOLD_BASE_ALLOWANCE`/`MAX_GOLD_PER_SEC`/`MAX_XP_PER_SEC`/`XP_BASE_ALLOWANCE`를 `game-balance`에서 import했지만 재-export만 하고 파일 내부에서 직접 쓰지 않아 `@typescript-eslint/no-unused-vars` 4건 발생.

**제안 수정 방향** (선택):
1. `config/game-balance.json`을 `src/config/game-balance.json`으로 옮기고 상대 경로만 `./game-balance.json`으로 바꾸기 — `src/` 안에만 있으면 rootDir 추론이 원래대로 유지됨. 프론트 저장소가 참조할 파일 위치가 `varelion-api/src/config/...`로 바뀔 뿐 "포터블 JSON" 취지는 그대로 유지 가능.
2. 또는 `tsconfig.build.json`에 `"rootDir": "./src"`를 명시하고, JSON은 `fs.readFileSync` + `JSON.parse`로 런타임 로드(빌드 타임 import 대신) — `src/` 바깥 파일 위치를 유지하고 싶다면 이 방향.
어느 쪽이든 **수정 후 반드시 `rm -rf dist && npm run build && node dist/main`으로 재현 스크립트를 다시 돌려 `dist/main.js`가 원래 위치에 뜨는지 확인 필요**.

---

**재검증 결과(2026-07-17, 커밋 `7be3dd1`)**: ✅ **PASS로 전환.** 제안 1번 방식대로 `config/game-balance.json` → `src/config/game-balance.json`으로 이동, import 경로도 `./game-balance.json`으로 수정됨. `README.md`의 안내 문구도 새 경로로 갱신됨.

재현 스크립트 그대로 재실행해서 확인:
```
rm -rf dist && npm run build
ls dist            # → app.controller.js, main.js, config/, ... (flat, 정상 위치)
node dist/main      # 정상 부팅
```
`node dist/main`으로 실제 앱을 띄워 `GET /api`(Swagger 문서 라우트)에 `curl`로 200 응답 확인. 부팅 로그에 `PrismaModule`/`PassportModule` 등 정상 초기화 로그도 확인. 프로세스는 검증 후 종료, 포트 점유 없음 확인. `put-save.dto.ts`의 unused import 4건도 `META_XP_BASE`/`META_XP_POW`만 남기고 나머지는 import 없이 재-export만 하도록 정리되어 있어 그 부분 lint 에러도 함께 해소됨(아래 7번과 별개로 6번 자체 회귀는 없음).

- [x] 구현 완료
- [x] QA 검증 완료

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

**QA 결과(2026-07-17)**: ⚠️ **PARTIAL — 테스트 로직은 통과하지만 lint 에러 있음.**

`npm test` 결과 3개 스위트/7개 테스트 전부 통과. 제안된 시나리오 중 이벤트 로그 일치, 허용 오차 경계(안/밖), `no-session`(finalize 경쟁 처리 포함), 물리적 상식 검증(kills/초 비율, 제출 간격), 세션 없는 제출의 리더보드 제외까지 커버됨. 다만 "동시 중복 제출 시 한쪽만 성공" 시나리오는 `battle-sessions.service.spec.ts`의 `updateMany.count === 0` 케이스로 대체 검증되고 있어(직접적인 동시성 테스트는 아니지만 핵심 분기는 커버) 실질적으로는 충분.

`npm run lint`에서 신규 테스트 파일 2건에 에러 발생:
- `src/auth/refresh-token-cleanup.service.spec.ts:13` — `prisma as never`로 인한 `no-unsafe-assignment`
- `src/runs/runs.service.spec.ts:42` — `mockImplementation(({ data }) => data)`가 `any` 반환이라 `no-unsafe-return`

런타임 동작에는 영향 없지만 `npm run lint`가 실패 종료 코드를 반환하므로 CI에 lint 게이트가 있다면 그 자체로 파이프라인이 막힌다. 목(mock) 객체에 최소한의 타입(`Partial<PrismaService>` 또는 인터페이스)을 지정하는 정도로 해결 가능.

---

**재검증 결과(2026-07-17, 커밋 `7be3dd1`)**: ⚠️ **아직 PARTIAL.** 원래 지적한 두 건(`no-unsafe-assignment`, `no-unsafe-return`)은 해결됨 — `runs.service.spec.ts`는 `mockResolvedValue`로 고정값을 반환하도록 바뀌어 `any` 반환 문제가 없어짐. `refresh-token-cleanup.service.spec.ts`는 `DeleteManyArgs` 인터페이스 + `PrismaService`로 목 타입을 지정해 `unsafe-assignment`는 해결됨.

다만 그 수정 과정에서 같은 파일에 **새 lint 에러 2건**이 생김(`npx eslint "{src,apps,libs,test}/**/*.ts"`로 재확인):
- `refresh-token-cleanup.service.spec.ts:13:14` — `_args`가 실제로 안 쓰여서 `no-unused-vars`. 언더스코어 접두사 컨벤션을 쓴 것으로 보이는데, 이 프로젝트 `eslint.config.mjs`에는 `argsIgnorePattern: '^_'` 설정이 없어서 언더스코어가 자동으로 무시되지 않음.
- `refresh-token-cleanup.service.spec.ts:13:65` — 콜백이 `async`인데 내부에 `await`가 없어 `require-await`.

가장 간단한 해법은 그 콜백을 `async` 없이 동기 함수로 두거나(`jest.fn()`은 반환값이 Promise가 아니어도 `mockResolvedValue`처럼 동작하도록 굳이 async일 필요 없음), 파라미터 자체를 없애는 것(`jest.fn(async () => ({ count: 2 }))` 형태로 `_args`를 아예 받지 않기). `npm run test`(7개 전부 통과)와 `npm run build`/`node dist/main`(정상 기동)에는 영향 없음 — 순수 lint 게이트 문제로 남아 있음.

---

**재검증 결과(2026-07-17, 커밋 `c5becd5`)**: ✅ **PASS로 전환.** `deleteMany` 목을 `async` 없는 일반 함수로 바꾸고 `args`를 `receivedArgs`에 실제로 대입해 사용하도록 고쳐, 지적한 두 에러(`no-unused-vars`, `require-await`) 모두 해소됨.

`npx eslint "{src,apps,libs,test}/**/*.ts"`(--fix 없이) 재실행 결과 남은 에러는 `refresh-token-cleanup.service.ts`의 prettier 줄바꿈 스타일 1건뿐 — 이건 6번 작업 이전부터 있던 것과 동일한 자동수정 가능(`--fix`) 대상이라 `npm run lint`(프로젝트 실제 스크립트, `--fix` 포함) 실행 시 자동으로 해결되어 에러 0건으로 끝남. 이번 QA 대상이었던 항목과는 무관한 기존 스타일 이슈라 이 항목 판정에 영향 없음.

`npm test` 7개 전부 통과 재확인. 전체 아이템 최종 확인 차원에서 클린 빌드 후 실제 `start:prod` 진입점을 별도 포트(3099)로 직접 기동해 모든 모듈(`RefreshTokenCleanupService`가 속한 `AuthModule` 포함)과 라우트가 정상 등록되고 "Nest application successfully started" 로그와 `GET /api` 200 응답까지 확인, 프로세스 종료 후 포트 점유 없음 확인.

- [x] 구현 완료
- [x] QA 검증 완료

## 8. User 삭제 캐스케이드 전략 설계 🟡

- **파일**: `prisma/schema.prisma` 전반 (FK가 전부 `ON DELETE RESTRICT`)
- **문제**: 회원탈퇴 기능이 아직 없는데, 지금 스키마 그대로면 `RefreshToken`/`Run`/`GameSave`/`BattleSession`이 남아있는 한 `User` 삭제가 막힌다. 나중에 탈퇴 기능을 추가할 때 스키마 변경(`onDelete: Cascade` 등)이 필요해진다.
- **제안**: 지금 당장 구현하지 않더라도, 탈퇴 시 정책(완전 삭제 vs 익명화)을 먼저 정하고 필요한 모델에 `onDelete` 전략을 미리 기록해두면 나중에 마이그레이션 충격이 적다.
- **QA 방법**: 이 항목은 설계 문서화 항목 — 탈퇴 정책과 각 모델별 `onDelete` 방침이 문서에 기록됐는지만 확인(코드 구현은 별도 기능 스코프).

**QA 결과(2026-07-17)**: PASS. `BACKEND_DESIGN.md` §8.1에 완전 삭제 기본 정책, 모델별 방침(`RefreshToken`/`GameSave`/`BattleSession`+`BattleEvent` 캐스케이드, `Run`도 함께 삭제), 기능 도입 전까지 현재의 `RESTRICT` 유지 방침까지 명시됨. 스키마 자체는 아직 `RESTRICT` 그대로라 이번 커밋으로 인한 회귀 없음(의도한 대로 문서화만 진행됨) 확인.

- [x] 구현 완료
- [x] QA 검증 완료
