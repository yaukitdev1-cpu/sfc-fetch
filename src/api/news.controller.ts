import { Controller, Get, Post, Param, Body, NotFoundException, Query, BadRequestException } from '@nestjs/common';
import { LowdbService } from '../database/lowdb.service';
import { WorkflowService } from '../workflows/workflow.service';
import { ContentService } from '../services/content.service';
import { QueueService } from '../workflows/queue.service';
import { NewsClient } from '../sfc-clients/news.client';

@Controller('news')
export class NewsController {
  constructor(
    private readonly db: LowdbService,
    private readonly workflowService: WorkflowService,
    private readonly contentService: ContentService,
    private readonly queueService: QueueService,
    private readonly newsClient: NewsClient,
  ) {}

  @Get(':refNo')
  getDocument(@Param('refNo') refNo: string) {
    const doc = this.db.getDocument(refNo, 'news');
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    return doc;
  }

  @Get(':refNo/content')
  getContent(@Param('refNo') refNo: string) {
    const doc = this.db.getDocument(refNo, 'news');
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
      category: 'news',
      content: {
        markdown: markdownContent,
        size: doc.content?.markdownSize,
        hash: doc.content?.markdownHash,
        lastConverted: doc.content?.lastConverted,
      },
      metadata: {
        title: doc.metadata?.title,
        publishDate: doc.metadata?.publishDate,
      },
    };
  }

  @Get(':refNo/workflow/status')
  getWorkflowStatus(@Param('refNo') refNo: string) {
    const status = this.workflowService.getWorkflowStatus(refNo, 'news');
    if (!status) {
      throw new NotFoundException('Document not found');
    }
    return status;
  }

  @Get(':refNo/workflow/steps')
  getWorkflowSteps(@Param('refNo') refNo: string) {
    const steps = this.workflowService.getSteps(refNo, 'news');
    if (!steps) {
      throw new NotFoundException('Document not found');
    }
    return steps;
  }

  @Post(':refNo/workflow/retry')
  retry(@Param('refNo') refNo: string, @Body() body: { reason?: string; fromStep?: string }) {
    return this.workflowService.retryDocument(refNo, 'news', body);
  }

  @Post(':refNo/workflow/re-run')
  reRun(
    @Param('refNo') refNo: string,
    @Body() body: { reason?: string; preservePrevious?: boolean },
  ) {
    return this.workflowService.reRunDocument(refNo, 'news', body);
  }

  @Get(':refNo/history')
  getHistory(@Param('refNo') refNo: string) {
    const history = this.workflowService.getHistory(refNo, 'news');
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

    const docs = this.db.getDocuments('news', filters);
    return {
      category: 'news',
      count: docs.length,
      documents: docs,
    };
  }

  @Post(':refNo/download')
  async download(@Param('refNo') refNo: string) {
    const doc = this.db.getDocument(refNo, 'news');
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    const result = await this.queueService.submitJob({
      category: 'news',
      refNo,
      action: 'download',
      data: { sourceUrl: doc.downloadUrl },
    });

    return {
      success: true,
      refNo,
      category: 'news',
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
        const doc = this.db.getDocument(id, 'news');
        if (doc) docs.push(doc);
      }
    } else {
      const filters: any = {};
      if (status) filters.status = status;
      if (year) filters.year = year;
      if (limit) filters.limit = limit;
      docs = this.db.getDocuments('news', filters);
    }

    const jobs = [];
    for (const doc of docs) {
      const result = await this.queueService.submitJob({
        category: 'news',
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
      category: 'news',
      queued: jobs.length,
      jobs,
    };
  }

  @Get('search')
  async search(@Query('year') year?: string, @Query('limit') limit?: string) {
    const results = await this.newsClient.searchNews({
      year: year ? parseInt(year, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    return {
      category: 'news',
      count: results.length,
      results,
    };
  }

  @Post(':refNo/discover')
  async discover(@Param('refNo') refNo: string) {
    const metadata = await this.newsClient.getNews(refNo);

    const doc = {
      metadata: {
        ...metadata,
        title: metadata.title || metadata.headline,
        issueDate: metadata.issueDate || metadata.date || metadata.publishedAt,
        year: metadata.year || new Date(metadata.issueDate || metadata.date || metadata.publishedAt).getFullYear(),
      },
      source: {
        htmlUrl: metadata.htmlUrl || metadata.url,
      },
    };

    await this.db.upsertDocument(refNo, 'news', doc);

    const result = await this.queueService.submitJob({
      category: 'news',
      refNo,
      action: 'discover',
    });

    return {
      success: true,
      refNo,
      category: 'news',
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
      searchResults = await this.newsClient.searchNews({});
    } else if (refNos && refNos.length > 0) {
      for (const refNo of refNos) {
        try {
          const metadata = await this.newsClient.getNews(refNo);
          searchResults.push(metadata);
        } catch (error) {
          // Skip documents that can't be found
        }
      }
    } else if (years && years.length > 0) {
      for (const year of years) {
        const results = await this.newsClient.searchNews({ year });
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
            title: item.title || item.headline,
            issueDate: item.issueDate || item.date || item.publishedAt,
            year: item.year || new Date(item.issueDate || item.date || item.publishedAt).getFullYear(),
          },
          source: {
            htmlUrl: item.htmlUrl || item.url,
          },
        };

        await this.db.upsertDocument(refNo, 'news', doc);

        const result = await this.queueService.submitJob({
          category: 'news',
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
      category: 'news',
      found: searchResults.length,
      queued: jobs.length,
      jobs,
    };
  }
}
