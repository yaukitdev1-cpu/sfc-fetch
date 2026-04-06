import { Controller, Get, Post, Param, Body, NotFoundException, Query, BadRequestException } from '@nestjs/common';
import { LowdbService } from '../database/lowdb.service';
import { WorkflowService } from '../workflows/workflow.service';
import { ContentService } from '../services/content.service';
import { QueueService } from '../workflows/queue.service';
import { GuidelineScraper } from '../sfc-clients/guideline.scraper';

@Controller('guidelines')
export class GuidelinesController {
  constructor(
    private readonly db: LowdbService,
    private readonly workflowService: WorkflowService,
    private readonly contentService: ContentService,
    private readonly queueService: QueueService,
    private readonly guidelineScraper: GuidelineScraper,
  ) {}

  @Get(':refNo')
  getDocument(@Param('refNo') refNo: string) {
    const doc = this.db.getDocument(refNo, 'guidelines');
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    return doc;
  }

  @Get(':refNo/content')
  getContent(@Param('refNo') refNo: string) {
    const doc = this.db.getDocument(refNo, 'guidelines');
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    const markdownPath = doc.content?.markdownPath;
    if (!markdownPath) {
      throw new NotFoundException('Content not found');
    }

    const markdownContent = this.contentService.getMarkdown(markdownPath);
    if (!markdownContent) {
      throw new NotFoundException('Content file not found');
    }

    return {
      refNo,
      category: 'guidelines',
      content: {
        markdown: markdownContent,
        size: doc.content?.markdownSize,
        hash: doc.content?.markdownHash,
        lastConverted: doc.content?.lastConverted,
      },
      metadata: {
        title: doc.metadata?.title,
        effectiveDate: doc.metadata?.effectiveDate,
      },
    };
  }

  @Get(':refNo/workflow/status')
  getWorkflowStatus(@Param('refNo') refNo: string) {
    const status = this.workflowService.getWorkflowStatus(refNo, 'guidelines');
    if (!status) {
      throw new NotFoundException('Document not found');
    }
    return status;
  }

  @Get(':refNo/workflow/steps')
  getWorkflowSteps(@Param('refNo') refNo: string) {
    const steps = this.workflowService.getSteps(refNo, 'guidelines');
    if (!steps) {
      throw new NotFoundException('Document not found');
    }
    return steps;
  }

  @Post(':refNo/workflow/retry')
  retry(@Param('refNo') refNo: string, @Body() body: { reason?: string; fromStep?: string }) {
    return this.workflowService.retryDocument(refNo, 'guidelines', body);
  }

  @Post(':refNo/workflow/re-run')
  reRun(
    @Param('refNo') refNo: string,
    @Body() body: { reason?: string; preservePrevious?: boolean },
  ) {
    return this.workflowService.reRunDocument(refNo, 'guidelines', body);
  }

  @Get(':refNo/history')
  getHistory(@Param('refNo') refNo: string) {
    const history = this.workflowService.getHistory(refNo, 'guidelines');
    if (!history) {
      throw new NotFoundException('Document not found');
    }
    return history;
  }

  @Get()
  list(@Query('status') status?: string, @Query('year') year?: string) {
    const filters: any = {};
    if (status) filters.status = status;
    if (year) filters.year = parseInt(year, 10);

    const docs = this.db.getDocuments('guidelines', filters);
    return {
      category: 'guidelines',
      count: docs.length,
      documents: docs,
    };
  }

  @Post(':refNo/download')
  async download(@Param('refNo') refNo: string) {
    const doc = this.db.getDocument(refNo, 'guidelines');
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    const result = await this.queueService.submitJob({
      category: 'guidelines',
      refNo,
      action: 'download',
      data: { sourceUrl: doc.downloadUrl },
    });

    return {
      success: true,
      refNo,
      category: 'guidelines',
      job: result.result,
    };
  }

