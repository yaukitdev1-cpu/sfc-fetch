import { Controller, Get, Post, Param, Body, NotFoundException, Query, BadRequestException } from '@nestjs/common';
import { LowdbService } from '../database/lowdb.service';
import { WorkflowService } from '../workflows/workflow.service';
import { ContentService } from '../services/content.service';
import { QueueService } from '../workflows/queue.service';
import { CircularClient } from '../sfc-clients/circular.client';

@Controller('circulars')
export class CircularsController {
  constructor(
    private readonly db: LowdbService,
    private readonly workflowService: WorkflowService,
    private readonly contentService: ContentService,
    private readonly queueService: QueueService,
    private readonly circularClient: CircularClient,
  ) {}

  @Get(':refNo')
  getDocument(@Param('refNo') refNo: string) {
    const doc = this.db.getDocument(refNo, 'circulars');
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    return doc;
  }

  @Get(':refNo/content')
  getContent(@Param('refNo') refNo: string, @Query('appendix') appendix?: string) {
    const doc = this.db.getDocument(refNo, 'circulars');
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    let markdownPath: string | undefined;

    if (appendix !== undefined) {
      markdownPath = doc.content?.appendices?.[parseInt(appendix)]?.markdownPath;
    } else {
      markdownPath = doc.content?.markdownPath;
    }

    if (!markdownPath) {
      throw new NotFoundException('Content not found');
    }

    const markdownContent = this.contentService.getMarkdown(markdownPath);
    if (!markdownContent) {
      throw new NotFoundException('Content file not found');
    }

    return {
      refNo,
      category: 'circulars',
      content: {
        markdown: markdownContent,
        size: doc.content?.markdownSize,
        hash: doc.content?.markdownHash,
        lastConverted: doc.content?.lastConverted,
      },
      metadata: {
        title: doc.metadata?.title,
        issueDate: doc.metadata?.issueDate,
      },
    };
  }

  @Get(':refNo/workflow/status')
  getWorkflowStatus(@Param('refNo') refNo: string) {
    const status = this.workflowService.getWorkflowStatus(refNo, 'circulars');
    if (!status) {
      throw new NotFoundException('Document not found');
    }
    return status;
  }

  @Get(':refNo/workflow/steps')
  getWorkflowSteps(@Param('refNo') refNo: string) {
    const steps = this.workflowService.getSteps(refNo, 'circulars');
    if (!steps) {
      throw new NotFoundException('Document not found');
    }
    return steps;
  }

  @Post(':refNo/workflow/retry')
  retry(@Param('refNo') refNo: string, @Body() body: { reason?: string; fromStep?: string }) {
    return this.workflowService.retryDocument(refNo, 'circulars', body);
  }

  @Post(':refNo/workflow/re-run')
  reRun(
    @Param('refNo') refNo: string,
    @Body() body: { reason?: string; preservePrevious?: boolean },
  ) {
    return this.workflowService.reRunDocument(refNo, 'circulars', body);
  }

  @Get(':refNo/history')
  getHistory(@Param('refNo') refNo: string) {
    const history = this.workflowService.getHistory(refNo, 'circulars');
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

    const docs = this.db.getDocuments('circulars', filters);
    return {
      category: 'circulars',
      count: docs.length,
      documents: docs,
    };
  }

  @Post(':refNo/download')
  async download(@Param('refNo') refNo: string) {
    const doc = this.db.getDocument(refNo, 'circulars');
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    const result = await this.queueService.submitJob({
      category: 'circulars',
      refNo,
      action: 'download',
      data: { sourceUrl: doc.downloadUrl },
    });

    return {
      success: true,
      refNo,
      category: 'circulars',
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
        const doc = this.db.getDocument(id, 'circulars');
        if (doc) docs.push(doc);
      }
    } else {
      const filters: any = {};
      if (status) filters.status = status;
      if (year) filters.year = year;
      if (limit) filters.limit = limit;
      docs = this.db.getDocuments('circulars', filters);
    }

    const jobs = [];
    for (const doc of docs) {
      const result = await this.queueService.submitJob({
        category: 'circulars',
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
      category: 'circulars',
      queued: jobs.length,
      jobs,
    };
  }

  @Get('search')
  async search(@Query('year') year?: string, @Query('refNo') refNo?: string, @Query('limit') limit?: string) {
    const results = await this.circularClient.searchCirculars({
      year: year ? parseInt(year, 10) : undefined,
      refNo,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    return {
      category: 'circulars',
      count: results.length,
      results,
    };
  }

  @Post(':refNo/discover')
  async discover(@Param('refNo') refNo: string) {
    const metadata = await this.circularClient.getCircular(refNo);

    const doc = {
      metadata: {
        ...metadata,
        title: metadata.title || metadata.subject,
        issueDate: metadata.issueDate || metadata.date,
        year: metadata.year || new Date(metadata.issueDate || metadata.date).getFullYear(),
      },
      source: {
        pdfUrl: metadata.pdfUrl || metadata.pdfLink,
        htmlUrl: metadata.htmlUrl || metadata.url,
      },
    };

    await this.db.upsertDocument(refNo, 'circulars', doc);

    const result = await this.queueService.submitJob({
      category: 'circulars',
      refNo,
      action: 'discover',
    });

    return {
      success: true,
      refNo,
      category: 'circulars',
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
      // For "all", search without filters to get all circulars
      searchResults = await this.circularClient.searchCirculars({});
    } else if (refNos && refNos.length > 0) {
      // Search by refNos
      for (const refNo of refNos) {
        try {
          const metadata = await this.circularClient.getCircular(refNo);
          searchResults.push(metadata);
        } catch (error) {
          // Skip documents that can't be found
        }
      }
    } else if (years && years.length > 0) {
      // Search by years
      for (const year of years) {
        const results = await this.circularClient.searchCirculars({ year });
        searchResults.push(...results);
      }
    }

    const jobs = [];
    for (const item of searchResults) {
      const refNo = item.refNo || item._id;
      if (!refNo) continue;

      try {
        const doc = {
          metadata: {
            ...item,
            title: item.title || item.subject,
            issueDate: item.issueDate || item.date,
            year: item.year || new Date(item.issueDate || item.date).getFullYear(),
          },
          source: {
            pdfUrl: item.pdfUrl || item.pdfLink,
            htmlUrl: item.htmlUrl || item.url,
          },
        };

        await this.db.upsertDocument(refNo, 'circulars', doc);

        const result = await this.queueService.submitJob({
          category: 'circulars',
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
      category: 'circulars',
      found: searchResults.length,
      queued: jobs.length,
      jobs,
    };
  }
}
