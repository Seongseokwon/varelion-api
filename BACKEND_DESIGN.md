# 백엔드 설계 문서 — SurvivorWeb (NestJS)

> **문서 버전** v1.0 · 작성일 2026-07-09
> **대상** 학습하며 직접 구현할 개발자 본인
> **전제** 프론트는 이미 동작 중(`index.html`, LocalStorage 저장). 백엔드는 처음부터 새로 구축.

---

## 1. 백엔드가 이 게임에서 하는 일

별도 `varelion-design` 저장소의 게임 기획을 기준으로, 백엔드가 필요한 기능은 아래와 같다. **게임 플레이 자체(전투, 충돌, 레벨업)는 전부 클라이언트에서 돌아가고**, 백엔드는 "판이 끝난 뒤의 결과와 계정 데이터"만 다룬다. 실시간 서버가 아니라는 점이 설계 전체를 단순하게 만든다.

| 기능 | 설명 | 우선순위 |
|------|------|----------|
| 회원가입 / 로그인 | 이메일+비밀번호, JWT 인증 | 1 (기본) |
| 세이브 동기화 | LocalStorage에 있던 메타 진행(계정 레벨, 골드, 해금)을 서버에 저장 | 1 |
| 런(run) 기록 | 판 종료 시 결과(생존시간, 킬, 획득 재화) 제출·저장 | 2 |
| 리더보드 | 최고 생존시간/킬 랭킹 조회 | 2 |
| 데일리 챌린지 | 날짜별 고정 시드 제공 + 해당 시드 전용 리더보드 | 3 |
| 어드민/밸런스 데이터 | weapons/enemies JSON을 서버에서 서빙(선택) | 3 |

우선순위 순서대로 구현하면 그대로 학습 로드맵이 된다.

---

## 2. 기술 스택 (추천안과 이유)

| 영역 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | **NestJS** (TypeScript) | 모듈/DI/데코레이터 구조가 "설계를 배우기"에 가장 좋음 |
| DB | **PostgreSQL** | 무난한 표준. 랭킹 쿼리, JSONB(세이브 저장)까지 커버 |
| ORM | **Prisma** | 스키마 파일 하나로 모델·마이그레이션·타입이 전부 생성됨. 초심자 학습 곡선이 TypeORM보다 완만 |
| 인증 | **@nestjs/jwt + passport-jwt** | NestJS 공식 문서 예제가 이 조합. Access/Refresh 토큰 |
| 비밀번호 해시 | **argon2** (또는 bcrypt) | argon2가 현재 권장 표준 |
| 검증 | **class-validator + class-transformer** | DTO에 데코레이터만 붙이면 요청 검증 자동화 |
| 설정 | **@nestjs/config** + `.env` | 시크릿을 코드에서 분리 |
| API 문서 | **@nestjs/swagger** | 엔드포인트 만들 때마다 자동 문서화 — 학습에 특히 유용 |
| 요청 제한 | **@nestjs/throttler** | 점수 제출 스팸 방지 |
| 캐시/랭킹 | **Redis** (나중에) | 리더보드를 Sorted Set으로. 처음엔 PostgreSQL만으로 시작해도 충분 |
| 테스트 | **Jest + supertest** | Nest 기본 내장 |
| 호스팅 (확정) | **Railway** (`survivor-api`) + Postgres | 프론트는 **Vercel** |
| 로컬 인프라 | **Docker Compose** | PostgreSQL(+Redis)을 명령 한 줄로 실행 |

> **학습 팁**: 처음부터 Redis를 넣지 말 것. "PostgreSQL로 만들고 → 느려질 지점을 이해하고 → Redis로 교체"하는 순서가 캐시를 배우는 가장 좋은 방법이다.

### 2.1 리더보드 캐시 전환 기준

운영 데이터에서 아래 조건 중 하나가 충족되면 PostgreSQL 전체 집계를 Redis Sorted Set 기반으로 전환한다.

- `Run` 테이블이 100,000행 이상
- `GET /leaderboard` 또는 `GET /leaderboard/me`의 p95 응답 시간이 7일 관측 기준 200ms 초과

전환 시 쓰기 경로에서 유저별 집계 점수를 갱신하고, Redis 장애 시 PostgreSQL 쿼리로 폴백한다. 행 수는 주 1회, p95는 운영 모니터링에서 확인한다.

---

## 3. 전체 아키텍처

```
[브라우저 게임 (index.html)]
        │ HTTPS (REST + JSON)
        ▼
[NestJS API 서버]
  ├─ AuthModule        회원가입/로그인/토큰 재발급
  ├─ UsersModule       프로필, 계정 관리
  ├─ SavesModule       메타 진행 저장/불러오기 (세이브 동기화)
  ├─ RunsModule        판 결과 제출/조회
  ├─ LeaderboardModule 랭킹 조회
  ├─ ChallengesModule  데일리 챌린지 시드
  └─ (공통) ConfigModule, PrismaModule, Guards, Filters, Interceptors
        │
        ▼
[PostgreSQL]  (+ 나중에 Redis)
```

