import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cron from 'node-cron';
import { QueueService } from './queue.service';
import { LowdbService } from '../database/lowdb.service';
import { CircularClient } from '../sfc-clients/circular.client';
import { ConsultationClient } from '../sfc-clients/consultation.client';
import { NewsClient } from '../sfc-clients/news.client';
import { GuidelineScraper } from '../sfc-clients/guideline.scraper';

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
    private guidelineScraper: GuidelineScraper,
  ) {
    this.enabled = this.configService.get<boolean>('discoveryEnabled') ?? true;
    this.scheduleCron = this.configService.get<string>('discoveryScheduleCron') ?? '0 2 * * *';
    const rawCategories = this.configService.get<string[]>('discoveryCategories') ?? ['circulars', 'consultations', 'news'];
    // Handle both array (from config) and string (from env var) inputs
    if (Array.isArray(rawCategories)) {
      this.categories = rawCategories;
    } else if (typeof rawCategories === 'string') {
      this.categories = (rawCategories as string).split(',').map((c: string) => c.trim());
    } else {
      this.categories = ['circulars', 'consultations', 'news'];
    }
    this.startYear = this.configService.get<number>('discoveryStartYear') ?? 2000;
    this.pageSize = this.configService.get<number>('discoveryPageSize') ?? 100;
    this.requestIntervalMs = this.configService.get<number>('discoveryRequestIntervalMs') ?? 500;
  }

  onModuleInit() {
    if (this.enabled) {
      // Delay discovery start to 5 minutes after server starts
      // This gives queue time to process initial jobs without discovery interference
      this.logger.log('Discovery scheduler disabled for first 5 minutes');
      setTimeout(() => {
        this.logger.log('Discovery scheduler now starting...');
        this.startScheduler();
      }, 300000);
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
      // Guidelines are scraped from a single HTML page, not year-paginated
      if (category === 'guidelines') {
        const guidelinesResult = await this.discoverGuidelines(result);
        result.totalFound = guidelinesResult.totalFound;
        result.newlyQueued = guidelinesResult.newlyQueued;
        result.alreadyCompleted = guidelinesResult.alreadyCompleted;
        result.inProgress = guidelinesResult.inProgress;
        result.errors = guidelinesResult.errors;
        result.documentRefs = guidelinesResult.documentRefs;
      } else if (category === 'consultations') {
        // Consultations: use year="all" for single API call (only 217 total)
        const consultationsResult = await this.discoverAllAtOnce(category, result);
        result.totalFound = consultationsResult.totalFound;
        result.newlyQueued = consultationsResult.newlyQueued;
        result.alreadyCompleted = consultationsResult.alreadyCompleted;
        result.inProgress = consultationsResult.inProgress;
        result.errors = consultationsResult.errors;
        result.documentRefs = consultationsResult.documentRefs;
      } else if (category === 'news') {
        // News: use year="all" for single API call (5205 items across 30 years)
        const newsResult = await this.discoverAllAtOnce(category, result);
        result.totalFound = newsResult.totalFound;
        result.newlyQueued = newsResult.newlyQueued;
        result.alreadyCompleted = newsResult.alreadyCompleted;
        result.inProgress = newsResult.inProgress;
        result.errors = newsResult.errors;
        result.documentRefs = newsResult.documentRefs;
      } else {
        // Circulars: must iterate year-by-year (no year="all" support)
        // Iterate backward from current year, stopping when a year returns 0 items
        const currentYear = new Date().getFullYear();
        let year = currentYear;

        while (year >= 1) {
          const yearResults = await this.discoverYear(category, year, result);
          result.totalFound += yearResults.totalFound;
          result.newlyQueued += yearResults.newlyQueued;
          result.alreadyCompleted += yearResults.alreadyCompleted;
          result.inProgress += yearResults.inProgress;
          result.errors += yearResults.errors;
          result.documentRefs.push(...yearResults.documentRefs);

          // Stop when a year returns 0 items - no earlier years will have data either
          if (yearResults.totalFound === 0) {
            this.logger.log(`Year ${year} returned 0 items for ${category}, stopping discovery`);
            break;
          }

          year--;
        }
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

  private async discoverGuidelines(
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

    try {
      await this.throttle();
      const items = await this.guidelineScraper.getGuidelinesList();

      pageResults.totalFound = items.length;

      for (const item of items) {
        const refNo = this.extractRefNo('guidelines', item);
        if (!refNo) {
          this.logger.warn(`Could not extract refNo from guideline item`, item);
          continue;
        }

        pageResults.documentRefs.push(refNo);

        const shouldQueue = await this.shouldQueueDocument(refNo, 'guidelines');
        if (shouldQueue) {
          await this.queueDocument(refNo, 'guidelines', item);
          pageResults.newlyQueued++;
        } else {
          const doc = this.lowdbService.getDocument(refNo, 'guidelines');
          if (doc?.workflow?.status === 'COMPLETED') {
            pageResults.alreadyCompleted++;
          } else {
            pageResults.inProgress++;
          }
        }
      }

      this.logger.log(`Guidelines discovery completed: found=${pageResults.totalFound}, queued=${pageResults.newlyQueued}`);
    } catch (error) {
      this.logger.error(`Error discovering guidelines: ${error}`);
      pageResults.errors++;
    }

    return pageResults;
  }

  /**
   * Discovery for categories that support year="all" (consultations, news).
   * Uses a single API call to fetch all documents across all years.
   */
  private async discoverAllAtOnce(
    category: string,
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
    const MAX_ITEMS = 10000; // Safety cap
    const PAGE_SIZE = 500; // Large page size for efficiency

    while (hasMorePages && pageNo < MAX_ITEMS / PAGE_SIZE) {
      try {
        this.logger.log(`DEBUG discoverAllAtOnce: about to call searchCategory for ${category} page ${pageNo}`);
        await this.throttle();
        this.logger.log(`DEBUG discoverAllAtOnce: throttle done, calling searchCategory`);

        // Use 'all' for year parameter - single call gets everything
        const items = await this.searchCategory(category, 'all' as any, pageNo, PAGE_SIZE);
        this.logger.log(`DEBUG discoverAllAtOnce: searchCategory returned ${items?.length ?? 'null'} items, starting loop`);

        if (!items || items.length === 0) {
          hasMorePages = false;
          break;
        }

        pageResults.totalFound += items.length;
        this.logger.log(`DEBUG discoverAllAtOnce: totalFound now ${pageResults.totalFound}, starting item loop`);

        for (const item of items) {
          this.logger.log(`DEBUG discoverAllAtOnce: processing item`);
          const refNo = this.extractRefNo(category, item);
          if (!refNo) {
            this.logger.warn(`Could not extract refNo from item in ${category}`, item);
            continue;
          }

          this.logger.log(`DEBUG discoverAllAtOnce: refNo=${refNo}`);
          pageResults.documentRefs.push(refNo);

          this.logger.log(`DEBUG discoverAllAtOnce: calling shouldQueueDocument for ${refNo}`);
          const shouldQueue = await this.shouldQueueDocument(refNo, category);
          this.logger.log(`DEBUG discoverAllAtOnce: shouldQueue=${shouldQueue} for ${refNo}`);
          if (shouldQueue) {
            this.logger.log(`DEBUG discoverAllAtOnce: queueing document ${refNo}`);
            await this.queueDocument(refNo, category, item);
            pageResults.newlyQueued++;
            this.logger.log(`DEBUG discoverAllAtOnce: queued, newlyQueued=${pageResults.newlyQueued}`);
          } else {
            const doc = this.lowdbService.getDocument(refNo, category);
            if (doc?.workflow?.status === 'COMPLETED') {
              pageResults.alreadyCompleted++;
            } else {
              pageResults.inProgress++;
            }
          }
        }

        this.logger.log(`DEBUG discoverAllAtOnce: item loop complete, queued=${pageResults.newlyQueued}, checking pagination`);

        // Check if there are more pages
        if (items.length < PAGE_SIZE) {
          this.logger.log(`DEBUG discoverAllAtOnce: items.length (${items.length}) < PAGE_SIZE (${PAGE_SIZE}), setting hasMorePages=false`);
          hasMorePages = false;
        } else {
          pageNo++;
          this.logger.log(`DEBUG discoverAllAtOnce: more pages available, pageNo=${pageNo}`);
        }
      } catch (error) {
        this.logger.error(`Error fetching page ${pageNo} for ${category} (year=all): ${error}`);
        pageResults.errors++;
        hasMorePages = false;
      }
    }

    return pageResults;
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
    const MAX_PAGES = 100; // Safety cap to prevent infinite loops

    while (hasMorePages && pageNo < MAX_PAGES) {
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
        } else if (pageNo >= MAX_PAGES) {
          this.logger.warn(`MAX_PAGES limit (${MAX_PAGES}) reached at page ${pageNo} for ${category}/${year}, stopping pagination after ${pageResults.totalFound} items found`);
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
    year: number | string,
    pageNo: number,
    pageSize: number,
  ): Promise<any[]> {
    switch (category) {
      case 'circulars':
        return this.circularClient.searchCirculars({ year: year as number, pageNo, pageSize });
      case 'consultations':
        return this.consultationClient.searchConsultations({ year: year as any, pageNo, pageSize });
      case 'news':
        return this.newsClient.searchNews({ year: year as any, pageNo, pageSize });
      case 'guidelines':
        // Guidelines are scraped from a single HTML page, not paginated by year
        return this.guidelineScraper.getGuidelinesList();
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
      case 'guidelines':
        return item.guidelineId || item.refNo || null;
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
      this.logger.debug(`Attempting to queue document: ${category}/${refNo}`);
      await this.queueService.submitJob({
        category,
        refNo,
        action: 'discover',
        data: {
          discoveredFrom: 'auto-discovery',
          discoveredAt: new Date().toISOString(),
          year: item.year || item.releaseDate?.split('-')[0] || item.effectiveDate?.split('-')[0] || new Date().getFullYear(),
        },
      });
      this.logger.log(`Successfully queued document: ${category}/${refNo}`);
    } catch (error) {
      this.logger.error(`Failed to queue document ${category}/${refNo}: ${error}`);
      this.logger.error(`Error details: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
      throw error;
    }
  }

  private async throttle(): Promise<void> {
    // Don't actually throttle - let discovery run as fast as possible
    // The API has its own rate limiting
    return;
    // Original throttle code preserved for reference:
    // await new Promise((resolve) => setTimeout(resolve, this.requestIntervalMs));
  }
}
