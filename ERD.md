# VARELION 최소 Prisma 스키마

## 1. 전체 모델 목록

```text
User
Character

CharacterCurrency

ItemDefinition
CharacterItem
CharacterEquipment

SkillDefinition
CharacterSkill

StageDefinition
CharacterStageProgress
CharacterIdleProgress
```

역할을 나누면 다음과 같습니다.

```text
계정
├── User
└── Character

재화
└── CharacterCurrency

아이템
├── ItemDefinition
├── CharacterItem
└── CharacterEquipment

스킬
├── SkillDefinition
└── CharacterSkill

스테이지
├── StageDefinition
├── CharacterStageProgress
└── CharacterIdleProgress
```

---

# 2. Enum 정의

문자열을 직접 저장하기보다 값의 종류가 제한적인 데이터는 Enum으로 정의합니다.

```prisma
enum CurrencyType {
  GOLD
  DIAMOND
  ABYSS_TOKEN
}

enum ItemType {
  WEAPON
  HELMET
  ARMOR
  GLOVES
  SHOES
  NECKLACE
  RING
  CONSUMABLE
  MATERIAL
}

enum ItemRarity {
  COMMON
  UNCOMMON
  RARE
  EPIC
  LEGENDARY
  MYTHIC
}

enum EquipmentSlot {
  WEAPON
  HELMET
  ARMOR
  GLOVES
  SHOES
  NECKLACE
  RING_LEFT
  RING_RIGHT
}

enum SkillType {
  ACTIVE
  PASSIVE
  ULTIMATE
}
```

초기 버전에서 모든 Enum 값이 확정되지 않았다면 너무 많은 종류를 미리 추가하지 않아도 됩니다.

---

# 3. 전체 schema.prisma 모델