### 3.1 NestJS 계층 구조 (모든 모듈 공통 패턴)

```
Controller  →  요청/응답만 담당 (라우팅, DTO 검증, 상태코드)
Service     →  비즈니스 로직 (검증 규칙, 계산, 트랜잭션)
Repository  →  DB 접근 (Prisma 호출)  ※ 작게 시작할 땐 Service에 합쳐도 됨
```

**규칙 하나만 기억**: Controller에 로직을 쓰지 말 것. Controller는 얇게, Service는 두껍게.

### 3.2 폴더 구조 예시

```
src/
├── main.ts                  # 부트스트랩 (ValidationPipe, Swagger 설정)
├── app.module.ts
├── prisma/
│   ├── prisma.module.ts
│   └── prisma.service.ts    # PrismaClient 래퍼 (전역 주입)
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts   # POST /auth/register, /auth/login, /auth/refresh
│   ├── auth.service.ts
│   ├── strategies/jwt.strategy.ts
│   ├── guards/jwt-auth.guard.ts
│   └── dto/ (register.dto.ts, login.dto.ts)
├── users/
├── saves/
├── runs/
├── leaderboard/
├── challenges/
└── common/
    ├── decorators/current-user.decorator.ts
    ├── filters/http-exception.filter.ts
    └── interceptors/logging.interceptor.ts
prisma/
└── schema.prisma            # DB 스키마 단일 소스
docker-compose.yml
.env
```

---

## 4. 데이터베이스 설계 (Prisma 스키마)

```prisma
// prisma/schema.prisma

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  nickname     String   @unique
  createdAt    DateTime @default(now())

  save          GameSave?
  runs          Run[]
  refreshTokens RefreshToken[]
}

// 로그아웃/토큰 탈취 대응을 위해 refresh 토큰을 서버에 기록
model RefreshToken {
  id        String   @id @default(uuid())
  tokenHash String            // 토큰 원문이 아닌 해시를 저장
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  expiresAt DateTime
  revoked   Boolean  @default(false)
  createdAt DateTime @default(now())
}

// 메타 진행 = 지금 LocalStorage의 save 객체가 그대로 서버로 옮겨오는 것
model GameSave {
  id        String   @id @default(uuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id])
  metaLevel Int      @default(1)
  metaXp    Int      @default(0)
  gold      Int      @default(0)
  data      Json     @default("{}")  // seenJobs, 해금, 설정 등 유연한 부분은 JSONB로
  version   Int      @default(0)     // 동기화 충돌 감지용 (후술)
  updatedAt DateTime @updatedAt
}

// 판 하나의 결과 기록 (리더보드의 원천 데이터)
model Run {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  job          String              // 플레이한 직업
  survivalTime Int                 // 초 단위
  kills        Int
  level        Int                 // 세션 레벨
  goldEarned   Int
  challengeId  String?             // 데일리 챌린지 런이면 연결
  challenge    DailyChallenge? @relation(fields: [challengeId], references: [id])
  createdAt    DateTime @default(now())

  @@index([survivalTime(sort: Desc)])          // 전체 리더보드용
  @@index([challengeId, survivalTime(sort: Desc)]) // 챌린지 리더보드용
  @@index([userId, createdAt])
}

model DailyChallenge {
  id    String   @id @default(uuid())
  date  DateTime @unique @db.Date  // 하루 하나
  seed  String                     // 클라이언트가 이 시드로 스폰을 고정
  runs  Run[]
}
```

**설계 포인트 세 가지**

1. **`GameSave`는 고정 컬럼 + JSONB 혼합.** 자주 조회·정렬하는 값(metaLevel, gold)은 컬럼으로, 구조가 자주 바뀔 값(seenJobs, 설정)은 `data` JSONB로. "스키마를 언제 컬럼으로 승격시키는가"를 배우는 좋은 소재.
2. **리더보드는 별도 테이블이 아니라 `Run`에서 쿼리로 뽑는다.** `ORDER BY survivalTime DESC LIMIT 100`. 인덱스가 왜 필요한지 여기서 체감하게 된다.
3. **RefreshToken을 DB에 두는 이유**: JWT는 발급 후 서버가 취소할 수 없다. refresh 토큰만이라도 DB에 기록해두면 로그아웃·강제 만료가 가능해진다.

---

## 5. API 설계

모든 응답은 JSON. 인증 필요 API는 `Authorization: Bearer <accessToken>` 헤더.

