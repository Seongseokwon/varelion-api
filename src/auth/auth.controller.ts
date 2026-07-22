import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from '@auth/auth.service';
import { RegisterDto } from '@auth/dto/register.dto.';
import { LoginDto } from '@auth/dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post('register')
  async create(@Body() dto: RegisterDto) {
    return await this.authService.create(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return await this.authService.login(dto);
  }
}
