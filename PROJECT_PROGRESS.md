# Varelion API 개발 진행 기록

작성일: 2026-07-22  
프로젝트: NestJS + Prisma + PostgreSQL 기반 웹게임 API

이 문서는 지금까지 진행한 인증 구현 관련 대화와 프로젝트 점검 결과를 집에서 다시 확인할 수 있도록 압축한 기록이다.

## 1. 이번 단계의 목표

처음 구현 가이드에서 정한 범위는 다음과 같다.

- 사용자 회원가입
- 이메일 중복 검사
- Argon2 비밀번호 해싱
- 로그인
- JWT Access Token 발급
- JWT 인증 처리
- 로그인한 사용자 정보 조회
- 응답에서 `passwordHash` 제외

이번 단계에서 제외한 기능:

- Refresh Token
- 로그아웃
- 이메일 인증
- 비밀번호 재설정
- 소셜 로그인
- 토큰 블랙리스트
- 다중 기기 로그인 관리

권장 의존성 방향:

```text
AuthModule
    ↓
UsersModule
    ↓
PrismaModule
```

`AuthService`가 인증 흐름을 담당하고, `UsersService`는 사용자 DB 생성·조회만 담당한다.

## 2. 개발 환경과 데이터베이스

Docker Compose로 PostgreSQL 17을 실행하도록 구성했다.

```text
호스트: 127.0.0.1
호스트 포트: 7270
컨테이너 포트: 5432
데이터베이스: varelion
컨테이너: varelion-postgres
```

관련 파일:

- `compose.yaml`
- `.env`의 `DATABASE_URL`
- `prisma/schema.prisma`
- `prisma/migrations/`

주요 명령:

```bash
docker compose up -d
docker compose ps
docker compose logs -f postgres
docker compose down
```

DB 데이터까지 제거할 때만 다음 명령을 사용한다.

```bash
docker compose down -v
```

Prisma 명령:

```bash
pnpm prisma format
pnpm prisma validate
pnpm prisma migrate status
pnpm prisma migrate dev --name <migration_name>
pnpm prisma generate
```

현재 PostgreSQL 컨테이너와 DB 연결은 정상이며, Prisma migration 2개가 적용된 상태로 확인했다.

## 3. Prisma 모델 관련 결정

현재 `User` 모델의 핵심 구조:

```prisma
enum UserRole {
  USER
  ADMIN

  @@map("Role")
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  userRole     UserRole @default(USER) @map("user_role")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("users")
}
```

### `@@map("users")`의 의미

Prisma 코드에서는 모델 이름을 `User`로 사용하지만 실제 PostgreSQL 테이블은 `users`로 생성한다.

```text
Prisma 모델: User
PostgreSQL 테이블: users
```

`User`라는 기본 테이블이 PostgreSQL에 이미 있어서 사용하는 것은 아니다. PostgreSQL의 `USER` 키워드와 혼동될 가능성을 줄이고, DB에서 소문자·복수형 명명 규칙을 사용하기 위한 목적이 크다.

### `@map`과 `@@map`

```prisma
passwordHash String @map("password_hash")
```

- `@map`: Prisma 필드와 DB 컬럼 이름 연결
- `@@map`: Prisma 모델과 DB 테이블 이름 연결

### `@db.*` native type

필요한 경우 PostgreSQL의 실제 타입을 명시할 수 있다.

```prisma
email     String   @db.VarChar(255)
createdAt DateTime @db.Timestamptz(3)
```

이점:

- DB 수준의 길이 및 타입 규칙 보장
- 기존 DB 스키마와 정확하게 일치
- 시간대 의미를 명확하게 표현

단점:

- PostgreSQL에 대한 종속성이 강해짐
- 모든 필드에 습관적으로 작성하면 스키마가 복잡해짐

특별한 DB 타입 요구가 없다면 Prisma 기본 타입을 사용해도 된다.

## 4. displayName 기본값 아이디어

논의한 형식:

```text
(KR)20260722124813(a3f9)
```

구성:

```text
(region) + UTC 타임스탬프 + UUID 일부
```

이 값은 같은 레코드의 `region`과 현재 시각, UUID를 조합해야 하므로 Prisma의 단순 `@default()`로 만들기보다는 서비스 계층에서 생성하는 것이 적합하다.

예시:

```ts
import { randomUUID } from 'node:crypto';

function createDefaultDisplayName(region: string): string {
  const now = new Date();
  const timestamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0'),
  ].join('');

  const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
  return `(${region})${timestamp}(${suffix})`;
}
```

UUID를 4자리만 사용하면 경우의 수가 `16^4 = 65,536`이라 충돌 가능성이 있다. unique 값으로 사용할 경우 8자리 이상 또는 충돌 재시도 처리를 권장한다.