### 5.1 인증 (AuthModule)

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| POST | `/auth/register` | 가입 (email, password, nickname) | ✕ |
| POST | `/auth/login` | 로그인 → `{ accessToken, refreshToken }` | ✕ |
| POST | `/auth/refresh` | refresh로 access 재발급 | ✕(refresh) |
| POST | `/auth/logout` | refresh 토큰 폐기 | ○ |

- **accessToken**: 수명 15분. 매 요청 헤더에 실어 보냄.
- **refreshToken**: 수명 14일. 재발급 전용. DB에 해시로 기록.

### 5.2 유저 / 세이브

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/users/me` | 내 프로필 | ○ |
| GET | `/saves/me` | 내 세이브 조회 (게임 시작 시 호출) | ○ |
| PUT | `/saves/me` | 세이브 저장 (판 종료·메뉴 복귀 시 호출) | ○ |

**세이브 동기화 전략 (중요)**

```
게임 시작 → GET /saves/me → 서버 세이브를 LocalStorage에 반영
판 종료   → 로컬 갱신 → PUT /saves/me (version 포함)
```

- `PUT` 요청에 클라이언트가 알고 있는 `version`을 함께 보낸다.
- 서버는 DB의 version과 다르면 `409 Conflict`를 반환 → 클라이언트는 다시 GET 후 병합.
- 이것이 **낙관적 잠금(optimistic locking)** — 두 기기에서 동시에 플레이할 때 세이브가 서로 덮어쓰는 사고를 막는다.
- 오프라인 플레이도 가능해야 하므로 LocalStorage는 유지하고, 서버는 "백업+동기화" 역할.

### 5.3 런 / 리더보드 / 챌린지

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| POST | `/runs` | 판 결과 제출 | ○ |
| GET | `/runs/me?limit=20` | 내 최근 기록 | ○ |
| GET | `/leaderboard?by=survivalTime&limit=100` | 전체 랭킹 | ✕ |
| GET | `/leaderboard/me` | 내 순위 | ○ |
| GET | `/challenges/today` | 오늘의 시드 | ✕ |
| GET | `/challenges/:id/leaderboard` | 챌린지 랭킹 | ✕ |

---

## 6. 인증 흐름 상세 (구현 순서 그대로)

```
[가입]   password → argon2.hash → User 저장
[로그인] argon2.verify → 성공 시
         accessToken  = JWT { sub: userId, nickname } (15m)
         refreshToken = 랜덤 문자열 → 해시를 RefreshToken 테이블에 저장 (14d)
[요청]   JwtAuthGuard가 헤더의 access 토큰 검증 → req.user 주입
[만료]   401 수신 → POST /auth/refresh → 새 access 발급
[로그아웃] RefreshToken.revoked = true
```

NestJS 구현 요소: `JwtStrategy`(passport-jwt) → `JwtAuthGuard` → `@CurrentUser()` 커스텀 데코레이터로 컨트롤러에서 유저 꺼내기. 이 4개 파일이 인증 학습의 핵심이다.

---

## 7. 치팅(부정 제출) 대응 — 현실적인 수준

클라이언트에서 게임이 전부 돌아가므로 **완벽한 치팅 방지는 불가능**하다. 리더보드가 걸린 만큼 "쉬운 조작은 막는" 수준을 목표로 한다.

1. **서버 측 상식 검증** (RunsService에서): 생존시간 대비 킬 수가 물리적으로 가능한 범위인지, 생존시간이 세션 상한(예: 20분)을 넘지 않는지, 직전 제출과의 간격이 생존시간보다 짧지 않은지("10분 생존" 기록을 1분 만에 두 번 제출 불가).
2. **Rate limiting**: `@nestjs/throttler`로 `/runs` 제출 빈도 제한.
3. **세이브 검증**: PUT /saves/me에서 gold/metaXp의 증가폭이 최근 런 기록과 비교해 상식적인지 확인(선택).
4. 그 이상(리플레이 검증, 서버 시뮬레이션)은 이 규모에선 과잉 — 하지 않는다.

---

## 8. 공통 인프라 (모든 Nest 프로젝트의 기본기)

- **ValidationPipe 전역 등록** (`main.ts`): `whitelist: true, transform: true` — DTO에 없는 필드 자동 제거. 모든 입력 검증의 시작점.
- **전역 예외 필터**: 에러 응답 형태를 `{ statusCode, message, error }`로 통일.
- **로깅 인터셉터**: 요청 메서드/경로/소요시간 로그. 나중에 pino로 교체 가능.
- **CORS**: 게임이 정적 호스팅(다른 도메인)에서 서빙되므로 반드시 설정.
- **환경변수**: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGIN`. `.env`는 git에 커밋하지 않는다.
- **헬스체크**: `GET /health` — 배포·모니터링의 최소 단위.

