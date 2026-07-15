-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "leaderboardEligible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "BattleSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "BattleSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BattleEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BattleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BattleSession_userId_idx" ON "BattleSession"("userId");

-- CreateIndex
CREATE INDEX "BattleEvent_sessionId_idx" ON "BattleEvent"("sessionId");

-- AddForeignKey
ALTER TABLE "Run" ADD CONSTRAINT "Run_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BattleSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleSession" ADD CONSTRAINT "BattleSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BattleEvent" ADD CONSTRAINT "BattleEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BattleSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
