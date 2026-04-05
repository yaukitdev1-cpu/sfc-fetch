import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Queue from 'better-queue';
import * as path from 'path';
import { LowdbService } from '../database/lowdb.service';

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

  constructor(private configService: ConfigService, private lowdbService: LowdbService) {
    this.logger = new Logger(QueueService.name);
    this.queuePath = this.configService.get<string>('queuePath') || './data/db/sfc-db.json';
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

  private async discoverResource(category: string, refNo: string): Promise<any> {
    this.logger.debug(`Discovering ${category}/${refNo}`);
    const job = await this.lowdbService.addQueueJob({
      action: 'discover',
      status: 'in_progress',
      category,
      refNo
    });
    // Add actual discovery logic here (integrate with sfc-clients)
    await this.lowdbService.updateQueueJobStatus(job._id, 'completed');
    return job;
  }

  private async downloadResource(category: string, refNo: string, sourceUrl: string): Promise<any> {
    this.logger.debug(`Downloading ${category}/${refNo} from ${sourceUrl}`);
    const job = await this.lowdbService.addQueueJob({
      action: 'download',
      status: 'in_progress',
      category,
      refNo,
      sourceUrl
    });
    // Add actual download logic here (integrate with sfc-clients)
    await this.lowdbService.updateQueueJobStatus(job._id, 'completed');
    return job;
  }

  private async convertResource(category: string, refNo: string): Promise<any> {
    this.logger.debug(`Converting ${category}/${refNo}`);
    const job = await this.lowdbService.addQueueJob({
      action: 'convert',
      status: 'in_progress',
      category,
      refNo
    });
    // Add actual conversion logic here (integrate with converters/docling.service.ts)
    await this.lowdbService.updateQueueJobStatus(job._id, 'completed');
    return job;
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
