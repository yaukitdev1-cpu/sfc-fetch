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
import { WorkflowService } from './workflow.service';

interface JobData {
  category: string;
  refNo: string;
  action: string;
  data?: any;
  sourceUrl?: string;
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
    private workflowService: WorkflowService,
  ) {
    this.logger = new Logger(QueueService.name);
    this.queuePath = this.configService.get<string>('queuePath') || './data/db/sfc-db.json';
    this.rawFilesDir = this.configService.get<string>('rawFilesDir') || './data/raw';
  }

  async onModuleInit() {
    await this.initializeQueue();
  }

  onModuleDestroy() {
    if (this.queue) {
      this.queue.destroy();
    }
  }

  private async initializeQueue(): Promise<void> {
    const maxRetries = this.configService.get<number>('queueMaxRetries') || 5;
    let jobLatencyTracker = new Map<string, number>();

    const processor = async (job: any, cb: (error: any, result?: JobResult) => void) => {
      jobLatencyTracker.set(job.id, Date.now());
      try {
        this.logger.log(`[Queue] Processing job: ${job.id} - ${job.category}/${job.refNo}`);
        const result = await this.processJob(job);
        jobLatencyTracker.delete(job.id);
        cb(null, { success: true, result });
      } catch (error) {
        jobLatencyTracker.delete(job.id);
        this.logger.error(`[Queue] Job failed: ${job.id}`, error);
        cb(error, { success: false, error: (error as Error).message });
      }
    };

    // Initialize queue FIRST
    this.queue = new Queue(processor, {
      concurrent: 4,
      maxRetries,
      retryDelay: 1000,
      retryBackoff: true,
    });

    this.queue.on('task_finish', (taskId: string, result: JobResult) => {
      this.logger.log(`[Queue] Task completed: ${taskId}`, JSON.stringify(result));
    });

    this.queue.on('task_start', (taskId: string) => {
      this.logger.debug(`[Queue] Task started: ${taskId}`);
    });

    this.queue.on('task_failed', (taskId: string, error: any) => {
      this.logger.error(`[Queue] Task failed: ${taskId}`, error);
    });

    // THEN load pending jobs from LowDB
    const pendingJobs = this.lowdbService.getPendingQueueJobs();
    if (pendingJobs.length > 0) {
      this.logger.log(`[Queue] Loading ${pendingJobs.length} pending jobs from LowDB`);
      pendingJobs.forEach(job => {
        this.logger.debug(`[Queue] push(): ${job.action}/${job.refNo} id=${job.id}`);
        this.queue.push(job);
      });
    }

    // IMPORTANT: Start the queue consumer
    // Without this, jobs are pushed but never processed!
    this.queue.process(processor, this.configService.get<number>('queue.concurrent') || 4);
    this.logger.log('[Queue] Queue consumer started');

    // Recovery: Re-submit jobs for documents stuck in intermediate workflow states
    await this.recoverStuckDocuments();

    this.logger.log('[Queue] Initialized');
  }

  /**
   * Recovery mechanism to handle documents stuck in intermediate workflow states.
   * This handles cases where the application crashed after a job completed but before
   * the next job was auto-submitted, or where jobs were otherwise lost.
   */
  private async recoverStuckDocuments(): Promise<void> {
    try {
      const categories = ['circulars', 'consultations', 'news', 'guidelines'];
      let recoveredCount = 0;

      for (const category of categories) {
        const documents = this.lowdbService.getDocuments(category);

        for (const doc of documents) {
          const status = doc.workflow?.status;
          const refNo = doc._id;

          if (status === 'DISCOVERED') {
            // Document has been discovered but download hasn't started
            // Check for existing pending/in_progress jobs to avoid duplicates
            const existingJobs = this.lowdbService.getPendingQueueJobs()
              .filter(j => j.category === category && j.refNo === refNo);
            if (existingJobs.length > 0) {
              this.logger.debug(`[Recovery] Job already exists for ${category}/${refNo}, skipping`);
              continue;
            }
            this.logger.log(`[Recovery] Re-submitting download job for stuck ${category}/${refNo}`);
            await this.submitJob({
              action: 'download',
              category,
              refNo,
              sourceUrl: doc.source?.pdfUrl || doc.source?.htmlUrl,
            });
            recoveredCount++;
          } else if (status === 'DOWNLOADING') {
            // Document download was completed but convert wasn't submitted
            // Check for existing pending/in_progress jobs to avoid duplicates
            const existingJobs = this.lowdbService.getPendingQueueJobs()
              .filter(j => j.category === category && j.refNo === refNo);
            if (existingJobs.length > 0) {
              this.logger.debug(`[Recovery] Job already exists for ${category}/${refNo}, skipping`);
              continue;
            }
            this.logger.log(`[Recovery] Re-submitting convert job for stuck ${category}/${refNo}`);
            await this.submitJob({
              action: 'convert',
              category,
              refNo,
            });
            recoveredCount++;
          } else if (status === 'PROCESSING') {
            // If markdownPath exists, conversion finished but workflow wasn't completed
            // If markdownPath doesn't exist, conversion didn't finish - resubmit convert
            if (doc.content?.markdownPath) {
              this.logger.log(`[Recovery] Completing stuck workflow for ${category}/${refNo}`);
              try {
                await this.workflowService.completeWorkflow(refNo, category);
              } catch (error) {
                this.logger.warn(`[Recovery] Failed to complete stuck workflow for ${category}/${refNo}: ${error}`);
              }
            } else {
              // Check for existing pending/in_progress jobs to avoid duplicates
              const existingJobs = this.lowdbService.getPendingQueueJobs()
                .filter(j => j.category === category && j.refNo === refNo);
              if (existingJobs.length > 0) {
                this.logger.debug(`[Recovery] Job already exists for ${category}/${refNo}, skipping`);
              } else {
                this.logger.log(`[Recovery] Re-submitting convert job for stuck ${category}/${refNo}`);
                await this.submitJob({
                  action: 'convert',
                  category,
                  refNo,
                });
              }
            }
            recoveredCount++;
          }
        }
      }

      if (recoveredCount > 0) {
        this.logger.log(`[Recovery] Recovered ${recoveredCount} stuck documents`);
      }
    } catch (error) {
      this.logger.error('[Recovery] Error during stuck document recovery:', error);
    }
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
      // Track step in workflow
      await this.workflowService.startStep(refNo, category, 'discover');

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

      // Update document with metadata (upsert handles both new and existing documents)
      const doc = this.lowdbService.getDocument(refNo, category);
      await this.lowdbService.upsertDocument(refNo, category, {
        ...(doc || {}),
        metadata: {
          ...(doc?.metadata || {}),
          ...metadata,
          title: metadata.title || metadata.subject || metadata.headline,
          year: metadata.year || new Date(metadata.issueDate || metadata.effectiveDate || metadata.date || Date.now()).getFullYear(),
        },
        source: {
          ...(doc?.source || {}),
          pdfUrl: metadata.pdfUrl || metadata.pdfLink,
          htmlUrl: metadata.htmlUrl || metadata.url,
        },
        workflow: {
          ...(doc?.workflow || {}),
          status: 'DISCOVERED',
        },
      });

      await this.lowdbService.updateQueueJobStatus(job._id, 'completed');

      // Complete the discover step
      await this.workflowService.completeStep(refNo, category, 'discover', {
        pdfUrl: metadata.pdfUrl || metadata.pdfLink,
        htmlUrl: metadata.htmlUrl || metadata.url,
      });

      // Auto-submit download job after discover succeeds
      // Use try/catch to prevent chain failures from affecting discover completion
      this.logger.log(`[Queue] Auto-submitting download job for ${category}/${refNo} after discover`);
      try {
        await this.submitJob({
          action: 'download',
          category,
          refNo,
          sourceUrl: metadata.pdfUrl || metadata.pdfLink || metadata.url,
        });
      } catch (err) {
        this.logger.error(`[Queue] Failed to chain download job for ${category}/${refNo}:`, err);
        // Don't rollback - current step still completes
      }

      return job;
    } catch (error) {
      await this.lowdbService.updateQueueJobStatus(job._id, 'failed');
      await this.workflowService.failStep(refNo, category, 'discover', error);
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
      // Track step in workflow
      await this.workflowService.startStep(refNo, category, 'download');

      const doc = this.lowdbService.getDocument(refNo, category);
      if (!doc) {
        throw new Error(`Document ${refNo} not found in category ${category}`);
      }

      const url = sourceUrl || doc.source?.pdfUrl || doc.source?.htmlUrl;
      // For circulars/consultations/news, we can fetch directly via API using refNo even without a URL
      // Only require URL for guidelines (which need the PDF URL for scraping)
      if (!url && category === 'guidelines') {
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
        rawPath = this.getRawFilePath(category, refNo, 'pdf');
        try {
          content = await this.circularClient.getCircularPdf(refNo);
        } catch (pdfError) {
          // If PDF fails, try HTML for modern circulars (2012+)
          const year = doc.metadata?.year || new Date().getFullYear();
          if (year >= 2012) {
            this.logger.log(`[Queue] PDF not available for ${category}/${refNo}, trying HTML content`);
            const htmlContent = await this.circularClient.getCircularHtml(refNo);
            if (htmlContent) {
              content = htmlContent;
              rawPath = this.getRawFilePath(category, refNo, 'html');
            } else {
              throw pdfError;
            }
          } else {
            throw pdfError;
          }
        }
      } else if (category === 'consultations') {
        // Consultations: check available assets first
        const assets = await this.consultationClient.checkConsultationAssets(refNo);

        if (assets.hasPdf) {
          // Try PDF first, fall back to HTML if PDF unavailable
          const pdfBuffer = await this.consultationClient.getConsultationPdf(refNo);
          if (pdfBuffer) {
            content = pdfBuffer;
            rawPath = this.getRawFilePath(category, refNo, 'pdf');
          } else if (assets.hasHtml) {
            // PDF check returned null but HTML available - use HTML
            this.logger.log(`[Queue] PDF not available for ${category}/${refNo}, using HTML content`);
            content = assets.html || '';
            rawPath = this.getRawFilePath(category, refNo, 'html');
          } else {
            throw new Error(`PDF not available and no HTML content for consultation ${refNo}`);
          }
        } else if (assets.hasHtml) {
          // No PDF available, use HTML content
          this.logger.log(`[Queue] No PDF for ${category}/${refNo}, using HTML content`);
          content = assets.html || '';
          rawPath = this.getRawFilePath(category, refNo, 'html');
        } else {
          throw new Error(`No PDF or HTML available for consultation ${refNo}`);
        }

        // Download conclusion paper if consultation is concluded
        // Use cpRefNo (not ccRefNo) with type=conclusion parameter
        if (assets.hasConclusion) {
          this.logger.log(`[Queue] Downloading conclusion for ${refNo}`);
          try {
            const conclusionBuffer = await this.consultationClient.getConclusionPdf(refNo);
            if (conclusionBuffer) {
              const conclusionPath = this.getRawFilePath(category, `${refNo}_conclusion`, 'pdf');
              await fs.ensureDir(path.dirname(conclusionPath));
              await fs.writeFile(conclusionPath, conclusionBuffer);

              // Update document with conclusion path
              const updatedDoc = this.lowdbService.getDocument(refNo, category);
              await this.lowdbService.upsertDocument(refNo, category, {
                ...updatedDoc,
                source: {
                  ...updatedDoc.source,
                  conclusionFilePath: conclusionPath,
                },
              });
              this.logger.log(`[Queue] Conclusion downloaded: ${conclusionPath}`);
            } else {
              this.logger.warn(`[Queue] Conclusion buffer null for ${refNo} - conclusion may not be published yet`);
            }
          } catch (conclusionError) {
            this.logger.error(`[Queue] Failed to download conclusion for ${refNo}:`, conclusionError);
            // Don't fail the main download - log and continue
          }
        }
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

      // Complete the download step
      await this.workflowService.completeStep(refNo, category, 'download', { rawFilePath: rawPath });

      // Auto-submit convert job after download succeeds
      // Use try/catch to prevent chain failures from affecting download completion
      this.logger.log(`[Queue] Auto-submitting convert job for ${category}/${refNo} after download`);
      try {
        await this.submitJob({
          action: 'convert',
          category,
          refNo,
        });
      } catch (err) {
        this.logger.error(`[Queue] Failed to chain convert job for ${category}/${refNo}:`, err);
        // Don't rollback - current step still completes
      }

      return job;
    } catch (error) {
      await this.lowdbService.updateQueueJobStatus(job._id, 'failed');
      await this.workflowService.failStep(refNo, category, 'download', error);
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
      // Track step in workflow
      await this.workflowService.startStep(refNo, category, 'convert');

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
        // Try Docling first, fall back to basic text extraction
        try {
          markdownContent = await this.doclingService.convertPdfToMarkdown(rawFilePath);
        } catch (doclingError) {
          this.logger.warn(`Docling failed for ${category}/${refNo}, using fallback: ${(doclingError as Error).message}`);
          const fileBuffer: Buffer = await fs.readFile(rawFilePath) as Buffer;
          markdownContent = await this.basicPdfFallback(fileBuffer);
        }
      } else {
        // Read HTML file and convert using Turndown
        const htmlContent = (await fs.readFile(rawFilePath, 'utf8')).toString();
        // Use basic HTML to markdown conversion
        markdownContent = this.basicHtmlToMarkdown(htmlContent);
      }

      // Save markdown
      const year = doc.metadata?.year || new Date().getFullYear();
      const result = await this.contentService.saveMarkdown(category, refNo, markdownContent, { year });

      // Update document with markdown info - set workflow to COMPLETED
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
          status: 'COMPLETED',
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

      // Complete the workflow
      await this.workflowService.completeWorkflow(refNo, category);

      // Complete the convert step
      await this.workflowService.completeStep(refNo, category, 'convert', {
        markdownPath: result.markdownPath,
      });

      return job;
    } catch (error) {
      await this.lowdbService.updateQueueJobStatus(job._id, 'failed');
      await this.workflowService.failStep(refNo, category, 'convert', error);
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

  private async basicPdfFallback(buffer: Buffer): Promise<string> {
    // Use pdftotext utility if available
    const { spawn } = await import('child_process');
    const path = await import('path');
    const os = await import('os');
    const fsExtra = await import('fs-extra');

    const tempInput = path.join(os.tmpdir(), `pdf_fallback_${Date.now()}.pdf`);
    const tempOutput = path.join(os.tmpdir(), `pdf_fallback_${Date.now()}.txt`);

    try {
      await fsExtra.writeFile(tempInput, buffer);

      return new Promise<string>((resolve, reject) => {
        const proc = spawn('pdftotext', [tempInput, tempOutput], { timeout: 30000 });
        proc.on('close', async (code) => {
          try {
            await fsExtra.remove(tempInput);
            if (code === 0 && await fsExtra.pathExists(tempOutput)) {
              const text: string = (await fsExtra.readFile(tempOutput, 'utf8')) as string;
              await fsExtra.remove(tempOutput);
              resolve(text || '# PDF content (extracted via pdftotext fallback)\n\nNo text content extracted.');
            } else {
              if (await fsExtra.pathExists(tempOutput)) {
                await fsExtra.remove(tempOutput);
              }
              resolve('# PDF fallback - could not extract text\n\nPDF file exists but text extraction failed.');
            }
          } catch (e) {
            resolve('# PDF fallback - extraction error\n\nError: ' + (e as Error).message);
          }
        });
        proc.on('error', () => {
          resolve('# PDF fallback - pdftotext not available\n\nPDF file exists. Install docling or pdftotext for proper conversion.');
        });
      });
    } catch (error) {
      return '# PDF fallback - error\n\nError: ' + (error as Error).message;
    }
  }

  private async processJob(job: any): Promise<any> {
    this.logger.log(`[Queue] Processing ${job.action} for ${job.category}/${job.refNo}`);

    switch (job.action) {
      case 'discover':
        return await this.discoverResource(job.category, job.refNo);
      case 'download':
        return await this.downloadResource(job.category, job.refNo, job.sourceUrl);
      case 'convert':
        return await this.convertResource(job.category, job.refNo);
      default:
        this.logger.warn(`Unknown job action: ${job.action}`);
        return { action: job.action, status: 'unknown_action' };
    }
  }

  submitJob(job: JobData): Promise<JobResult> {
    return new Promise(async (resolve, reject) => {
      try {
        // Persist job to LowDB with pending status before adding to queue
        const persistedJob = await this.lowdbService.addQueueJob({
          id: `${job.category}-${job.refNo}-${Date.now()}`,
          status: 'pending',
          ...job
        });
        this.logger.debug(`[Queue] push() [new]: ${persistedJob.action}/${persistedJob.refNo} id=${persistedJob._id || persistedJob.id}`);
        this.queue.push(persistedJob, (error: any, result?: JobResult) => {
          if (error) {
            reject(error);
          } else {
            resolve(result || { success: true });
          }
        });
      } catch (error) {
        reject(error);
      }
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
