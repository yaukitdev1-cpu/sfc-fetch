import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Queue from 'better-queue';
import * as path from 'path';
import * as fs from 'fs-extra';
import { LowdbService } from '../database/lowdb.service';
import { ContentService } from '../services/content.service';
import { DoclingService } from '../converters/docling.service';
import { FormatDetectorService, FileFormat } from '../converters/format-detector.service';
import { OleDocConverter } from '../converters/ole-doc.converter';
import { ZipBundleConverter } from '../converters/zip-bundle.converter';
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
  private jobLatencyTracker = new Map<string, number>();

  constructor(
    private configService: ConfigService,
    private lowdbService: LowdbService,
    private contentService: ContentService,
    private doclingService: DoclingService,
    private formatDetectorService: FormatDetectorService,
    private oleDocConverter: OleDocConverter,
    private zipBundleConverter: ZipBundleConverter,
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

    // Processor function for better-queue v3
    // Uses callback-style because that's what better-queue v3 expects
    const processor = (job: any, cb: (error: any, result?: JobResult) => void) => {
      const jobId = job.id || job._id || 'unknown';
      this.jobLatencyTracker.set(jobId, Date.now());
      this.processJob(job)
        .then(result => {
          this.jobLatencyTracker.delete(jobId);
          cb(null, { success: true, result });
        })
        .catch(error => {
          this.jobLatencyTracker.delete(jobId);
          this.logger.error(`[Queue] Job failed: ${jobId}`, error);
          cb(error, { success: false, error: error.message });
        });
    };

    // Initialize queue FIRST with processor
    // Disable better-queue's built-in retry — we manage retry lifecycle ourselves
    // via document status (RETRYING) and workflow retryCount in the DB.
    this.queue = new Queue(processor, {
      concurrent: 1,
      maxRetries: 0,
      retryDelay: 0,
      retryBackoff: false,
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

    // STEP 1: Clean up stale queue entries FIRST — before orphan reset.
    // Stale entries are in_progress jobs whose documents have already progressed
    // past that step (e.g., discover job still in_progress but doc is already
    // DOWNLOADING). Mark them completed so they don't get loaded into the queue.
    await this.cleanupStaleQueueJobs();

    // STEP 2: Fix orphaned in_progress entries from prior runs.
    // When the service restarts, better-queue's in-memory state is lost but
    // LowDB still has entries marked in_progress. These block submitJob()'s
    // dedup check, causing the queue to get stuck. Reset them to pending so
    // they get loaded into better-queue properly.
    const allJobs = this.lowdbService.getAllQueueJobs();
    const orphanedInProgress = allJobs.filter((j: any) => j.status === 'in_progress');
    if (orphanedInProgress.length > 0) {
      this.logger.warn(`[Queue] Found ${orphanedInProgress.length} orphaned in_progress entries from prior run — resetting to pending`);
      const orphanedIds = orphanedInProgress.map((j: any) => j._id);
      this.lowdbService.bulkUpdateQueueJobStatuses(orphanedIds, 'pending');
      await this.lowdbService.flush();
    }

    // STEP 3: Recovery BEFORE loading pending jobs.
    // This ensures that FAILED docs with valid markdown get completed,
    // and DOWNLOADING docs with existing markdown don't get redundant
    // convert jobs that would fail because raw files were cleaned up.
    await this.recoverStuckDocuments();

    // STEP 4: Load pending jobs from LowDB LAST, after recovery has
    // cleaned up what it can. This prevents doomed ENOENT convert jobs
    // from being loaded when recovery already completed the workflow.
    const pendingJobs = this.lowdbService.getPendingQueueJobs();
    if (pendingJobs.length > 0) {
      this.logger.log(`[Queue] Loading ${pendingJobs.length} pending jobs from LowDB`);
      pendingJobs.forEach(job => {
        const jobId = job.id || job._id;
        this.logger.debug(`[Queue] push(): ${job.action}/${job.refNo} id=${jobId}`);
        this.queue.push(job);
      });
    }

    // Cleanup stale completed/failed entries older than 7 days
    const cleaned = this.lowdbService.cleanupQueueJobs(7);
    if (cleaned > 0) {
      this.logger.log(`[Queue] Cleaned up ${cleaned} stale queue entries`);
    }

    this.logger.log('[Queue] Initialized');

    // Worker heartbeat: log every 30s so we can tell if the worker is alive
    setInterval(() => {
      const stats = this.getStats();
      this.logger.log(`[Queue] Heartbeat: running=${stats.running}, pending=${stats.pendingPersisted}, length=${stats.length}`);
    }, 30000);
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
            // Check retry count to prevent infinite retry storms
            const retryCount = doc.workflow?.retryCount || 0;
            if (retryCount >= 3) {
              this.logger.warn(`[Recovery] Skipping ${category}/${refNo} - max retries exceeded (${retryCount}), marking as FAILED`);
              await this.lowdbService.upsertDocument(refNo, category, {
                ...doc,
                workflow: {
                  ...doc.workflow,
                  status: 'FAILED',
                  downloadError: 'Max retries exceeded during recovery',
                },
              });
              continue;
            }
            // Check for existing pending/in_progress jobs to avoid duplicates
            const existingJobs = this.lowdbService.getPendingQueueJobs()
              .filter(j => j.category === category && j.refNo === refNo);
            if (existingJobs.length > 0) {
              this.logger.debug(`[Recovery] Job already exists for ${category}/${refNo}, skipping`);
              continue;
            }
            this.logger.log(`[Recovery] Re-submitting download job for stuck ${category}/${refNo}`);
            // For circulars, don't use sourceUrl - getCircularPdf uses refNo directly
            // sourceUrl was never set for circulars during discover because SFC API doesn't provide pdfUrl
            // Fire-and-forget: enqueue job without waiting for completion to avoid app.init() timeout
            this.submitJob({
              action: 'download',
              category,
              refNo,
              sourceUrl: category === 'circulars' ? undefined : (doc.source?.pdfUrl || doc.source?.htmlUrl),
            }).catch(err => this.logger.error(`[Recovery] Failed to enqueue download job for ${category}/${refNo}:`, err));
            recoveredCount++;
          } else if (status === 'DOWNLOADING') {
            // Document download was completed but convert wasn't submitted.
            // But if markdownPath already exists (from a prior successful convert),
            // complete the workflow instead of re-submitting a doomed convert job.
            if (doc.content?.markdownPath) {
              const contentDir = path.join(process.cwd(), 'data', 'content');
              const fullPath = path.join(contentDir, doc.content.markdownPath);
              if (await fs.pathExists(fullPath)) {
                this.logger.log(`[Recovery] DOWNLOADING doc ${category}/${refNo} already has markdown — completing workflow`);
                try {
                  await this.workflowService.completeWorkflow(refNo, category);
                  recoveredCount++;
                  continue;
                } catch (error) {
                  this.logger.warn(`[Recovery] Failed to complete stuck workflow for ${category}/${refNo}: ${error}`);
                }
              }
            }
            // Check for existing pending/in_progress jobs to avoid duplicates
            const existingJobs = this.lowdbService.getPendingQueueJobs()
              .filter(j => j.category === category && j.refNo === refNo);
            if (existingJobs.length > 0) {
              this.logger.debug(`[Recovery] Job already exists for ${category}/${refNo}, skipping`);
              continue;
            }
            this.logger.log(`[Recovery] Re-submitting convert job for stuck ${category}/${refNo}`);
            // Fire-and-forget: enqueue job without waiting for completion to avoid app.init() timeout
            this.submitJob({
              action: 'convert',
              category,
              refNo,
            }).catch(err => this.logger.error(`[Recovery] Failed to enqueue convert job for ${category}/${refNo}:`, err));
            recoveredCount++;
          } else if (status === 'RETRYING') {
            // Document failed but hasn't exhausted retries — re-enqueue for processing
            const retryCount = doc.workflow?.retryCount || 0;
            if (retryCount >= 3) {
              this.logger.warn(`[Recovery] ${category}/${refNo} exceeded max retries (${retryCount}), marking as FAILED`);
              await this.lowdbService.upsertDocument(refNo, category, {
                ...doc,
                workflow: {
                  ...doc.workflow,
                  status: 'FAILED',
                },
              });
            } else {
              const existingJobs = this.lowdbService.getPendingQueueJobs()
                .filter(j => j.category === category && j.refNo === refNo);
              if (existingJobs.length > 0) {
                this.logger.debug(`[Recovery] Job already exists for ${category}/${refNo}, skipping`);
              } else {
                this.logger.log(`[Recovery] Re-submitting download job for RETRYING ${category}/${refNo} (retry ${retryCount + 1}/3)`);
                this.submitJob({
                  action: 'download',
                  category,
                  refNo,
                  sourceUrl: category === 'circulars' ? undefined : (doc.source?.pdfUrl || doc.source?.htmlUrl),
                }).catch(err => this.logger.error(`[Recovery] Failed to enqueue download job for ${category}/${refNo}:`, err));
              }
            }
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
                // Fire-and-forget: enqueue job without waiting for completion to avoid app.init() timeout
                this.submitJob({
                  action: 'convert',
                  category,
                  refNo,
                }).catch(err => this.logger.error(`[Recovery] Failed to enqueue convert job for ${category}/${refNo}:`, err));
              }
            }
            recoveredCount++;
          } else if (status === 'FAILED' && doc.content?.markdownPath) {
            // Document is FAILED but has a valid markdownPath on disk — conversion
            // succeeded but the workflow was never completed (e.g., ENOENT from a
            // subsequent retry after cleanupRawFile deleted the source PDF).
            // Instead of resubmitting (which would fail again), complete the workflow.
            const contentDir = path.join(process.cwd(), 'data', 'content');
            const fullPath = path.join(contentDir, doc.content.markdownPath);
            try {
              if (await fs.pathExists(fullPath)) {
                this.logger.log(`[Recovery] FAILED doc ${category}/${refNo} has valid markdown (${doc.content.markdownSize}B) — completing workflow`);
                await this.workflowService.completeWorkflow(refNo, category);
                recoveredCount++;
              } else {
                this.logger.warn(`[Recovery] FAILED doc ${category}/${refNo} has stale markdownPath (file missing) — leaving as FAILED`);
              }
            } catch (error) {
              this.logger.warn(`[Recovery] Failed to complete workflow for FAILED ${category}/${refNo}: ${error}`);
            }
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

  /**
   * Removes stale in_progress queue entries where the document has already
   * progressed past the job's action (e.g., discover job still marked
   * in_progress but document is already DOWNLOADING or later).
   */
  private async cleanupStaleQueueJobs(): Promise<void> {
    try {
      const allJobs = this.lowdbService.getAllQueueJobs();
      const stale = allJobs.filter((j: any) => {
        if (j.status !== 'in_progress') return false;
        const doc = this.lowdbService.getDocument(j.refNo, j.category);
        if (!doc) return false; // document gone — orphan, clean it
        const docStatus = doc.workflow?.status || 'DISCOVERED';

        if (j.action === 'discover') {
          // discover is stale if doc is past DISCOVERED
          return docStatus !== 'DISCOVERED' && docStatus !== 'UNKNOWN';
        }
        if (j.action === 'download') {
          // download is stale if doc already has rawFilePath or is past DOWNLOADING
          return !!(doc.content?.rawFilePath || doc.source?.rawFilePath);
        }
        if (j.action === 'convert') {
          // convert is stale if doc already has markdownPath or is past PROCESSING
          return !!(doc.content?.markdownPath);
        }
        return false;
      });

      if (stale.length > 0) {
        this.logger.log(`[Recovery] Cleaning up ${stale.length} stale in_progress queue entries`);
        const staleIds = stale.map((j: any) => j._id);
        this.lowdbService.bulkUpdateQueueJobStatuses(staleIds, 'completed');
        await this.lowdbService.flush();
      } else {
        this.logger.debug(`[Recovery] No stale queue entries found among ${allJobs.filter((j: any) => j.status === 'in_progress').length} in_progress entries`);
      }
    } catch (error) {
      this.logger.error('[Recovery] Error cleaning up stale queue jobs:', error);
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
      // Fetch metadata from appropriate SFC client FIRST
      // (This doesn't require the document to exist yet)
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

      // Create or update the document FIRST via upsert
      // This ensures the document exists before we try to track workflow steps
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

      // NOW track step in workflow (document exists after upsert)
      await this.workflowService.startStep(refNo, category, 'discover');

      // Re-fetch doc after upsert since local doc variable may be stale
      const updatedDoc = this.lowdbService.getDocument(refNo, category);

      await this.lowdbService.updateQueueJobStatus(job._id, 'completed');

      // Complete the discover step
      await this.workflowService.completeStep(refNo, category, 'discover', {
        pdfUrl: metadata.pdfUrl || metadata.pdfLink,
        htmlUrl: metadata.htmlUrl || metadata.url,
      });

      // For circulars, directly fetch the PDF here instead of auto-submitting a download job
      // This avoids the broken chain where submitJob fails silently (error caught but not propagated)
      // The circular download uses refNo directly via getCircularPdf, so no sourceUrl is needed
      if (category === 'circulars') {
        this.logger.log(`[Queue] Fetching PDF directly for circular ${refNo} after discover`);
        const rawPath = this.getRawFilePath(category, refNo, 'pdf');
        try {
          const content = await this.circularClient.getCircularPdf(refNo);
          await fs.ensureDir(path.dirname(rawPath));
          await fs.writeFile(rawPath, content);

          // Update document with raw file path and set workflow to DOWNLOADING
          await this.lowdbService.upsertDocument(refNo, category, {
            ...updatedDoc,
            source: {
              ...updatedDoc.source,
              rawFilePath: rawPath,
            },
            workflow: {
              ...updatedDoc.workflow,
              status: 'DOWNLOADING',
            },
          });

          // Auto-submit convert job after download succeeds
          this.logger.log(`[Queue] Auto-submitting convert job for ${category}/${refNo} after direct PDF fetch`);
          this.submitJob({
            action: 'convert',
            category,
            refNo,
          }).catch(err => this.logger.error(`[Queue] Failed to chain convert job for ${category}/${refNo}:`, err));
        } catch (pdfError) {
          // If PDF fails, try HTML for modern circulars (2012+)
          const year = updatedDoc.metadata?.year || new Date().getFullYear();
          if (year >= 2012) {
            this.logger.log(`[Queue] PDF not available for circular ${refNo}, trying HTML content`);
            const htmlContent = await this.circularClient.getCircularHtml(refNo);
            if (htmlContent) {
              const htmlPath = this.getRawFilePath(category, refNo, 'html');
              await fs.ensureDir(path.dirname(htmlPath));
              await fs.writeFile(htmlPath, htmlContent);

              // Update document with raw file path and set workflow to DOWNLOADING
              await this.lowdbService.upsertDocument(refNo, category, {
                ...updatedDoc,
                source: {
                  ...updatedDoc.source,
                  rawFilePath: htmlPath,
                },
                workflow: {
                  ...updatedDoc.workflow,
                  status: 'DOWNLOADING',
                },
              });

              // Auto-submit convert job after download succeeds
              this.logger.log(`[Queue] Auto-submitting convert job for ${category}/${refNo} after HTML fetch`);
              this.submitJob({
                action: 'convert',
                category,
                refNo,
              }).catch(err => this.logger.error(`[Queue] Failed to chain convert job for ${category}/${refNo}:`, err));
            } else {
              throw pdfError;
            }
          } else {
            throw pdfError;
          }
        }
      } else if (category === 'news') {
        // News: HTML content is embedded inline in metadata.html during discover.
        // No URL download step needed — write the inline HTML to a raw file
        // and submit the convert job directly.
        const htmlContent = updatedDoc.metadata?.html;
        if (!htmlContent) {
          this.logger.error(`[Queue] No inline HTML found in metadata for news ${refNo}, cannot convert`);
          // Let discover complete but don't chain — the convert will fail with proper error
          return job;
        }

        // Check for placeholder HTML (e.g., "English version not available")
        // These are legitimately empty — mark as FAILED with clear error instead of COMPLETED
        const placeholderPatterns = [
          /english version.*not available/i,
          /中文版本.*不可用/,
          /please use chinese version/i,
          /请使用中文版本/,
        ];
        const isPlaceholder = placeholderPatterns.some(pattern => pattern.test(htmlContent));

        if (isPlaceholder) {
          this.logger.warn(`[Queue] News ${refNo} has placeholder HTML (no English content), marking as FAILED`);
          await this.lowdbService.upsertDocument(refNo, category, {
            ...updatedDoc,
            source: {
              ...updatedDoc.source,
              rawFilePath: this.getRawFilePath(category, refNo, 'html'),
            },
            workflow: {
              ...updatedDoc.workflow,
              status: 'FAILED',
              currentStep: 'convert',
              error: 'No English content available (placeholder HTML detected)',
              failedAt: new Date().toISOString(),
            },
            content: {
              ...updatedDoc.content,
              markdownSize: 0,
            },
          });
          return job;
        }

        const rawPath = this.getRawFilePath(category, refNo, 'html');
        await fs.ensureDir(path.dirname(rawPath));
        await fs.writeFile(rawPath, htmlContent);

        await this.lowdbService.upsertDocument(refNo, category, {
          ...updatedDoc,
          source: {
            ...updatedDoc.source,
            rawFilePath: rawPath,
          },
          workflow: {
            ...updatedDoc.workflow,
            status: 'DOWNLOADING', // Skip explicit download step — HTML is already available
          },
        });

        this.logger.log(`[Queue] Auto-submitting convert job for ${category}/${refNo} (inline HTML from discover)`);
        this.submitJob({
          action: 'convert',
          category,
          refNo,
        }).catch(err => this.logger.error(`[Queue] Failed to chain convert job for ${category}/${refNo}:`, err));
      } else {
        // Consultations and other categories: URL-based download, then convert
        this.logger.log(`[Queue] Auto-submitting download job for ${category}/${refNo} after discover`);
        this.submitJob({
          action: 'download',
          category,
          refNo,
          sourceUrl: metadata.pdfUrl || metadata.pdfLink || metadata.url,
        }).catch(err => this.logger.error(`[Queue] Failed to chain download job for ${category}/${refNo}:`, err));
      }

      return job;
    } catch (error: any) {
      // Ensure document exists with FAILED status before calling failStep
      // This handles the case where getCircular failed BEFORE the document was upserted
      const errorMessage = error?.message || String(error);
      const errorType = error?.type || 'UNKNOWN';
      const errorStack = error?.stack;

      let doc = this.lowdbService.getDocument(refNo, category);
      if (!doc) {
        // Document was never created because getCircular failed before upsertDocument
        // Create a minimal document with FAILED status and the error
        await this.lowdbService.upsertDocument(refNo, category, {
          _id: refNo,
          category,
          metadata: {},
          workflow: {
            status: 'FAILED',
            currentStep: 'discover',
            error: errorMessage,
            startedAt: new Date().toISOString(),
          },
          subworkflow: {
            steps: [{
              step: 'discover',
              status: 'FAILED',
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              errors: [{
                attempt: 1,
                timestamp: new Date().toISOString(),
                errorType: errorType,
                message: errorMessage,
              }],
            }],
          },
          history: {
            runs: [],
            retries: [],
            errors: [{
              timestamp: new Date().toISOString(),
              message: errorMessage,
              stack: errorStack,
            }],
          },
        });
        doc = this.lowdbService.getDocument(refNo, category);
      } else if (!doc.subworkflow?.steps?.find((s: any) => s.step === 'discover')) {
        // Document exists but discover step was never added (startStep was never called)
        // Add the discover step with FAILED status and error
        const now = new Date().toISOString();
        doc.workflow.status = 'FAILED';
        doc.workflow.error = errorMessage;
        if (!doc.metadata) doc.metadata = {};
        if (!doc.subworkflow) doc.subworkflow = { steps: [] };
        if (!doc.subworkflow.steps) doc.subworkflow.steps = [];
        doc.subworkflow.steps.push({
          step: 'discover',
          status: 'FAILED',
          startedAt: now,
          completedAt: now,
          attempts: 1,
          errors: [{
            attempt: 1,
            timestamp: now,
            errorType: errorType,
            message: errorMessage,
          }],
        });
        await this.lowdbService.upsertDocument(refNo, category, doc);
      }

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

        // Always try PDF first — fileKeySeq may be null for old consultations (1989-2001)
        // but PDFs are still available via the openFile endpoint
        const pdfBuffer = await this.consultationClient.getConsultationPdf(refNo);
        if (pdfBuffer) {
          content = pdfBuffer;
          rawPath = this.getRawFilePath(category, refNo, 'pdf');
        } else if (assets.hasHtml) {
          // PDF not available, fall back to HTML content
          this.logger.log(`[Queue] PDF not available for ${category}/${refNo}, using HTML content`);
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
      // Fire-and-forget: don't await to avoid deadlocking the single worker thread
      this.logger.log(`[Queue] Auto-submitting convert job for ${category}/${refNo} after download`);
      this.submitJob({
        action: 'convert',
        category,
        refNo,
      }).catch(err => {
        this.logger.error(`[Queue] Failed to chain convert job for ${category}/${refNo}:`, err);
      });

      return job;
    } catch (error: any) {
      // Handle retry logic to prevent infinite retry storms
      const doc = this.lowdbService.getDocument(refNo, category);
      if (doc) {
        const retryCount = doc.workflow?.retryCount || 0;
        if (retryCount >= 3) {
          // Max retries exceeded - mark as FAILED
          await this.lowdbService.upsertDocument(refNo, category, {
            ...doc,
            workflow: {
              ...doc.workflow,
              status: 'FAILED',
              downloadError: error?.message || String(error),
            },
          });
        } else {
          // Set to RETRYING (not DISCOVERED) and increment retry count
          await this.lowdbService.upsertDocument(refNo, category, {
            ...doc,
            workflow: {
              ...doc.workflow,
              status: 'RETRYING',
              retryCount: retryCount + 1,
              downloadError: error?.message || String(error),
            },
          });
        }
      }
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

      let rawFilePath = doc.source?.rawFilePath;
      // If rawFilePath doesn't exist but metadata.html has inline HTML (e.g., news),
      // write it to a temp file so conversion can proceed
      if (!rawFilePath && doc.metadata?.html) {
        rawFilePath = this.getRawFilePath(category, refNo, 'html');
        if (!(await fs.pathExists(rawFilePath))) {
          this.logger.log(`[Queue] No rawFilePath for ${category}/${refNo}, writing inline HTML to ${rawFilePath}`);
          await fs.ensureDir(path.dirname(rawFilePath));
          await fs.writeFile(rawFilePath, doc.metadata.html);
        }
      }
      if (!rawFilePath) {
        throw new Error(`No raw file path found for ${category}/${refNo}`);
      }

      let markdownPath: string;
      let markdownContent: string;
      let needsManualOcr = false;

      // Detect actual file format via magic bytes, not extension
      const detectedFormat = await this.formatDetectorService.detectFormat(rawFilePath);
      this.logger.debug(`[Queue] Format detected for ${refNo}: ${detectedFormat} (path: ${rawFilePath})`);

      // For circulars, try to get HTML content as fallback
      let htmlContent: string | null = null;
      if (category === 'circulars') {
        try {
          htmlContent = await this.circularClient.getCircularHtml(refNo);
        } catch (htmlError) {
          this.logger.debug(`[Queue] Could not fetch HTML for ${refNo}: ${(htmlError as Error).message}`);
        }
      }

      if (detectedFormat === FileFormat.ZIP) {
        // ZIP bundle — extract and convert the main circular PDF
        markdownContent = await this.zipBundleConverter.convert(rawFilePath, refNo, htmlContent || undefined);
        const meaningfulChars = markdownContent.replace(/[\x00-\x1f\x7f]/g, '').replace(/\s/g, '').length;
        if (meaningfulChars < 50) {
          this.logger.error(`[Queue] ZIP conversion produced only ${meaningfulChars} chars for ${category}/${refNo} - needs manual OCR`);
          needsManualOcr = true;
        }
      } else if (detectedFormat === FileFormat.OLE2) {
        // Legacy .doc (OLE2) — extract text via antiword
        markdownContent = await this.oleDocConverter.convert(rawFilePath);
        const meaningfulChars = markdownContent.replace(/[\x00-\x1f\x7f]/g, '').replace(/\s/g, '').length;
        if (meaningfulChars < 50) {
          this.logger.error(`[Queue] OLE2 conversion produced only ${meaningfulChars} chars for ${category}/${refNo} - needs manual OCR`);
          needsManualOcr = true;
        }
      } else if (detectedFormat === FileFormat.PDF) {
        // Standard PDF — try Docling first, fall back to pdftotext, then HTML
        try {
          markdownContent = await this.doclingService.convertPdfToMarkdown(rawFilePath);
          const meaningfulChars = markdownContent.replace(/[\x00-\x1f\x7f]/g, '').replace(/\s/g, '').length;
          if (meaningfulChars < 50) {
            throw new Error(`Docling produced insufficient content (${meaningfulChars} chars), retrying with pdftotext`);
          }
        } catch (doclingError) {
          this.logger.warn(`Docling failed for ${category}/${refNo}, using fallback: ${(doclingError as Error).message}`);
          const fileBuffer: Buffer = await fs.readFile(rawFilePath) as Buffer;
          markdownContent = await this.basicPdfFallback(fileBuffer);
          const fallbackMeaningful = markdownContent.replace(/[\x00-\x1f\x7f]/g, '').replace(/\s/g, '').length;
          
          // If fallback also insufficient, try HTML
          if (fallbackMeaningful < 50) {
            if (htmlContent) {
              this.logger.log(`[Queue] PDF fallback insufficient for ${category}/${refNo}, using HTML content`);
              markdownContent = this.basicHtmlToMarkdown(htmlContent);
              const htmlMeaningful = markdownContent.replace(/[\x00-\x1f\x7f]/g, '').replace(/\s/g, '').length;
              if (htmlMeaningful < 50) {
                this.logger.error(`[Queue] HTML also insufficient (${htmlMeaningful} chars) for ${category}/${refNo} - needs manual OCR`);
                needsManualOcr = true;
              }
            } else {
              this.logger.error(`[Queue] No HTML fallback available for ${category}/${refNo} - needs manual OCR`);
              needsManualOcr = true;
            }
          }
        }
      } else {
        // Fallback: treat as HTML / plain text
        const fileContent = (await fs.readFile(rawFilePath)).toString();
        const firstBytes = fileContent.slice(0, 10).trim();
        if (firstBytes.startsWith('<') || firstBytes.includes('<!DOCTYPE') || firstBytes.includes('<html')) {
          markdownContent = this.basicHtmlToMarkdown(fileContent);
        } else {
          markdownContent = fileContent;
        }
        const meaningfulChars = markdownContent.replace(/[\x00-\x1f\x7f]/g, '').replace(/\s/g, '').length;
        if (meaningfulChars < 50) {
          this.logger.error(`[Queue] Conversion produced only ${meaningfulChars} chars for ${category}/${refNo} - needs manual OCR`);
          needsManualOcr = true;
        }
      }

      // For news items, extract and process PDF attachments from HTML
      let appendices: Array<{ url: string; text: string; localPath: string; markdownPath?: string }> = [];
      if (category === 'news' && !needsManualOcr) {
        const htmlContent = (await fs.readFile(rawFilePath)).toString();
        const pdfLinks = this.extractPdfLinksFromHtml(htmlContent);
        
        if (pdfLinks.length > 0) {
          this.logger.log(`[Queue] Found ${pdfLinks.length} PDF link(s) in news ${refNo}`);
          
          for (let i = 0; i < pdfLinks.length; i++) {
            const link = pdfLinks[i];
            const appendixRef = `${refNo}_appendix_${i + 1}`;
            const pdfPath = this.getRawFilePath(category, appendixRef, 'pdf');
            
            try {
              this.logger.log(`[Queue] Downloading PDF attachment ${i + 1}/${pdfLinks.length}: ${link.url}`);
              await this.downloadPdf(link.url, pdfPath);
              
              // Convert PDF to markdown
              const { markdown: pdfMarkdown, needsManualOcr: pdfNeedsOcr } = await this.convertPdfToMarkdown(pdfPath);
              
              if (pdfNeedsOcr) {
                this.logger.warn(`[Queue] PDF attachment ${i + 1} for ${refNo} needs manual OCR`);
                // Don't fail the whole doc, just note it
                appendices.push({
                  url: link.url,
                  text: link.text,
                  localPath: pdfPath,
                  markdownPath: undefined, // Will be handled separately
                });
              } else {
                // Save the appendix markdown
                const year = doc.metadata?.year || new Date().getFullYear();
                const appendixResult = await this.contentService.saveMarkdown(
                  category,
                  appendixRef,
                  pdfMarkdown,
                  { year }
                );
                
                // Append to main markdown content
                markdownContent += `\n\n---\n\n## Attachment: ${link.text || 'PDF'}\n\n${pdfMarkdown}`;
                
                appendices.push({
                  url: link.url,
                  text: link.text,
                  localPath: pdfPath,
                  markdownPath: appendixResult.markdownPath,
                });
                
                this.logger.log(`[Queue] Successfully processed PDF attachment ${i + 1}/${pdfLinks.length} for ${refNo}`);
              }
              
              // Cleanup the raw PDF after conversion
              await this.cleanupRawFile(pdfPath);
              
            } catch (pdfError) {
              this.logger.warn(`[Queue] Failed to process PDF attachment ${i + 1} for ${refNo}: ${(pdfError as Error).message}`);
              // Continue with other attachments
            }
          }
        }
      }

      // If needs manual OCR, don't save broken markdown - mark for manual processing
      if (needsManualOcr) {
        this.logger.warn(`[Queue] Marking ${category}/${refNo} for manual OCR`);
        await this.lowdbService.upsertDocument(refNo, category, {
          ...doc,
          workflow: {
            ...doc.workflow,
            status: 'NEEDS_MANUAL_OCR',
            error: `Conversion produced insufficient content - PDF may be scanned images with no text layer`,
            needsManualOcr: true,
          },
        });
        // Don't cleanup raw file - keep it for manual processing
        await this.lowdbService.updateQueueJobStatus(job._id, 'failed');
        await this.workflowService.failStep(refNo, category, 'convert', new Error('Needs manual OCR'));
        return job;
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
          // Track PDF appendices if any
          ...(appendices.length > 0 && {
            appendices: appendices.map(a => ({
              url: a.url,
              text: a.text,
              markdownPath: a.markdownPath,
            })),
          }),
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

  /**
   * Extract PDF links from HTML content
   * Returns array of { url, text } objects
   */
  private extractPdfLinksFromHtml(html: string): Array<{ url: string; text: string }> {
    const links: Array<{ url: string; text: string }> = [];
    // Match <a> tags with href containing .pdf
    const linkRegex = /<a[^>]*href=["']([^"']*\.pdf[^"']*)["'][^>]*>(.*?)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      const text = match[2].replace(/<[^>]+>/g, '').trim(); // Strip HTML tags from link text
      links.push({ url, text });
    }
    return links;
  }

  /**
   * Download a PDF from URL to local file
   * Returns the local file path
   */
  private async downloadPdf(url: string, destPath: string): Promise<string> {
    // Ensure https
    const httpsUrl = url.replace(/^http:\/\//i, 'https://');
    
    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    
    try {
      const response = await fetch(httpsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SFC-Fetch/1.0)',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to download PDF: HTTP ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.ensureDir(path.dirname(destPath));
      await fs.writeFile(destPath, buffer);
      
      return destPath;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Convert a PDF file to markdown, with fallback
   * Returns { markdown, needsManualOcr }
   */
  private async convertPdfToMarkdown(pdfPath: string): Promise<{ markdown: string; needsManualOcr: boolean }> {
    try {
      const markdown = await this.doclingService.convertPdfToMarkdown(pdfPath);
      const meaningfulChars = markdown.replace(/[\x00-\x1f\x7f]/g, '').replace(/\s/g, '').length;
      if (meaningfulChars >= 50) {
        return { markdown, needsManualOcr: false };
      }
    } catch (doclingError) {
      this.logger.warn(`Docling failed for PDF ${pdfPath}, using fallback: ${(doclingError as Error).message}`);
    }

    // Fallback to basicPdfFallback
    const fileBuffer = await fs.readFile(pdfPath) as Buffer;
    const markdown = await this.basicPdfFallback(fileBuffer);
    const meaningfulChars = markdown.replace(/[\x00-\x1f\x7f]/g, '').replace(/\s/g, '').length;
    
    return {
      markdown,
      needsManualOcr: meaningfulChars < 50,
    };
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
        // Check for existing pending/in_progress job for same (category, refNo, action)
        const existingJobs = this.lowdbService.getPendingQueueJobs()
          .filter(j => j.category === job.category && j.refNo === job.refNo && j.action === job.action);
        if (existingJobs.length > 0) {
          this.logger.debug(`[Queue] Job already exists for ${job.action}/${job.category}/${job.refNo}, reusing existing`);
          resolve({ success: true, result: existingJobs[0] });
          return;
        }

        // Persist job to LowDB with pending status before adding to queue
        const jobId = `${job.action}-${job.category}-${job.refNo}`;
        const persistedJob = await this.lowdbService.addQueueJob({
          id: jobId,
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
    const allQueueEntries = this.lowdbService.getAllQueueJobs();
    const pendingCount = allQueueEntries.filter((j: any) => j.status === 'pending').length;
    const inProgressCount = allQueueEntries.filter((j: any) => j.status === 'in_progress').length;
    return {
      length: this.queue.length,
      totalPersisted: allQueueEntries.length,
      pendingPersisted: pendingCount,
      inProgressPersisted: inProgressCount,
      completedPersisted: allQueueEntries.filter((j: any) => j.status === 'completed').length,
      failedPersisted: allQueueEntries.filter((j: any) => j.status === 'failed').length,
      running: this.jobLatencyTracker?.size ?? 0,
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
