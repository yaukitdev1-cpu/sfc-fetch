import { Controller, Get } from '@nestjs/common';
import { LowdbService } from '../database/lowdb.service';
import { BackupService } from '../backup/backup.service';
import { ContentService } from '../services/content.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly db: LowdbService,
    private readonly backupService: BackupService,
    private readonly contentService: ContentService,
  ) {}

  @Get()
  async check() {
    const counts = this.db.getCountsByCategory();
    const backupStatus = this.backupService.getStatus();
    const contentStats = this.contentService.getStats();

    let totalDocs = 0;
    for (const count of Object.values(counts)) {
      totalDocs += count;
    }

    return {
      status: 'healthy',
      collections: {
        circulars: { count: counts.circulars || 0, status: 'loaded' },
        guidelines: { count: counts.guidelines || 0, status: 'loaded' },
        consultations: { count: counts.consultations || 0, status: 'loaded' },
        news: { count: counts.news || 0, status: 'loaded' },
      },
      lastBackup: backupStatus.lastBackup,
      activeWorkflows: 0,
      storageUsage: contentStats.size,
      storageUsageFormatted: this.contentService.formatBytes(contentStats.size),
    };
  }
}
