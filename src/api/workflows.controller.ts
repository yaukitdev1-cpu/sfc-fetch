import { Controller, Get, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LowdbService } from '../database/lowdb.service';

@Controller('workflows')
export class WorkflowsController {
  private categories: string[];

  constructor(
    private readonly db: LowdbService,
    private readonly configService: ConfigService,
  ) {
    this.categories = this.configService.get<string[]>('categories') || [
      'circulars',
      'guidelines',
      'consultations',
      'news',
    ];
  }

  @Get()
  list(@Query('status') status?: string, @Query('category') category?: string) {
    const categories = category && this.categories.includes(category) ? [category] : this.categories;

    const results = [];
    for (const cat of categories) {
      const filters = status ? { status } : {};
      const docs = this.db.getDocuments(cat, filters);
      for (const doc of docs) {
        results.push({
          refNo: doc._id,
          category: cat,
          workflow: doc.workflow,
        });
      }
    }

    return {
      count: results.length,
      workflows: results,
    };
  }

  @Get('stats')
  getStats() {
    const counts = this.db.getCountsByCategory();
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

    const byStatus: Record<string, number> = {};
    for (const cat of this.categories) {
      const docs = this.db.getDocuments(cat);
      for (const doc of docs) {
        const status = doc.workflow?.status || 'UNKNOWN';
        byStatus[status] = (byStatus[status] || 0) + 1;
      }
    }

    return {
      total,
      byCategory: counts,
      byStatus,
    };
  }
}
