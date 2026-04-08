import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cron from 'node-cron';
import { QueueService } from './queue.service';
import { LowdbService } from '../database/lowdb.service';
import { CircularClient } from '../sfc-clients/circular.client';
import { ConsultationClient } from '../sfc-clients/consultation.client';
import { NewsClient } from '../sfc-clients/news.client';

interface DiscoveryResult {
  category: string;
  discoveredAt: string;
  totalFound: number;
  newlyQueued: number;
  alreadyCompleted: number;
  inProgress: number;
  errors: number;
  durationMs: number;
  documentRefs: string[];
}

@Injectable()
export class DiscoverySchedulerService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(DiscoverySchedulerService.name);
  private scheduledTask: cron.ScheduledTask | null = null;

  // Config values
  private readonly enabled: boolean;
  private readonly scheduleCron: string;
  private readonly categories: string[];
  private readonly startYear: number;
  private readonly pageSize: number;
  private readonly requestIntervalMs: number;

  // Statuses that indicate a document is already being processed or completed
  private readonly skipStatuses = [
    'PENDING',
    'DISCOVERED',
    'DOWNLOADING',
    'PROCESSING',
    'RETRYING',
    'COMPLETED',
  ];

  constructor(
    private configService: ConfigService,
    private queueService: QueueService,
    private lowdbService: LowdbService,
    private circularClient: CircularClient,
    private consultationClient: ConsultationClient,
    private newsClient: NewsClient,
  ) {
    this.enabled = this.configService.get<boolean>('discoveryEnabled') ?? true;
    this.scheduleCron = this.configService.get<string>('discoveryScheduleCron') ?? '0 2 * * *';
    this.categories = (this.configService.get<string>('discoveryCategories') ?? 'circulars,consultations,news')
      .split(',')
      .map((c) => c.trim());
    this.startYear = this.configService.get<number>('discoveryStartYear') ?? 2020;
    this.pageSize = this.configService.get<number>('discoveryPageSize') ?? 100;
    this.requestIntervalMs = this.configService.get<number>('discoveryRequestIntervalMs') ?? 500;
  }

  onModuleInit() {
    if (this.enabled) {
      this.startScheduler();
    } else {
      this.logger.log('Discovery scheduler is disabled via DISCOVERY_ENABLED=false');
    }
  }

  onModuleDestroy() {
    this.stopScheduler();
  }

  private startScheduler() {
    // Run immediately on startup
    this.runDiscovery().catch((err) => {
      this.logger.error('Initial discovery run failed', err);
    });

    // Then schedule for cron
    this.scheduledTask = cron.schedule(this.scheduleCron, () => {
      this.runDiscovery().catch((err) => {
        this.logger.error('Scheduled discovery run failed', err);
      });
    });

    this.logger.log(`Discovery scheduler started with cron: ${this.scheduleCron}`);
    this.logger.log(`Discovery categories: ${this.categories.join(', ')}`);
    this.logger.log(`Discovery start year: ${this.startYear}`);
  }

  private stopScheduler() {
    if (this.scheduledTask) {
      this.scheduledTask.stop();
      this.scheduledTask = null;
      this.logger.log('Discovery scheduler stopped');
    }
  }

  async runDiscovery(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('Starting discovery run');

    const allResults: DiscoveryResult[] = [];

    for (const category of this.categories) {
      const result = await this.discoverCategory(category);
      allResults.push(result);
    }

    const totalFound = allResults.reduce((sum, r) => sum + r.totalFound, 0);
    const totalQueued = allResults.reduce((sum, r) => sum + r.newlyQueued, 0);
    const totalSkippedCompleted = allResults.reduce((sum, r) => sum + r.alreadyCompleted, 0);
    const totalSkippedInProgress = allResults.reduce((sum, r) => sum + r.inProgress, 0);
    const totalErrors = allResults.reduce((sum, r) => sum + r.errors, 0);
    const durationMs = Date.now() - startTime;

    this.logger.log(
      `Discovery run completed in ${durationMs}ms: found=${totalFound}, queued=${totalQueued}, ` +
        `skipped_completed=${totalSkippedCompleted}, skipped_in_progress=${totalSkippedInProgress}, errors=${totalErrors}`,
    );
  }

  private async discoverCategory(category: string): Promise<DiscoveryResult> {
    const startTime = Date.now();
    const result: DiscoveryResult = {
      category,
      discoveredAt: new Date().toISOString(),
      totalFound: 0,
      newlyQueued: 0,
      alreadyCompleted: 0,
      inProgress: 0,
      errors: 0,
      durationMs: 0,
      documentRefs: [],
    };

    this.logger.log(`Discovering category: ${category}`);

    try {
      const currentYear = new Date().getFullYear();
      const years = Array.from({ length: currentYear - this.startYear + 1 }, (_, i) => currentYear - i);

      for (const year of years) {
        const yearResults = await this.discoverYear(category, year, result);
        result.totalFound += yearResults.totalFound;
        result.newlyQueued += yearResults.newlyQueued;
        result.alreadyCompleted += yearResults.alreadyCompleted;
        result.inProgress += yearResults.inProgress;
        result.errors += yearResults.errors;
        result.documentRefs.push(...yearResults.documentRefs);
      }

      this.logger.log(
        `Category ${category} discovery completed: found=${result.totalFound}, queued=${result.newlyQueued}, ` +
          `skipped_completed=${result.alreadyCompleted}, skipped_in_progress=${result.inProgress}, errors=${result.errors}`,
      );
    } catch (error) {
      this.logger.error(`Error discovering category ${category}: ${error}`);
      result.errors++;
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  private async discoverYear(
    category: string,
    year: number,
    result: DiscoveryResult,
  ): Promise<Omit<DiscoveryResult, 'category' | 'discoveredAt' | 'durationMs'>> {
    const pageResults = {
      totalFound: 0,
      newlyQueued: 0,
      alreadyCompleted: 0,
      inProgress: 0,
      errors: 0,
      documentRefs: [] as string[],
    };

    let pageNo = 0;
    let hasMorePages = true;

    while (hasMorePages) {
      try {
        await this.throttle();

        const items = await this.searchCategory(category, year, pageNo, this.pageSize);

        if (!items || items.length === 0) {
          hasMorePages = false;
          break;
        }

        pageResults.totalFound += items.length;

        for (const item of items) {
          const refNo = this.extractRefNo(category, item);
          if (!refNo) {
            this.logger.warn(`Could not extract refNo from item in ${category}`, item);
            continue;
          }

          pageResults.documentRefs.push(refNo);

          const shouldQueue = await this.shouldQueueDocument(refNo, category);
          if (shouldQueue) {
            await this.queueDocument(refNo, category, item);
            pageResults.newlyQueued++;
          } else {
            const doc = this.lowdbService.getDocument(refNo, category);
            if (doc?.workflow?.status === 'COMPLETED') {
              pageResults.alreadyCompleted++;
            } else {
              pageResults.inProgress++;
            }
          }
        }

        // Check if there are more pages (based on returned count vs page size)
        if (items.length < this.pageSize) {
          hasMorePages = false;
        } else {
          pageNo++;
        }
      } catch (error) {
        this.logger.error(`Error fetching page ${pageNo} for ${category}/${year}: ${error}`);
        pageResults.errors++;
        hasMorePages = false;
      }
    }

    return pageResults;
  }

  private async searchCategory(
    category: string,
    year: number,
    pageNo: number,
    pageSize: number,
  ): Promise<any[]> {
    switch (category) {
      case 'circulars':
        return this.circularClient.searchCirculars({ year, pageNo, pageSize });
      case 'consultations':
        return this.consultationClient.searchConsultations({ year, pageNo, pageSize });
      case 'news':
        return this.newsClient.searchNews({ year, pageNo, pageSize });
      default:
        this.logger.warn(`Unknown category for search: ${category}`);
        return [];
    }
  }

  private extractRefNo(category: string, item: any): string | null {
    switch (category) {
      case 'circulars':
        return item.refNo || null;
      case 'consultations':
        return item.cpRefNo || null;
      case 'news':
        return item.newsRefNo || null;
      default:
        return null;
    }
  }

  private async shouldQueueDocument(refNo: string, category: string): Promise<boolean> {
    const doc = this.lowdbService.getDocument(refNo, category);

    if (!doc) {
      return true; // New document
    }

    const status = doc.workflow?.status;
    if (this.skipStatuses.includes(status)) {
      return false; // Already in progress or completed
    }

    return true; // Failed, stale, or unknown - should queue
  }

  private async queueDocument(refNo: string, category: string, item: any): Promise<void> {
    try {
      await this.queueService.submitJob({
        category,
        refNo,
        action: 'discover',
        data: {
          discoveredFrom: 'auto-discovery',
          discoveredAt: new Date().toISOString(),
          year: item.year || item.releaseDate?.split('-')[0] || new Date().getFullYear(),
        },
      });
      this.logger.debug(`Queued document: ${category}/${refNo}`);
    } catch (error) {
      this.logger.error(`Failed to queue document ${category}/${refNo}: ${error}`);
      throw error;
    }
  }

  private async throttle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.requestIntervalMs));
  }
}
