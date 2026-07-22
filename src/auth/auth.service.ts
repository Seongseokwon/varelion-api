import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  async encryptPassword(password: string): Promise<string> {
    try {
      const passwordHash: string = (await argon2.hash(password)) as string;

      return passwordHash;
    } catch (error: unknown) {
      this.logger.error(
        'Failed to encrypt password',
        error instanceof Error ? error.stack : error,
      );

      throw new InternalServerErrorException('Failed to encrypt password');
    }
  }
}