  @Post('batch-download')
  async batchDownload(
    @Body() body: { status?: string; year?: number; limit?: number; ids?: string[] },
  ) {
    const { status, year, limit = 100, ids } = body;

    if (!status && !year && !ids) {
      throw new BadRequestException('At least one filter (status, year, or ids) must be provided');
    }

    let docs: any[] = [];

    if (ids && ids.length > 0) {
      for (const id of ids) {
        const doc = this.db.getDocument(id, 'guidelines');
        if (doc) docs.push(doc);
      }
    } else {
      const filters: any = {};
      if (status) filters.status = status;
      if (year) filters.year = year;
      if (limit) filters.limit = limit;
      docs = this.db.getDocuments('guidelines', filters);
    }

    const jobs = [];
    for (const doc of docs) {
      const result = await this.queueService.submitJob({
        category: 'guidelines',
        refNo: doc._id,
        action: 'download',
        data: { sourceUrl: doc.downloadUrl },
      });
      jobs.push({
        refNo: doc._id,
        jobId: result.result?.id,
      });
    }

    return {
      success: true,
      category: 'guidelines',
      queued: jobs.length,
      jobs,
    };
  }

  @Get('search')
  async search(@Query('limit') limit?: string) {
    const results = await this.guidelineScraper.getGuidelinesList();

    return {
      category: 'guidelines',
      count: results.length,
      results,
    };
  }

  @Post(':refNo/discover')
  async discover(@Param('refNo') refNo: string) {
    const detail = await this.guidelineScraper.getGuidelineDetail(refNo);

    const doc = {
      metadata: {
        ...detail,
        title: detail.title,
        effectiveDate: detail.effectiveDate,
        year: detail.effectiveDate ? new Date(detail.effectiveDate).getFullYear() : undefined,
      },
      source: {
        pdfUrl: detail.versions?.[0]?.url,
        htmlUrl: detail.content ? `inline:${refNo}` : undefined,
      },
    };

    await this.db.upsertDocument(refNo, 'guidelines', doc);

    const result = await this.queueService.submitJob({
      category: 'guidelines',
      refNo,
      action: 'discover',
    });

    return {
      success: true,
      refNo,
      category: 'guidelines',
      job: result.result,
    };
  }

  @Post('discover-batch')
  async discoverBatch(@Body() body: { years?: number[]; refNos?: string[]; all?: boolean }) {
    const { years, refNos, all } = body;

    if (!all && (!years || years.length === 0) && (!refNos || refNos.length === 0)) {
      throw new BadRequestException('At least one filter (years, refNos, or all=true) must be provided');
    }

    let searchResults: any[] = [];

    if (all) {
      searchResults = await this.guidelineScraper.getGuidelinesList();
    } else if (refNos && refNos.length > 0) {
      for (const refNo of refNos) {
        try {
          const detail = await this.guidelineScraper.getGuidelineDetail(refNo);
          searchResults.push({ ...detail, refNo });
        } catch (error) {
          // Skip documents that can't be found
        }
      }
    } else if (years && years.length > 0) {
      // For guidelines, filter by year from the list
      const allGuidelines = await this.guidelineScraper.getGuidelinesList();
      searchResults = allGuidelines.filter(g => {
        if (!g.effectiveDate) return false;
        const year = new Date(g.effectiveDate).getFullYear();
        return years.includes(year);
      });
    }

    const jobs = [];
    for (const item of searchResults) {
      const refNo = item.refNo || item._id;
      if (!refNo) continue;

      try {
        const doc = {
          metadata: {
            ...item,
            title: item.title,
            effectiveDate: item.effectiveDate,
            year: item.effectiveDate ? new Date(item.effectiveDate).getFullYear() : undefined,
          },
          source: {
            pdfUrl: item.pdfUrl || item.url,
            htmlUrl: item.html,
          },
        };

        await this.db.upsertDocument(refNo, 'guidelines', doc);

        const result = await this.queueService.submitJob({
          category: 'guidelines',
          refNo,
          action: 'discover',
        });

        jobs.push({ refNo, jobId: result.result?.id });
      } catch (error) {
        // Skip documents that fail
      }
    }

    return {
      success: true,
      category: 'guidelines',
      found: searchResults.length,
      queued: jobs.length,
      jobs,
    };
  }
}
