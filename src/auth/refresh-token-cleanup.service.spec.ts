import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';
import { PrismaService } from '../prisma/prisma.service';

interface DeleteManyArgs {
  where: {
    OR: [{ expiresAt: { lt: Date } }, { revoked: true }];
  };
}

describe('RefreshTokenCleanupService', () => {
  it('deletes expired or revoked refresh tokens', async () => {
    const deleteMany = jest.fn(
      async (_args: DeleteManyArgs): Promise<{ count: number }> => ({
        count: 2,
      }),
    );
    const prisma = { refreshToken: { deleteMany } } as unknown as PrismaService;
    const service = new RefreshTokenCleanupService(prisma);

    await expect(service.removeExpiredOrRevokedTokens()).resolves.toBe(2);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    const [args] = deleteMany.mock.calls[0];
    expect(args.where.OR[0].expiresAt.lt).toBeInstanceOf(Date);
    expect(args.where.OR[1]).toEqual({ revoked: true });
  });
});
