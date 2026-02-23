import { Controller, Get, Post, Param, Body, NotFoundException, Query } from '@nestjs/common';
import { LowdbService } from '../database/lowdb.service';
import { WorkflowService } from '../workflows/workflow.service';
import { ContentService } from '../services/content.service';

@Controller('consultations')
export class ConsultationsController {
  constructor(
    private readonly db: LowdbService,
    private readonly workflowService: WorkflowService,
    private readonly contentService: ContentService,
  ) {}

  @Get(':refNo')
  getDocument(@Param('refNo') refNo: string) {
    const doc = this.db.getDocument(refNo, 'consultations');
    if (!doc) {
      throw new NotFoundException('Document not found');
    }
    return doc;
  }

  @Get(':refNo/content')
  getContent(
    @Param('refNo') refNo: string,
    @Query('type') type?: 'conclusion' | 'consultation',
  ) {
    const doc = this.db.getDocument(refNo, 'consultations');
    if (!doc) {
      throw new NotFoundException('Document not found');
    }

    let markdownPath: string | undefined;
    if (type === 'conclusion') {
      markdownPath = doc.content?.conclusionMarkdownPath;
    } else {
      markdownPath = doc.content?.consultationMarkdownPath;
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
      category: 'consultations',
      contentType: type || 'consultation',
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
    const status = this.workflowService.getWorkflowStatus(refNo, 'consultations');
    if (!status) {
      throw new NotFoundException('Document not found');
    }
    return status;
  }

  @Get(':refNo/workflow/steps')
  getWorkflowSteps(@Param('refNo') refNo: string) {
    const steps = this.workflowService.getSteps(refNo, 'consultations');
    if (!steps) {
      throw new NotFoundException('Document not found');
    }
    return steps;
  }

  @Post(':refNo/workflow/retry')
  retry(@Param('refNo') refNo: string, @Body() body: { reason?: string; fromStep?: string }) {
    return this.workflowService.retryDocument(refNo, 'consultations', body);
  }

  @Post(':refNo/workflow/re-run')
  reRun(
    @Param('refNo') refNo: string,
    @Body() body: { reason?: string; preservePrevious?: boolean },
  ) {
    return this.workflowService.reRunDocument(refNo, 'consultations', body);
  }

  @Get(':refNo/history')
  getHistory(@Param('refNo') refNo: string) {
    const history = this.workflowService.getHistory(refNo, 'consultations');
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

    const docs = this.db.getDocuments('consultations', filters);
    return {
      category: 'consultations',
      count: docs.length,
      documents: docs,
    };
  }
}
