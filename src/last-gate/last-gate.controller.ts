import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { LastGateRoomService } from './last-gate-room.service';
import { LAST_GATE_PROTOCOL_VERSION } from './last-gate.types';

@ApiTags('last-gate')
@Controller('last-gate')
export class LastGateController {
  constructor(private readonly rooms: LastGateRoomService) {}

  @Get('status')
  getStatus() {
    return {
      status: 'ok',
      protocolVersion: LAST_GATE_PROTOCOL_VERSION,
      activeRooms: this.rooms.getRoomCount(),
    };
  }
}
