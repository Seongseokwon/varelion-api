import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { PutSaveDto } from './dto/put-save.dto';
import { SavesService } from './saves.service';

@ApiTags('saves')
@ApiBearerAuth()
@Controller('saves')
export class SavesController {
  constructor(private readonly savesService: SavesService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMine(@CurrentUser() user: CurrentUserPayload) {
    return this.savesService.getMine(user.userId);
  }

  // version 불일치(409)에도 현재 서버 세이브를 본문에 담아야 하는데(FR-4), 공용 예외
  // 필터가 커스텀 필드를 { statusCode, message, error }로 평탄화해 버리므로 예외 대신
  // passthrough @Res로 상태 코드만 바꾼다 — 필터/인터셉터는 그대로 동작한다.
  @Put('me')
  @UseGuards(JwtAuthGuard)
  async putMine(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: PutSaveDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.savesService.putMine(user.userId, dto);
    if (result.conflict) res.status(HttpStatus.CONFLICT);
    return result.body;
  }
}
