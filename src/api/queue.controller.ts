import { Controller, Get } from '@nestjs/common';
import { QueueService } from '../workflows/queue.service';

@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get('status')
  getStatus() {
    return this.queueService.getStats();
  }
}
