import type { Prisma } from '@prisma/client';

export async function recordMetaLevels(
  client: Prisma.TransactionClient,
  userId: string,
  before: number,
  after: number,
  reachedAt = new Date(),
): Promise<void> {
  for (let level = Math.max(1, before + 1); level <= after; level++) {
    await client.metaLevelReached.upsert({
      where: { userId_level: { userId, level } },
      create: { userId, level, reachedAt },
      update: {},
    });
  }
}
