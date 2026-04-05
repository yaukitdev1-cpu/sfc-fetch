import { Test, TestingModule } from '@nestjs/testing';
import { QueueService } from './queue.service';
import { LowdbService } from '../database/lowdb.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { DocumentData } from '../database/lowdb.service';
import { JSONFile } from 'lowdb/node';

describe('QueueService Integration Tests', () => {
  let queueService: QueueService;
  let lowdbService: LowdbService;
  let testDbPath: string;

  beforeEach(async () => {
    // Create temporary test database
    testDbPath = `./data/db/test-sfc-db-${Date.now()}.json`;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        {
          provide: LowdbService,
          useFactory: () => {
            const lowdb = new LowdbService(new ConfigService({
              dbPath: testDbPath,
              queuePath: testDbPath
            }));
            // Initialize test database with empty data
            (lowdb as any).db = new LowdbService(new JSONFile<DocumentData>(testDbPath), {
              circulars: [],
              guidelines: [],
              consultations: [],
              news: [],
              backupMetadata: [],
              queue: []
            });
            return lowdb;
          }
        },
        ConfigService,
        Logger
      ]
    }).compile();

    queueService = module.get<QueueService>(QueueService);
    lowdbService = module.get<LowdbService>(LowdbService);
    await (lowdbService as any).initialize();
  });

  afterEach(async () => {
    // Clean up test database
    if (testDbPath) {
      const fs = require('fs-extra');
      await fs.remove(testDbPath);
    }
  });

  test('should persist discover job to LowDB', async () => {
    // Submit discover job
    const jobResult = await queueService.submitJob({
      category: 'circulars',
      refNo: 'TEST-001',
      action: 'discover'
    });

    expect(jobResult.success).toBe(true);

    // Verify job exists in LowDB
    const queueJobs = lowdbService.getCollection('queue');
    expect(queueJobs.length).toBe(1);
    expect(queueJobs[0].action).toBe('discover');
    expect(queueJobs[0].status).toBe('completed');
    expect(queueJobs[0].category).toBe('circulars');
    expect(queueJobs[0].refNo).toBe('TEST-001');
  });

  test('should persist download job to LowDB', async () => {
    // Submit download job
    const jobResult = await queueService.submitJob({
      category: 'guidelines',
      refNo: 'TEST-002',
      action: 'download',
      data: { sourceUrl: 'https://test.example.com/file.pdf' }
    });

    expect(jobResult.success).toBe(true);

    // Verify job exists in LowDB
    const queueJobs = lowdbService.getCollection('queue');
    expect(queueJobs.length).toBe(1);
    expect(queueJobs[0].action).toBe('download');
    expect(queueJobs[0].status).toBe('completed');
    expect(queueJobs[0].sourceUrl).toBe('https://test.example.com/file.pdf');
  });

  test('should handle failed job persistence', async () => {
    // Mock LowDB failure
    (lowdbService.addQueueJob as jest.Mock).mockRejectedValue(new Error('DB connection failed'));

    // Submit job and expect failure
    await expect(queueService.submitJob({
      category: 'news',
      refNo: 'TEST-003',
      action: 'convert'
    })).rejects.toThrow('DB connection failed');
  });
});

// Bun test runner configuration
if (import.meta.vitest) {
  const { describe, test, beforeEach, afterEach, expect } = import.meta.vitest;
  export { describe, test, beforeEach, afterEach, expect };
}