이 아이디어는 논의만 했으며 현재 Prisma 모델에는 아직 반영하지 않았다.

## 5. 현재 회원가입 구현 상태

현재 구현된 흐름:

```text
POST /auth/register
→ RegisterDto 검증
→ 이메일 소문자 변환 및 trim
→ UsersService.findByEmail()
→ 중복이면 ConflictException
→ Argon2 해싱
→ UsersService.create()
→ UserEntity 반환
```

잘 구현된 부분:

- `POST /auth/register`
- `@IsEmail()`
- 비밀번호 `@MinLength(8)`
- 이메일 정규화
- 사전 중복 이메일 검사
- Argon2 해싱
- `UserEntity`의 `@Exclude()`로 `passwordHash` 응답 제외
- 의존성 방향을 `AuthModule → UsersModule → PrismaModule`로 수정

개선할 부분:

1. `register.dto..ts` 파일명에 점이 하나 더 있다.

```text
현재: register.dto..ts
권장: register.dto.ts
```

2. `UsersService.create()`가 `RegisterDto`를 받으면 안 된다.

현재 `dto.password`에는 평문이 아니라 해시가 들어가 있어 이름과 실제 의미가 다르다.

권장 입력:

```ts
type CreateUserData = {
  email: string;
  passwordHash: string;
};
```

```ts
await this.usersService.create({
  email,
  passwordHash,
});
```

3. 동시 회원가입에 따른 DB unique 오류를 처리해야 한다.

사전 중복 검사를 하더라도 요청이 동시에 들어오면 Prisma `P2002` 오류가 발생할 수 있다. 이를 `409 Conflict`로 변환해야 한다.

4. `AuthService.create()`는 `register()`라는 이름이 더 명확하다.

5. 비밀번호 최대 길이 검증도 추가하는 것이 좋다.

## 6. 현재 로그인 구현 상태

현재 구현된 흐름:

```text
POST /auth/login
→ LoginDto 검증
→ 이메일 정규화
→ 이메일로 사용자 조회
→ 사용자가 없으면 401
→ Argon2로 비밀번호 검증
→ 틀리면 동일한 401 메시지
→ JWT Access Token 생성
→ Access Token 반환
```

잘 구현된 부분:

- 존재하지 않는 이메일과 틀린 비밀번호에 동일한 메시지 사용
- `argon2.verify(저장된 해시, 입력 평문)` 순서 정상
- JWT Access Token 발급
- Refresh Token을 아직 반환하지 않음

개선할 부분:

1. JWT 환경변수 이름이 불일치한다.

`AuthModule`은 `JWT_ACCESS_SECRET`을 요구하지만 `.env`에는 점검 당시 `JWT_SECRET`이 있었다. 다음처럼 통일하는 것이 좋다.

```env
JWT_ACCESS_SECRET="충분히-긴-비밀값"
JWT_ACCESS_EXPIRES_IN="1h"
```

실제 비밀값은 이 문서에 기록하지 않는다.

2. 만료 시간이 현재 `'1h'`로 하드코딩돼 있다. `JWT_ACCESS_EXPIRES_IN` 값을 읽도록 변경한다.

3. JWT 사용자 ID는 일반적인 관례와 가이드에 따라 `id`보다 `sub`를 권장한다.

```ts
type JwtPayload = {
  sub: string;
  email: string;
  userRole: UserRole;
};
```

4. `userRole` 타입을 `string`이 아니라 Prisma의 `UserRole` enum으로 지정한다.

5. 로그인 응답 타입을 명확하게 만든다.

```ts
type LoginResponse = {
  accessToken: string;
};
```

현재 `GenerateTokenResponse`에 정의된 `refreshToken`은 이번 단계 범위에서 제거한다.

## 7. 테스트와 import 문제

마지막 점검 결과:

```text
TypeScript build: 성공
ESLint: 성공
기본 unit test: 1개 성공
E2E test: 실패
```

현재 기본 단위 테스트는 `Hello World!`만 확인하며 회원가입과 로그인은 테스트하지 않는다.

E2E 실패 원인은 `src/...`와 `generated/...` 절대 import를 Jest가 해석하지 못하기 때문이다.

예:

```ts
import { UsersService } from 'src/users/users.service';
```

해결 방법:

- 상대경로 import 사용
- 또는 Jest `moduleNameMapper`에 alias 설정

상대경로 예:

```ts
import { UsersService } from '../users/users.service';
```

Prisma Client import도 같은 기준으로 확인해야 한다.

E2E가 성공하기 전까지 회원가입과 로그인이 실제 HTTP 요청으로 정상 동작한다고 완료 판정하면 안 된다.

## 8. 공개 사용자 조회 API 주의

현재 다음과 같은 공개 API가 있다.

```text
GET /users/find-by-email/:email
```

