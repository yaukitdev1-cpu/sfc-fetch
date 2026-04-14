import { Controller, Get, Inject } from '@nestjs/common';
import { LowdbService } from '../database/lowdb.service';
import { BackupService } from '../backup/backup.service';
import { ContentService } from '../services/content.service';
import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  private readonly nodeEnv: string;

  constructor(
    private readonly db: LowdbService,
    private readonly backupService: BackupService,
    private readonly contentService: ContentService,
    @Inject(ConfigService) private readonly configService: ConfigService
  ) {
    this.nodeEnv = this.configService.get<string>('nodeEnv') || 'development';
  }

  @Get()
  async check() {
    const counts = this.db.getCountsByCategory();
    const backupStatus = await this.backupService.getStatus();

    let totalDocs = 0;
    for (const count of Object.values(counts)) {
      totalDocs += count;
    }

    // OWASP A02: Sensitive Data Exposure - Restrict sensitive details in production
    const response: any = {
      status: 'healthy',
      totalDocuments: totalDocs,
      lastBackup: this.nodeEnv === 'development' ? backupStatus.lastBackup : 'redacted'
    };

    // Only show detailed collection info in development
    if (this.nodeEnv === 'development') {
      response.collections = {
        circulars: { count: counts.circulars || 0, status: 'loaded' },
        guidelines: { count: counts.guidelines || 0, status: 'loaded' },
        consultations: { count: counts.consultations || 0, status: 'loaded' },
        news: { count: counts.news || 0, status: 'loaded' },
      };
      response.activeWorkflows = 0;
    }

    return response;
  }
}
