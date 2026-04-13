import { Controller, Get, Post, BadRequestException } from '@nestjs/common';
import { BackupService } from '../backup/backup.service';

@Controller()
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Post('dehydrate')
  async dehydrate() {
    try {
      const result = await this.backupService.dehydrate();
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      throw new BadRequestException(`Dehydrate failed: ${(error as Error).message}`);
    }
  }

  @Post('hydrate')
  async hydrate() {
    try {
      const result = await this.backupService.hydrate();
      return {
        success: true,
        ...result,
      };
    } catch (error) {
      throw new BadRequestException(`Hydrate failed: ${(error as Error).message}`);
    }
  }

  @Get('backup/status')
  async getStatus() {
    return this.backupService.getStatus();
  }
}
