import { Injectable } from '@nestjs/common';
import { RegisterDto } from '@auth/dto/register.dto.';

import { PrismaService } from '@prisma/prisma.service';
import { UserEntity } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: RegisterDto) {
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: dto.password,
      },
    });

    return new UserEntity(user);
  }

  async findByEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (user) {
      return user;
    }

    return null;
  }

  async findProfileById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id,
      },
    });

    if (user) {
      return new UserEntity(user);
    }

    return null;
  }

  findById() {}
}
