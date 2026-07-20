import { Module } from '@nestjs/common';
import { LastGateController } from './last-gate.controller';
import { LastGateGateway } from './last-gate.gateway';
import { LastGateRoomService } from './last-gate-room.service';

@Module({
  controllers: [LastGateController],
  providers: [LastGateGateway, LastGateRoomService],
  exports: [LastGateRoomService],
})
export class LastGateModule {}
