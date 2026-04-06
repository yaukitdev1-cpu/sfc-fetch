import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Queue from 'better-queue';
import * as path from 'path';
import * as fs from 'fs-extra';
import { LowdbService } from '../database/lowdb.service';
import { ContentService } from '../services/content.service';
import { DoclingService } from '../converters/docling.service';
import { CircularClient } from '../sfc-clients/circular.client';
import { ConsultationClient } from '../sfc-clients/consultation.client';
import { NewsClient } from '../sfc-clients/news.client';
import { GuidelineScraper } from '../sfc-clients/guideline.scraper';

interface JobData {
  category: string;
  refNo: string;
  action: string;
  data?: any;
}

interface JobResult {
  success: boolean;
  result?: any;
  error?: any;
}

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private queue: any;
  private queuePath: string;
  private logger: Logger;
  private rawFilesDir: string;

  constructor(
    private configService: ConfigService,
    private lowdbService: LowdbService,
    private contentService: ContentService,
    private doclingService: DoclingService,
    private circularClient: CircularClient,
    private consultationClient: ConsultationClient,
    private newsClient: NewsClient,
    private guidelineScraper: GuidelineScraper,
  ) {
    this.logger = new Logger(QueueService.name);
    this.queuePath = this.configService.get<string>('queuePath') || './data/db/sfc-db.json';
    this.rawFilesDir = this.configService.get<string>('rawFilesDir') || './data/raw';
  }

  onModuleInit() {
    this.initializeQueue();
  }

  onModuleDestroy() {
    if (this.queue) {
      this.queue.destroy();
    }
  }

  private initializeQueue() {
    const maxRetries = this.configService.get<number>('queueMaxRetries') || 5;
  let jobLatencyTracker = new Map<string, number>();

    // Load pending jobs from LowDB on startup
    const pendingJobs = this.lowdbService.getPendingQueueJobs();
    if (pendingJobs.length > 0) {
      this.logger.log(`[Queue] Loading ${pendingJobs.length} pending jobs from LowDB`);
      pendingJobs.forEach(job => this.queue.push(job));
    }

    const processor = (job: any, cb: (error: any, result?: JobResult) => void) => {
    jobLatencyTracker.set(job.id, Date.now());
      try {
        console.log(`[Queue] Processing job: ${job.id} - ${job.category}/${job.refNo}`);
        const result = this.processJob(job);
        cb(null, { success: true, result });
      } catch (error) {
        console.error(`[Queue] Job failed: ${job.id}`, error);
        cb(error, { success: false, error: (error as Error).message });
      }
    };

    this.queue = new Queue(processor, {
      concurrent: 4,
      maxRetries,
      retryDelay: 1000,
      retryBackoff: true,
    });

    this.queue.on('task_finish', (taskId: string, result: JobResult) => {
      console.log(`[Queue] Task completed: ${taskId}`, result);
    });

    this.queue.on('task_failed', (taskId: string, error: any) => {
      console.error(`[Queue] Task failed: ${taskId}`, error);
    });

    console.log('[Queue] Initialized');
  }

  private async cleanupRawFile(filePath: string): Promise<void> {
    try {
      if (filePath && await fs.pathExists(filePath)) {
        await fs.remove(filePath);
        this.logger.debug(`Cleaned up raw file: ${filePath}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to cleanup raw file ${filePath}: ${error}`);
    }
  }

  private getRawFilePath(category: string, refNo: string, extension: string): string {
    return path.join(this.rawFilesDir, category, `${refNo}.${extension}`);
  }

  async discoverResource(category: string, refNo: string): Promise<any> {
    this.logger.debug(`Discovering ${category}/${refNo}`);
    const job = await this.lowdbService.addQueueJob({
      action: 'discover',
      status: 'in_progress',
      category,
      refNo
    });

    try {
      // Fetch metadata from appropriate SFC client
      let metadata: any;
      switch (category) {
        case 'circulars':
          metadata = await this.circularClient.getCircular(refNo);
          break;
        case 'consultations':
          metadata = await this.consultationClient.getConsultation(refNo);
          break;
        case 'news':
          metadata = await this.newsClient.getNews(refNo);
          break;
        case 'guidelines':
          metadata = await this.guidelineScraper.getGuidelineDetail(refNo);
          break;
        default:
          throw new Error(`Unknown category: ${category}`);
      }

      // Update document with metadata
      const doc = this.lowdbService.getDocument(refNo, category);
      if (doc) {
        await this.lowdbService.upsertDocument(refNo, category, {
          ...doc,
          metadata: {
            ...doc.metadata,
            ...metadata,
            title: metadata.title || metadata.subject || metadata.headline,
            year: metadata.year || new Date(metadata.issueDate || metadata.effectiveDate || metadata.date || Date.now()).getFullYear(),
          },
          source: {
            ...doc.source,
            pdfUrl: metadata.pdfUrl || metadata.pdfLink,
            htmlUrl: metadata.htmlUrl || metadata.url,
          },
          workflow: {
            ...doc.workflow,
            status: 'DISCOVERED',
          },
        });
      }

      await this.lowdbService.updateQueueJobStatus(job._id, 'completed');
      return job;
    } catch (error) {
      await this.lowdbService.updateQueueJobStatus(job._id, 'failed');
      throw error;
    }
  }

  async downloadResource(category: string, refNo: string, sourceUrl?: string): Promise<any> {
    this.logger.debug(`Downloading ${category}/${refNo} from ${sourceUrl}`);
    const job = await this.lowdbService.addQueueJob({
      action: 'download',
      status: 'in_progress',
      category,
      refNo,
      sourceUrl
    });

    try {
      const doc = this.lowdbService.getDocument(refNo, category);
      if (!doc) {
        throw new Error(`Document ${refNo} not found in category ${category}`);
      }

      const url = sourceUrl || doc.source?.pdfUrl || doc.source?.htmlUrl;
      if (!url) {
        throw new Error(`No source URL found for ${category}/${refNo}`);
      }

      let rawPath: string;
      let content: string | Buffer;

      if (category === 'guidelines') {
        // For guidelines, download via scraper
        if (url.startsWith('http')) {
          content = await this.guidelineScraper.downloadGuidelinePdf(url);
          rawPath = this.getRawFilePath(category, refNo, 'pdf');
        } else {
          // Inline content from discover
          content = doc.source?.content || '';
          rawPath = this.getRawFilePath(category, refNo, 'html');
        }
      } else if (category === 'circulars') {
        content = await this.circularClient.getCircularPdf(refNo);
        rawPath = this.getRawFilePath(category, refNo, 'pdf');
      } else if (category === 'consultations') {
        content = await this.consultationClient.getConsultationPdf(refNo);
        rawPath = this.getRawFilePath(category, refNo, 'pdf');
      } else if (category === 'news') {
        content = await this.newsClient.getNewsContent(refNo);
        rawPath = this.getRawFilePath(category, refNo, 'html');
      } else {
        throw new Error(`Unknown category: ${category}`);
      }

      // Save raw file
      await fs.ensureDir(path.dirname(rawPath));
      await fs.writeFile(rawPath, content);

      // Update document with raw file path
      await this.lowdbService.upsertDocument(refNo, category, {
        ...doc,
        source: {
          ...doc.source,
          rawFilePath: rawPath,
        },
        workflow: {
          ...doc.workflow,
          status: 'DOWNLOADING',
        },
      });

      await this.lowdbService.updateQueueJobStatus(job._id, 'completed');
      return job;
    } catch (error) {
      await this.lowdbService.updateQueueJobStatus(job._id, 'failed');
      throw error;
    }
  }

  async convertResource(category: string, refNo: string): Promise<any> {
    this.logger.debug(`Converting ${category}/${refNo}`);
    const job = await this.lowdbService.addQueueJob({
      action: 'convert',
      status: 'in_progress',
      category,
      refNo
    });

    try {
      const doc = this.lowdbService.getDocument(refNo, category);
      if (!doc) {
        throw new Error(`Document ${refNo} not found in category ${category}`);
      }

      const rawFilePath = doc.source?.rawFilePath;
      if (!rawFilePath) {
        throw new Error(`No raw file path found for ${category}/${refNo}`);
      }

      let markdownPath: string;
      let markdownContent: string;

      if (rawFilePath.endsWith('.pdf')) {
        // Convert PDF to markdown using Docling
        markdownContent = await this.doclingService.convertPdfToMarkdown(rawFilePath);
      } else {
        // Read HTML file and convert using Turndown
        const htmlContent = (await fs.readFile(rawFilePath, 'utf8')).toString();
        // Use basic HTML to markdown conversion
        markdownContent = this.basicHtmlToMarkdown(htmlContent);
      }

      // Save markdown
      const year = doc.metadata?.year || new Date().getFullYear();
      const result = await this.contentService.saveMarkdown(category, refNo, markdownContent, { year });

      // Update document with markdown info
      await this.lowdbService.upsertDocument(refNo, category, {
        ...doc,
        content: {
          ...doc.content,
          markdownPath: result.markdownPath,
          markdownSize: result.markdownSize,
          markdownHash: result.markdownHash,
          lastConverted: new Date().toISOString(),
        },
        workflow: {
          ...doc.workflow,
          status: 'PROCESSING',
        },
      });

      // Cleanup raw file after successful conversion
      await this.cleanupRawFile(rawFilePath);

      // Also cleanup inline HTML content for guidelines
      if (category === 'guidelines' && doc.source?.content) {
        // Clear inline content after conversion
        await this.lowdbService.upsertDocument(refNo, category, {
          ...doc,
          source: {
            ...doc.source,
            content: undefined,
          },
        });
      }

      await this.lowdbService.updateQueueJobStatus(job._id, 'completed');
      return job;
    } catch (error) {
      await this.lowdbService.updateQueueJobStatus(job._id, 'failed');
      throw error;
    }
  }

  private basicHtmlToMarkdown(html: string): string {
    // Basic HTML to markdown conversion
    return html
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<a[^>]*href=["'](.*?)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }

  private processJob(job: any): any {
    // This would be implemented based on the job type
    // For now, it's a placeholder that will be extended with actual processors
    this.logger.log(`[Queue] Processing ${job.action} for ${job.category}/${job.refNo}`);

    switch (job.action) {
      case 'discover':
        return this.discoverResource(job.category, job.refNo);
      case 'download':
        return this.downloadResource(job.category, job.refNo, job.sourceUrl);
      case 'convert':
        return this.convertResource(job.category, job.refNo);
      default:
        this.logger.warn(`Unknown job action: ${job.action}`);
        return { action: job.action, status: 'unknown_action' };
    }
  }

  submitJob(job: JobData): Promise<JobResult> {
    return new Promise(async (resolve, reject) => {
      // Persist job to LowDB with pending status before adding to queue
      const persistedJob = await this.lowdbService.addQueueJob({
        id: `${job.category}-${job.refNo}-${Date.now()}`,
        status: 'pending',
        ...job
      });
      this.queue.push(persistedJob, (error: any, result?: JobResult) => {
        if (error) {
          reject(error);
        } else {
          resolve(result || { success: true });
        }
      });
    });
  }

  getStats() {
    return {
      length: this.queue.length,
      running: this.queue.running,
    };
  }

  pause() {
    this.queue.pause();
  }

  resume() {
    this.queue.resume();
  }

  destroy() {
    this.queue.destroy();
  }
}