```prisma
enum CurrencyType {
  GOLD
  DIAMOND
  ABYSS_TOKEN
}

enum ItemType {
  WEAPON
  HELMET
  ARMOR
  GLOVES
  SHOES
  NECKLACE
  RING
  CONSUMABLE
  MATERIAL
}

enum ItemRarity {
  COMMON
  UNCOMMON
  RARE
  EPIC
  LEGENDARY
  MYTHIC
}

enum EquipmentSlot {
  WEAPON
  HELMET
  ARMOR
  GLOVES
  SHOES
  NECKLACE
  RING_LEFT
  RING_RIGHT
}

enum SkillType {
  ACTIVE
  PASSIVE
  ULTIMATE
}

model User {
  id           BigInt   @id @default(autoincrement())
  email        String   @unique @db.VarChar(255)
  passwordHash String   @map("password_hash") @db.VarChar(255)
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  characters Character[]

  @@map("users")
}

model Character {
  id         BigInt @id @default(autoincrement())
  userId     BigInt @map("user_id")
  nickname   String @unique @db.VarChar(30)
  level      Int    @default(1)
  experience BigInt @default(0)

  currentHp Int @default(100) @map("current_hp")
  maxHp     Int @default(100) @map("max_hp")

  currentStageId BigInt? @map("current_stage_id")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user         User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  currentStage StageDefinition? @relation(
    "CharacterCurrentStage",
    fields: [currentStageId],
    references: [id],
    onDelete: SetNull
  )

  currencies     CharacterCurrency[]
  items          CharacterItem[]
  equipment      CharacterEquipment[]
  skills         CharacterSkill[]
  stageProgress  CharacterStageProgress[]
  idleProgress   CharacterIdleProgress?

  @@index([userId])
  @@index([currentStageId])
  @@index([level, experience])
  @@map("characters")
}

model CharacterCurrency {
  characterId BigInt       @map("character_id")
  currencyType CurrencyType @map("currency_type")
  amount        BigInt       @default(0)
  updatedAt     DateTime     @updatedAt @map("updated_at")

  character Character @relation(
    fields: [characterId],
    references: [id],
    onDelete: Cascade
  )

  @@id([characterId, currencyType])
  @@map("character_currencies")
}

model ItemDefinition {
  id   BigInt @id @default(autoincrement())
  code String @unique @db.VarChar(50)
  name String @db.VarChar(100)

  itemType ItemType   @map("item_type")
  rarity   ItemRarity

  baseAttack  Int @default(0) @map("base_attack")
  baseDefense Int @default(0) @map("base_defense")

  maxEnhancement Int     @default(0) @map("max_enhancement")
  isStackable    Boolean @default(false) @map("is_stackable")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  characterItems CharacterItem[]

  @@index([itemType])
  @@index([rarity])
  @@map("item_definitions")
}

model CharacterItem {
  id               BigInt @id @default(autoincrement())
  characterId      BigInt @map("character_id")
  itemDefinitionId BigInt @map("item_definition_id")

  quantity         Int @default(1)
  enhancementLevel Int @default(0) @map("enhancement_level")

  acquiredAt DateTime @default(now()) @map("acquired_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  character Character @relation(
    fields: [characterId],
    references: [id],
    onDelete: Cascade
  )

  itemDefinition ItemDefinition @relation(
    fields: [itemDefinitionId],
    references: [id],
    onDelete: Restrict
  )

  equipment CharacterEquipment?

  @@index([characterId])
  @@index([itemDefinitionId])
  @@index([characterId, itemDefinitionId])
  @@map("character_items")
}

model CharacterEquipment {
  characterId    BigInt        @map("character_id")
  slotType       EquipmentSlot @map("slot_type")
  characterItemId BigInt       @unique @map("character_item_id")

  equippedAt DateTime @default(now()) @map("equipped_at")

  character Character @relation(
    fields: [characterId],
    references: [id],
    onDelete: Cascade
  )

  characterItem CharacterItem @relation(
    fields: [characterItemId],
    references: [id],
    onDelete: Cascade
  )

  @@id([characterId, slotType])
  @@index([characterItemId])
  @@map("character_equipment")
}

model SkillDefinition {
  id   BigInt @id @default(autoincrement())
  code String @unique @db.VarChar(50)
  name String @db.VarChar(100)

  skillType SkillType @map("skill_type")
  maxLevel  Int       @default(1) @map("max_level")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  characterSkills CharacterSkill[]

  @@index([skillType])
  @@map("skill_definitions")
}

model CharacterSkill {
  characterId      BigInt @map("character_id")
  skillDefinitionId BigInt @map("skill_definition_id")

  skillLevel Int  @default(1) @map("skill_level")
  slotNumber Int? @map("slot_number")

  learnedAt DateTime @default(now()) @map("learned_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  character Character @relation(
    fields: [characterId],
    references: [id],
    onDelete: Cascade
  )

  skillDefinition SkillDefinition @relation(
    fields: [skillDefinitionId],
    references: [id],
    onDelete: Restrict
  )

  @@id([characterId, skillDefinitionId])
  @@index([skillDefinitionId])
  @@index([characterId, slotNumber])
  @@map("character_skills")
}

model StageDefinition {
  id   BigInt @id @default(autoincrement())
  code String @unique @db.VarChar(30)
  name String @db.VarChar(100)

  chapter     Int
  stageNumber Int @map("stage_number")

  recommendedPower BigInt @default(0) @map("recommended_power")

  goldPerSecond       BigInt @default(0) @map("gold_per_second")
  experiencePerSecond BigInt @default(0) @map("experience_per_second")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  currentCharacters Character[] @relation("CharacterCurrentStage")
  characterProgress CharacterStageProgress[]
  idleCharacters    CharacterIdleProgress[]

  @@unique([chapter, stageNumber])
  @@index([chapter])
  @@map("stage_definitions")
}

model CharacterStageProgress {
  characterId BigInt @map("character_id")
  stageId     BigInt @map("stage_id")

  isCleared      Boolean @default(false) @map("is_cleared")
  highestWave    Int     @default(0) @map("highest_wave")
  clearCount     Int     @default(0) @map("clear_count")
  bestClearTimeMs Int?   @map("best_clear_time_ms")

  firstClearedAt DateTime? @map("first_cleared_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  character Character @relation(
    fields: [characterId],
    references: [id],
    onDelete: Cascade
  )

  stage StageDefinition @relation(
    fields: [stageId],
    references: [id],
    onDelete: Cascade
  )

  @@id([characterId, stageId])
  @@index([stageId])
  @@index([characterId, isCleared])
  @@map("character_stage_progress")
}

model CharacterIdleProgress {
  characterId BigInt @id @map("character_id")
  farmingStageId BigInt @map("farming_stage_id")

  farmingStartedAt DateTime @default(now()) @map("farming_started_at")
  lastClaimedAt    DateTime @default(now()) @map("last_claimed_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  character Character @relation(
    fields: [characterId],
    references: [id],
    onDelete: Cascade
  )

  farmingStage StageDefinition @relation(
    fields: [farmingStageId],
    references: [id],
    onDelete: Restrict
  )

  @@index([farmingStageId])
  @@map("character_idle_progress")
}
```

