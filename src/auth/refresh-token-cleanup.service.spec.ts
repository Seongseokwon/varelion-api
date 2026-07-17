import { RefreshTokenCleanupService } from './refresh-token-cleanup.service';

describe('RefreshTokenCleanupService', () => {
  it('deletes expired or revoked refresh tokens', async () => {
    const prisma = {
      refreshToken: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const service = new RefreshTokenCleanupService(prisma as never);

    await expect(service.removeExpiredOrRevokedTokens()).resolves.toBe(2);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{ expiresAt: { lt: expect.any(Date) } }, { revoked: true }],
      },
    });
  });
});
