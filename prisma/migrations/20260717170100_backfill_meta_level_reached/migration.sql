-- 실제 최초 도달 시각이 없는 기존 계정은 마지막 세이브 갱신 시각을 근사치로 사용한다.
INSERT INTO "MetaLevelReached" ("id", "userId", "level", "reachedAt") SELECT gen_random_uuid()::text, "userId", "metaLevel", "updatedAt" FROM "GameSave" ON CONFLICT ("userId", "level") DO NOTHING;
