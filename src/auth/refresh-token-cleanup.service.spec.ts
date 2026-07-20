import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';
import { PrismaService } from '../prisma/prisma.service';

interface DeleteManyArgs {
  where: {
    OR: [{ expiresAt: { lt: Date } }, { revoked: true }];
  };
}

describe('RefreshTokenCleanupService', () => {
  it('deletes expired or revoked refresh tokens', async () => {
    let receivedArgs: DeleteManyArgs | undefined;
    const deleteMany = jest.fn<
      (args: DeleteManyArgs) => Promise<{ count: number }>
    >((args: DeleteManyArgs) => {
      receivedArgs = args;
      return Promise.resolve({ count: 2 });
    });
    const prisma = { refreshToken: { deleteMany } } as unknown as PrismaService;
    const service = new RefreshTokenCleanupService(prisma);

    await expect(service.removeExpiredOrRevokedTokens()).resolves.toBe(2);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    if (!receivedArgs) {
      throw new Error('deleteMany was not called');
    }
    expect(receivedArgs.where.OR[0].expiresAt.lt).toBeInstanceOf(Date);
    expect(receivedArgs.where.OR[1]).toEqual({ revoked: true });
  });
});