이 API는 특정 이메일의 가입 여부를 외부에서 확인할 수 있게 하므로 계정 열거에 악용될 수 있다. 로그인과 회원가입 내부 처리에만 필요하다면 Controller에서는 제거하고 `UsersService.findByEmail()`만 유지하는 것이 좋다.

`findProfileById()`는 Prisma `select`를 사용해 DB 조회 단계부터 `passwordHash`를 가져오지 않는 것을 권장한다.

```ts
return this.prisma.user.findUnique({
  where: { id },
  select: {
    id: true,
    email: true,
    userRole: true,
    createdAt: true,
    updatedAt: true,
  },
});
```

`@Exclude()`는 추가 방어 수단으로 유지할 수 있다.

## 9. 로그인 응답과 웹게임 진입 흐름 결정

논의한 선택지:

1. 로그인 성공 시 Access Token과 사용자 정보를 함께 반환
2. Access Token만 반환하고 FE에서 사용자 정보 API를 다시 호출

일반적인 웹서비스에서는 다음 혼합 방식도 많이 사용한다.

```text
로그인 성공
→ Access Token + 최소 사용자 정보

새로고침 또는 앱 재접속
→ GET /users/me로 사용자 상태 복원
```

하지만 이 프로젝트는 로그인 후 캐릭터 선택 화면을 반드시 거친다는 전제가 있다. 이 경우 인증과 로비 데이터를 분리하는 것이 자연스럽다.

권장 흐름:

```text
POST /auth/login
→ Access Token

GET /game/lobby
→ 최소 계정 정보 + 캐릭터 목록

POST /game/enter
→ 캐릭터 소유권 확인 + 게임 초기 데이터
```

예시 로그인 응답:

```json
{
  "accessToken": "..."
}
```

예시 로비 응답:

```json
{
  "user": {
    "id": "user-id",
    "displayName": "플레이어1234"
  },
  "characters": [
    {
      "id": "character-id",
      "displayName": "엘리시아",
      "level": 15,
      "class": "MAGE"
    }
  ]
}
```

게임 진입 시 서버는 반드시 다음을 검증해야 한다.

```text
Access Token의 userId
+ 요청의 characterId
→ 해당 캐릭터가 로그인 사용자의 소유인지 확인
```

권장 모듈 책임:

- `AuthModule`: 로그인, 토큰 발급 및 검증
- `UsersModule`: 계정 데이터
- `CharactersModule`: 캐릭터 생성·조회
- `GameModule`: 로비, 캐릭터 선택, 게임 진입

JWT payload는 쉽게 디코딩할 수 있고 최신 사용자 상태가 아닐 수 있으므로 화면 데이터의 원본으로 사용하지 않는다. 화면에 표시할 최신 정보는 API에서 조회한다.

## 10. 다음 작업 순서

로그인 이후 JWT Guard로 넘어가기 전에 다음 순서로 정리하는 것을 권장한다.

```text
1. JWT_ACCESS_SECRET 환경변수 이름 통일
2. register.dto..ts → register.dto.ts 파일명 수정
3. 절대경로 import 또는 Jest alias 문제 해결
4. UsersService.create()가 passwordHash를 받도록 변경
5. Prisma P2002를 409 Conflict로 변환
6. AuthService.create()를 register()로 변경
7. JWT payload의 id를 sub로 변경
8. JWT 및 로그인 응답 타입 정리
9. 회원가입 단위 테스트 작성
10. 로그인 단위 테스트 작성
11. register → login E2E 테스트 작성
12. JwtStrategy와 JwtAuthGuard 구현
13. GET /users/me 또는 GET /game/lobby 구현
14. 이후 Character 모델과 캐릭터 선택 흐름 구현
```

## 11. 현재 단계의 완료 기준

회원가입:

```text
[ ] 정상 입력은 201
[ ] 이메일이 소문자로 저장됨
[ ] 비밀번호가 Argon2 해시로 저장됨
[ ] 응답에 passwordHash가 없음
[ ] 중복 이메일은 항상 409
[ ] 잘못된 DTO는 400
```

로그인:

```text
[ ] 올바른 정보는 Access Token 반환
[ ] 존재하지 않는 이메일은 401
[ ] 잘못된 비밀번호는 401
[ ] 두 실패의 외부 메시지가 동일함
[ ] JWT payload에 sub, email, userRole 포함
[ ] JWT Secret과 만료 시간이 환경변수에서 로드됨
```

테스트:

```text
[ ] build 성공
[ ] lint 성공
[ ] 회원가입·로그인 unit test 성공
[ ] E2E test 성공
[ ] 실제 PostgreSQL을 이용한 register → login 흐름 성공
```

---

이 문서는 대화 내용을 압축한 참고 기록이다. 실제 코드 상태가 변경되면 테스트 결과와 체크리스트를 다시 갱신한다.
