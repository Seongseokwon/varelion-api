import { Injectable } from '@nestjs/common';

import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
  async encryptPassword(password: string): Promise<string> {
    try {
      const passwordHash = await argon2.hash(password);

      return passwordHash;
    } catch (error) {
      throw new Error('Failed to encrypt password');
    }
  }
}
 