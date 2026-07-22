import { Body, Controller, Post } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.';
import { UserEntity } from './entities/user.entity';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('create')
  async createUser(@Body() dto: CreateUserDto): Promise<UserEntity> {
    return await this.usersService.create(dto);
  }
}
