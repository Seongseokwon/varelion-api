import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

import * as argon2 from 'argon2';

import { UserEntity } from '@users/entities/user.entity';
import { UsersService } from '@users/users.service';

import { RegisterDto } from '@auth/dto/register.dto.';
import { LoginDto } from '@auth/dto/login.dto';
import { GenerateTokenPayload } from '@auth/types/auth.type';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async create(dto: RegisterDto): Promise<UserEntity> {
    const email = dto.email.toLowerCase().trim();

    const existingEmail = await this.usersService.findByEmail(email);

    if (existingEmail) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await this.encryptPassword(dto.password);

    const user = await this.usersService.create({
      email,
      password: passwordHash,
    });

    return user;
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase().trim();

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = {
      id: user.id,
      email: user.email,
      userRole: user.userRole,
    };

    return await this.generateToken(payload);
  }

  // helper method define
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

  async generateToken(
    payload: GenerateTokenPayload,
  ): Promise<Record<string, any>> {
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
    };
  }
}
