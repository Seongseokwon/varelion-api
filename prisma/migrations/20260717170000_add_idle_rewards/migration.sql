ALTER TABLE "GameSave" ADD COLUMN "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE "MetaLevelReached" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "level" INTEGER NOT NULL, "reachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MetaLevelReached_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "MetaLevelReached_userId_level_key" ON "MetaLevelReached"("userId", "level");
CREATE INDEX "MetaLevelReached_level_reachedAt_idx" ON "MetaLevelReached"("level", "reachedAt");
ALTER TABLE "MetaLevelReached" ADD CONSTRAINT "MetaLevelReached_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