### 8.1 회원탈퇴 데이터 정책

회원탈퇴는 개인정보를 남기지 않는 **완전 삭제**를 기본 정책으로 한다. 탈퇴 기능 구현 시 하나의 트랜잭션에서 자식 데이터를 먼저 삭제한 뒤 User를 삭제한다. 모델별 방침은 `RefreshToken`, `GameSave`, `BattleSession`(하위 `BattleEvent` 포함)은 캐스케이드 삭제, `Run`은 리더보드 기록까지 함께 삭제다. Prisma 관계에는 해당 기능 마이그레이션에서 `onDelete: Cascade`를 적용한다. 기능 도입 전에는 현재의 `RESTRICT`를 유지해 실수로 User만 삭제되어 고아 데이터가 생기는 일을 막는다.

```yaml
# docker-compose.yml (로컬 개발용)
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
      POSTGRES_DB: survivor
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
volumes:
  pgdata:
```

---

## 9. 구현 로드맵 (학습 순서)

각 단계는 "동작 확인 가능한 상태"로 끝난다. Swagger UI(`/api`)에서 직접 눌러보며 확인할 것.

### Phase 1 — 뼈대와 인증 (기본기)
1. `nest new survivor-api` + Docker Compose로 PostgreSQL 실행
2. Prisma 셋업, User 모델, 마이그레이션 1회 경험
3. 회원가입 (DTO 검증 + argon2 해시)
4. 로그인 + JWT 발급 + JwtAuthGuard + `GET /users/me`
5. refresh 토큰 재발급/로그아웃
   - **배우는 것**: 모듈/DI, DTO·ValidationPipe, Guard·Strategy, 마이그레이션

### Phase 2 — 세이브 동기화 (이 게임의 첫 실용 기능)
6. GameSave 모델 + GET/PUT `/saves/me`
7. version 기반 낙관적 잠금 (409 처리)
8. **프론트 연결**: `index.html`의 `loadSave`/`writeSave`에 fetch 추가 — 서버 로그인 시 서버 세이브 우선, 비로그인 시 기존 LocalStorage 동작 유지
   - **배우는 것**: JSONB 설계, 동시성 문제, 프론트-백 연동

### Phase 3 — 런 기록과 리더보드
9. POST `/runs` (+ 7장의 상식 검증, throttler)
10. GET `/leaderboard` — 인덱스 유무에 따른 쿼리 성능 비교해볼 것 (`EXPLAIN ANALYZE`)
11. 프론트 `gameOver`에서 결과 제출, 메인 화면에 랭킹 표시

### Phase 4 — 데일리 챌린지와 다듬기
12. DailyChallenge: 매일 자정 시드 생성(`@nestjs/schedule` 크론) + 챌린지 리더보드
13. 예외 필터/로깅/헬스체크 정리, e2e 테스트(supertest) 2~3개 작성
14. 배포: **Railway에 확정 배포** (`survivor-api/railway.json`, Postgres 포함). 프론트는 **Vercel**.

### Phase 5 — 심화 (선택)
15. 리더보드 Redis Sorted Set 캐시로 교체 (`ZADD`/`ZREVRANGE`) — 3장 학습 팁 참고
16. 밸런스 데이터(weapons/enemies JSON) 서버 서빙 + 어드민 수정 API

---

## 10. 자주 마주칠 함정 (미리 알아두기)

- **JWT_SECRET을 코드에 하드코딩** → 반드시 `.env`. 유출 시 전 계정 위조 가능.
- **비밀번호 평문/단순 해시(md5, sha256) 저장** → argon2/bcrypt만.
- **Controller에서 Prisma 직접 호출** → 당장은 편하지만 테스트·재사용 불가. Service를 거칠 것.
- **마이그레이션 없이 DB 직접 수정** → `prisma migrate dev`만 사용. 스키마 이력이 곧 문서다.
- **에러를 그대로 클라이언트에 노출** → Prisma 에러 메시지에는 스키마 정보가 담긴다. 예외 필터로 감쌀 것.
- **CORS 전체 허용(`*`)인 채 배포** → 개발 중에만. 배포 시 게임 도메인만 허용.

---

## 11. 참고 문서

- NestJS 공식: https://docs.nestjs.com (특히 First steps → Techniques/Validation → Security/Authentication 순서로)
- Prisma 공식: https://www.prisma.io/docs
- 별도 [`varelion-design`](https://github.com/Seongseokwon/varelion-design) 저장소의 게임 기획이 이 문서의 기능 근거다.

---

*이 문서는 설계 기준선이다. 구현하다가 더 나은 방법을 발견하면 문서를 고치면 된다 — 문서가 코드를 따라가는 것이 정상이다.*
