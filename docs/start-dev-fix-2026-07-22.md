# `npm run start:dev` 오류 원인 분석 및 수정 내역

날짜: 2026-07-22

## 배경

`schema.prisma`의 `generator client` 설정을 다음과 같이 커스텀 경로로 바꾼 뒤부터 `npm run start:dev`가 실패했습니다.

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../generated/prisma"
  moduleFormat = "cjs"
}
```

출력 경로가 `@prisma/client`(npm 패키지 기본 위치)가 아니라 `generated/prisma`로 바뀌었는데, 코드 곳곳은 여전히 예전 경로/이름을 참조하고 있어서 연쇄적으로 문제가 발생했습니다.

## 원인 체인

1. **`prisma.service.ts`가 잘못된 경로에서 import**
   `import { PrismaClient } from '@prisma/client'` → 실제 클라이언트는 `generated/prisma`에 생성되므로 `@prisma/client`엔 유효한 `PrismaClient`가 없어 컴파일 에러 발생.

2. **연쇄 컴파일 에러**
   - `UsersService`: `PrismaService`가 깨져 있어서 `this.prisma.user`를 인식 못 함
   - `UserEntity`: enum 이름이 스키마에서 `Role` → `UserRole`로 바뀌었는데 엔티티는 여전히 `Role`을 import

3. **컴파일은 통과했지만 런타임에서 또 실패**
   컴파일 에러를 모두 잡은 뒤 실행하면 다음 에러가 발생:
   ```
   PrismaClientInitializationError: PrismaClient was instantiated without any options.
   A driver adapter is required to connect to your database.
   ```
   Prisma 7의 새 `prisma-client` 제너레이터는 (기존 `prisma-client-js`와 다르게) `new PrismaClient()`를 인자 없이 생성하는 걸 허용하지 않고, **driver adapter**를 명시적으로 넘겨야 합니다.

## 수정 내역

### 1. `src/prisma/prisma.service.ts` — import 경로 수정 + driver adapter 연결

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from 'generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

### 2. `src/users/entities/user.entity.ts` — enum 이름 동기화

```diff
- import { Role } from "generated/prisma/enums";
+ import { UserRole } from "generated/prisma/enums";

- role!: Role;
+ userRole!: UserRole;
```

### 3. 패키지 설치

```bash
pnpm add @prisma/adapter-pg pg
```

## 검증

- `npx tsc --noEmit -p tsconfig.json` → 에러 0개
- `npm run start:dev` → `Nest application successfully started` 로그 확인, `/users/create` 라우트 정상 매핑

## 배운 점 (참고)

- Prisma의 `generator client`에서 `output` 경로를 커스텀하면, 그 경로를 참조하는 **모든** import 문을 함께 바꿔야 합니다 (`@prisma/client` → 커스텀 경로).
- Prisma 7의 새 `prisma-client` 제너레이터는 기존 `prisma-client-js`와 달리 **driver adapter가 필수**입니다. `datasource`에 `url`만 넣는 걸로는 부족합니다.
