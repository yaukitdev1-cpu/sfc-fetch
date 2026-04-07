import { Controller, Get, Post, Body, BadRequestException } from '@nestjs/common';
import { QueueService } from '../workflows/queue.service';
import { LowdbService } from '../database/lowdb.service';

@Controller('queue')
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
    private readonly db: LowdbService,
  ) {}

  @Get('status')
  getStatus() {
    return this.queueService.getStats();
  }

  @Post('discover')
  async discover(@Body() body: { category: string; refNo: string }) {
    if (!body.category || !body.refNo) {
      throw new BadRequestException('category and refNo are required');
    }

    const doc = this.db.getDocument(body.refNo, body.category);
    if (!doc) {
      throw new BadRequestException(`Document ${body.refNo} not found in category ${body.category}`);
    }

    const result = await this.queueService.submitJob({
      category: body.category,
      refNo: body.refNo,
      action: 'discover',
    });

    return {
      success: true,
      category: body.category,
      refNo: body.refNo,
      job: result.result,
    };
  }

  @Post('download')
  async download(@Body() body: { category: string; refNo: string }) {
    if (!body.category || !body.refNo) {
      throw new BadRequestException('category and refNo are required');
    }

    const doc = this.db.getDocument(body.refNo, body.category);
    if (!doc) {
      throw new BadRequestException(`Document ${body.refNo} not found in category ${body.category}`);
    }

    const result = await this.queueService.submitJob({
      category: body.category,
      refNo: body.refNo,
      action: 'download',
    });

    return {
      success: true,
      category: body.category,
      refNo: body.refNo,
      job: result.result,
    };
  }

  @Post('convert')
  async convert(@Body() body: { category: string; refNo: string }) {
    if (!body.category || !body.refNo) {
      throw new BadRequestException('category and refNo are required');
    }

    const doc = this.db.getDocument(body.refNo, body.category);
    if (!doc) {
      throw new BadRequestException(`Document ${body.refNo} not found in category ${body.category}`);
    }

    const result = await this.queueService.submitJob({
      category: body.category,
      refNo: body.refNo,
      action: 'convert',
    });

    return {
      success: true,
      category: body.category,
      refNo: body.refNo,
      job: result.result,
    };
  }
}