---

# 4. 모델별 설계 목적

## User

로그인과 인증의 주체입니다.

```text
User
├── 이메일
├── 비밀번호 해시
└── 보유 캐릭터
```

```prisma
model User {
  id           BigInt @id @default(autoincrement())
  email        String @unique
  passwordHash String
}
```

비밀번호 원문을 저장하면 안 되며, Argon2id 또는 bcrypt 계열로 해시한 결과만 저장합니다.

---

## Character

캐릭터의 핵심 성장 상태를 저장합니다.

```text
Character
├── 소유 사용자
├── 닉네임
├── 레벨
├── 경험치
├── 현재 HP
├── 최대 HP
└── 현재 스테이지
```

캐릭터에 공격력과 방어력을 직접 저장하지 않은 이유는 장비, 스킬, 강화, 버프에 따라 계산되는 **파생 능력치**가 될 가능성이 높기 때문입니다.

초기에는 다음처럼 기본 능력치를 추가해도 됩니다.

```prisma
baseAttack  BigInt @default(10) @map("base_attack")
baseDefense BigInt @default(5) @map("base_defense")
```

하지만 최종 공격력 자체를 DB에 중복 저장하면 장비 변경 시 데이터 불일치가 생길 수 있습니다.

---

## CharacterCurrency

캐릭터가 보유한 재화를 저장합니다.

```text
캐릭터 1 + GOLD
캐릭터 1 + DIAMOND
캐릭터 1 + ABYSS_TOKEN
```

따라서 아래 조합을 복합 PK로 사용합니다.

```prisma
@@id([characterId, currencyType])
```

별도의 순차 `id`는 필요하지 않습니다.

---

## ItemDefinition

게임에 존재하는 아이템의 원본 정보입니다.

```text
낡은 철검
├── 코드: SWORD_001
├── 종류: WEAPON
├── 희귀도: COMMON
├── 기본 공격력: 10
└── 최대 강화: 10
```

운영자가 관리하는 마스터 데이터이며, 사용자가 소유한 개별 아이템과 분리합니다.

---

## CharacterItem

사용자가 실제로 보유한 아이템 인스턴스입니다.

```text
CharacterItem 1001
├── 아이템 원본: SWORD_001
├── 소유 캐릭터: 1
└── 강화 단계: +3

CharacterItem 1002
├── 아이템 원본: SWORD_001
├── 소유 캐릭터: 1
└── 강화 단계: +8
```

같은 아이템 정의를 기반으로 하더라도 강화 상태가 다르면 서로 다른 `CharacterItem`입니다.

따라서 순차 증가하는 PK가 필요합니다.

```prisma
id BigInt @id @default(autoincrement())
```

---

## CharacterEquipment

캐릭터의 장비 슬롯을 저장합니다.

```text
캐릭터 1 + WEAPON
캐릭터 1 + HELMET
캐릭터 1 + ARMOR
```

아래 조합을 PK로 사용합니다.

```prisma
@@id([characterId, slotType])
```

이렇게 하면 한 캐릭터가 같은 슬롯에 장비를 두 개 착용할 수 없습니다.

