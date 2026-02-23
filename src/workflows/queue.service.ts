import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Queue from 'better-queue';
import * as path from 'path';

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

  constructor(private configService: ConfigService) {
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

    const processor = (job: any, cb: (error: any, result?: JobResult) => void) => {
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
      concurrent: 1,
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

  private processJob(job: any): any {
    // This would be implemented based on the job type
    // For now, it's a placeholder that will be extended with actual processors
    console.log(`[Queue] Processing ${job.action} for ${job.category}/${job.refNo}`);

    switch (job.action) {
      case 'discover':
        return { action: 'discover', status: 'pending_implementation' };
      case 'download':
        return { action: 'download', status: 'pending_implementation' };
      case 'convert':
        return { action: 'convert', status: 'pending_implementation' };
      default:
        return { action: job.action, status: 'unknown_action' };
    }
  }

  submitJob(job: JobData): Promise<JobResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({ id: `${job.category}-${job.refNo}-${Date.now()}`, ...job }, (error: any, result?: JobResult) => {
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
