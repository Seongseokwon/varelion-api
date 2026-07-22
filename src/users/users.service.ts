import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.';

import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { UserEntity } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async create(dto: CreateUserDto) {
    const passwordHash = await this.authService.encryptPassword(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
      },
    });

    return new UserEntity(user);
  }

  findByEmail() {}

  findById() {}

  findProfileById() {}
}
