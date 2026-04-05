import { Test, TestingModule } from '@nestjs/testing';
import { GuidelineScraper } from './guideline.scraper';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ContentService } from '../services/content.service';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('GuidelineScraper Integration Tests', () => {
  let guidelineScraper: GuidelineScraper;
  let testContentDir: string;

  beforeEach(async () => {
    // Create temporary test directories
    testContentDir = `./data/test-scraper-content-${Date.now()}`;
    await fs.ensureDir(testContentDir);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuidelineScraper,
        ContentService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            contentDir: testContentDir,
            guidelineScraperUrl: 'https://test-guidelines.example.com',
            scraperRateLimit: 1000
          })
        },
        Logger
      ]
    }).compile();

    guidelineScraper = module.get<GuidelineScraper>(GuidelineScraper);
  });

  afterEach(async () => {
    // Clean up test directories
    if (testContentDir) {
      await fs.remove(testContentDir);
    }
  });

  test('should scrape guideline metadata successfully', async () => {
    // Mock HTTP response for testing
    (guidelineScraper as any).fetchGuidelineList = jest.fn().mockResolvedValue([
      { id: 'GUIDE-001', title: 'Test Guideline', language: 'EN', url: 'https://test.example.com/guide-001' }
    ]);

    const result = await guidelineScraper.scrapeMetadata();

    expect(result.success).toBe(true);
    expect(result.scrapedCount).toBe(1);
    expect(result.guidelines[0].id).toBe('GUIDE-001');
  });

  test('should handle edge case URL parsing', async () => {
    // Test URL with query parameters
    const parsedResult = (guidelineScraper as any).parseGuidelineUrl('https://test.example.com/guide?ref=GUIDE-002&lang=FR');

    expect(parsedResult.refNo).toBe('GUIDE-002');
    expect(parsedResult.language).toBe('FR');
  });

  test('should rate limit requests', async () => {
    // Mock multiple fetch calls
    const fetchMock = jest.fn().mockResolvedValue({ json: () => ({ id: 'GUIDE-003' }) });
    (guidelineScraper as any).fetch = fetchMock;

    // Scrape multiple guidelines
    await guidelineScraper.scrapeGuidelines([
      { id: 'GUIDE-003', url: 'https://test.example.com/guide-003' },
      { id: 'GUIDE-004', url: 'https://test.example.com/guide-004' }
    ]);

    // Verify rate limit delay between calls
    const callTimes = fetchMock.mock.instances.map(instance => instance.callTime);
    expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(1000);
  });

  test('should handle scraping failures', async () => {
    // Mock failed fetch
    (guidelineScraper as any).fetchGuidelineContent = jest.fn().mockRejectedValue(new Error('Scrape failed'));

    const result = await guidelineScraper.scrapeGuideline('GUIDE-005', 'https://test.example.com/invalid-guide');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Scrape failed');
  });
});

// Bun test runner configuration
if (import.meta.vitest) {
  const { describe, test, beforeEach, afterEach, expect } = import.meta.vitest;
  export { describe, test, beforeEach, afterEach, expect };
}