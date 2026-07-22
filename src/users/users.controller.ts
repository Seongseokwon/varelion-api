import { Controller, Get, Param } from '@nestjs/common';

import { UserEntity } from './entities/user.entity';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('find-by-email/:email')
  async findByEmail(@Param('email') email: string): Promise<UserEntity | null> {
    const user = await this.usersService.findByEmail(email);

    if (user) {
      return new UserEntity(user);
    }

    return null;
  }

  @Get(':id')
  findProfileById(@Param('id') id: string): Promise<UserEntity | null> {
    return this.usersService.findProfileById(id);
  }
}