`characterItemId`에는 `@unique`가 있으므로 동일한 아이템 인스턴스가 여러 슬롯에 동시에 장착되는 것도 막을 수 있습니다.

```prisma
characterItemId BigInt @unique
```

단, 현재 모델만으로는 다음 잘못된 연결을 DB가 완전히 막지는 못합니다.

```text
캐릭터 A의 장비 슬롯
→ 캐릭터 B가 소유한 아이템
```

NestJS 서비스에서 장착 처리 전 다음을 반드시 검증해야 합니다.

```text
CharacterEquipment.characterId
==
CharacterItem.characterId
```

---

## SkillDefinition

게임에 존재하는 스킬 원본입니다.

```text
화염구
├── 코드: FIREBALL
├── 종류: ACTIVE
└── 최대 레벨: 10
```

아이템 정의와 마찬가지로 마스터 데이터입니다.

---

## CharacterSkill

캐릭터가 실제로 획득한 스킬과 레벨을 저장합니다.

```text
캐릭터 1 + FIREBALL
├── 스킬 레벨: 5
└── 장착 슬롯: 1
```

캐릭터 하나가 같은 스킬을 중복 보유할 필요가 없으므로 복합 PK를 사용합니다.

```prisma
@@id([characterId, skillDefinitionId])
```

`slotNumber`가 `null`이면 획득했지만 현재 스킬 바에는 장착하지 않은 상태로 볼 수 있습니다.

한 슬롯에 스킬 하나만 허용하려면 다음 제약을 고려할 수 있습니다.

```prisma
@@unique([characterId, slotNumber])
```

다만 PostgreSQL에서 `NULL`이 포함된 유일 제약의 동작과 스킬 해제 정책을 함께 고려해야 하므로, 초기에는 서비스 로직에서 검증해도 됩니다.

---

## StageDefinition

스테이지의 원본 정보입니다.

```text
1-1 스테이지
├── chapter: 1
├── stageNumber: 1
├── 권장 전투력
├── 초당 골드
└── 초당 경험치
```

스테이지 코드는 사람이 확인하기 쉬운 값으로 사용합니다.

```text
CHAPTER_1_STAGE_1
1-1
```

실제 관계와 조인에는 순차 `id`를 사용합니다.

챕터와 스테이지 번호의 조합도 중복되지 않도록 설정합니다.

```prisma
@@unique([chapter, stageNumber])
```

---

## CharacterStageProgress

캐릭터별 스테이지 진행 기록입니다.

```text
캐릭터 1 + 스테이지 1-1
├── 클리어 여부
├── 최고 웨이브
├── 클리어 횟수
└── 최고 클리어 시간
```

아래 조합이 하나의 진행 상태를 식별합니다.

```prisma
@@id([characterId, stageId])
```

---

## CharacterIdleProgress

방치 사냥 상태입니다.

캐릭터당 한 행만 필요하므로 `characterId` 자체가 PK입니다.

```prisma
characterId BigInt @id
```

방치 보상은 누적 금액을 그대로 저장하기보다 아래 데이터를 통해 서버에서 계산합니다.

```text
현재 서버 시간
- lastClaimedAt
= 방치 시간
```

그 뒤 현재 스테이지의 보상률을 적용합니다.

```text
유효 방치 시간
× StageDefinition.goldPerSecond
= 지급 골드
```

보상 지급과 `lastClaimedAt` 갱신은 하나의 DB 트랜잭션으로 처리해야 합니다.

---

# 5. 순차 ID와 복합 PK 적용 결과

## 순차 BigInt ID를 사용하는 모델

```text
User
Character
ItemDefinition
CharacterItem
SkillDefinition
StageDefinition
```

Prisma 표현:

```prisma
id BigInt @id @default(autoincrement())
```

## 복합 PK를 사용하는 모델

```text
CharacterCurrency
CharacterEquipment
CharacterSkill
CharacterStageProgress
```

Prisma 표현:

```prisma
@@id([fieldA, fieldB])
```

## 부모 PK를 그대로 사용하는 1:1 모델

```text
CharacterIdleProgress
```

