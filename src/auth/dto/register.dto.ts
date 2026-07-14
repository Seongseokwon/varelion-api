import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{2,20}$/, {
    message: 'nickname must be 2-20 alphanumeric characters or underscore',
  })
  nickname: string;
}