Prisma 표현:

```prisma
characterId BigInt @id
```

---

# 6. 삭제 정책

관계별 삭제 정책은 다음 기준으로 잡았습니다.

## `onDelete: Cascade`

부모가 삭제되면 자식 데이터도 의미가 없어지는 경우입니다.

```text
User 삭제
→ Character 삭제

Character 삭제
→ 재화 삭제
→ 인벤토리 삭제
→ 장비 삭제
→ 스킬 삭제
→ 스테이지 기록 삭제
→ 방치 기록 삭제
```

## `onDelete: Restrict`

원본 데이터가 사용 중이면 삭제를 막아야 하는 경우입니다.

```text
ItemDefinition
SkillDefinition
StageDefinition
```

예를 들어 사용자가 보유한 아이템이 있는데 `ItemDefinition`을 삭제하면 데이터 해석이 불가능해질 수 있습니다.

실제 운영에서는 마스터 데이터를 삭제하기보다 다음과 같은 상태 컬럼을 추가하는 편이 안전합니다.

```prisma
isActive Boolean @default(true) @map("is_active")
```

---

# 7. 주의해야 할 BigInt 반환

Prisma의 `BigInt`는 TypeScript에서 JavaScript `bigint` 값으로 반환됩니다.

예:

```ts
const character = await prisma.character.findUnique({
  where: {
    id: 1n,
  },
})
```

다음과 같이 숫자를 사용할 수 있습니다.

```ts
const characterId = BigInt(1)
```

하지만 기본 `JSON.stringify()`는 `bigint`를 바로 직렬화할 수 없습니다.

NestJS API 응답 DTO에서는 보통 문자열로 변환합니다.

```ts
return {
  id: character.id.toString(),
  experience: character.experience.toString(),
}
```

초기 프로젝트에서 값이 JavaScript 안전 정수 범위를 넘지 않는다는 것이 확실하다면 `Int`를 쓸 수도 있지만, 경험치·골드·전투력처럼 커질 수 있는 게임 수치는 `BigInt`가 안전합니다.

---

# 8. 구현 순서

학습 목적으로 직접 구현한다면 아래 순서를 권장합니다.

```text
1. User
2. Character
3. CharacterCurrency
4. StageDefinition
5. CharacterStageProgress
6. CharacterIdleProgress
7. ItemDefinition
8. CharacterItem
9. CharacterEquipment
10. SkillDefinition
11. CharacterSkill
```

처음부터 모든 기능을 구현하지 말고 아래 단위로 마이그레이션해도 됩니다.

## 1차

```text
User
Character
CharacterCurrency
```

## 2차

```text
StageDefinition
CharacterStageProgress
CharacterIdleProgress
```

## 3차

```text
ItemDefinition
CharacterItem
CharacterEquipment
```

## 4차

```text
SkillDefinition
CharacterSkill
```

---

# 9. 마이그레이션 명령

스키마 작성 후 포맷을 정리합니다.

```bash
pnpm prisma format
```

스키마 유효성을 확인합니다.

```bash
pnpm prisma validate
```

개발용 마이그레이션을 생성하고 적용합니다.

```bash
pnpm prisma migrate dev --name init_game_schema
```

생성된 테이블을 확인합니다.

```bash
pnpm prisma studio
```

---

# 10. 초기 구현 범위 권장

VARELION `0.0.1`에서는 우선 아래 기능까지만 구현해도 충분합니다.

```text
User
├── 회원가입
└── 로그인

Character
├── 캐릭터 생성
├── 캐릭터 조회
└── 경험치 및 레벨

CharacterCurrency
├── 골드 조회
├── 골드 획득
└── 골드 차감

StageDefinition
├── 스테이지 정보
└── 방치 보상률

CharacterStageProgress
├── 현재 진행도
└── 클리어 처리

CharacterIdleProgress
├── 방치 시작
└── 방치 보상 수령
```

아이템·장비·스킬은 캐릭터와 스테이지 흐름이 안정적으로 작동한 다음 추가하는 편이 좋습니다.
