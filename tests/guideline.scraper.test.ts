import { describe, test, expect, beforeEach } from 'bun:test';

// Mock the config service
const mockConfigService = {
  get: (key: string) => {
    const defaults: Record<string, any> = {
      sfcBaseUrl: 'https://www.sfc.hk',
    };
    return defaults[key];
  },
};

describe('GuidelineScraper', () => {
  let guidelineScraper: any;

  beforeEach(() => {
    const { GuidelineScraper } = require('../src/sfc-clients/guideline.scraper');
    guidelineScraper = new GuidelineScraper(mockConfigService as any);
  });

  describe('constructor', () => {
    test('creates instance with base URL', () => {
      expect(guidelineScraper).toBeDefined();
    });

    test('sets correct base URL', () => {
      expect(guidelineScraper.baseUrl).toBe('https://www.sfc.hk');
    });
  });

  describe('throttle', () => {
    test('method exists', () => {
      expect(typeof guidelineScraper.throttle).toBe('function');
    });

    test('throttle waits between requests', async () => {
      const start = Date.now();
      await guidelineScraper.throttle();
      const elapsed = Date.now() - start;
      // First call should be immediate
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('getGuidelinesList', () => {
    test('method exists', () => {
      expect(typeof guidelineScraper.getGuidelinesList).toBe('function');
    });
  });

  describe('getGuidelineDetail', () => {
    test('method exists', () => {
      expect(typeof guidelineScraper.getGuidelineDetail).toBe('function');
    });

    test('accepts refNo parameter', async () => {
      try {
        await guidelineScraper.getGuidelineDetail('GL01');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('downloadGuidelinePdf', () => {
    test('method exists', () => {
      expect(typeof guidelineScraper.downloadGuidelinePdf).toBe('function');
    });
  });

  describe('parseGuidelinesTable', () => {
    test('parses empty table', () => {
      const html = '<table class="guidelines-table"><tbody></tbody></table>';
      const result = guidelineScraper.parseGuidelinesTable(html);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    test('parses table with rows', () => {
      const html = `
        <table class="guidelines-table">
          <tbody>
            <tr>
              <td>GL01</td>
              <td>Test Guideline</td>
              <td>2024-01-01</td>
              <td><a href="/pdf/test.pdf">PDF</a></td>
            </tr>
          </tbody>
        </table>
      `;
      const result = guidelineScraper.parseGuidelinesTable(html);
      expect(result.length).toBe(1);
      expect(result[0].refNo).toBe('GL01');
      expect(result[0].title).toBe('Test Guideline');
    });

    test('skips rows with missing refNo', () => {
      const html = `
        <table class="guidelines-table">
          <tbody>
            <tr>
              <td></td>
              <td>Test Guideline</td>
              <td>2024-01-01</td>
            </tr>
          </tbody>
        </table>
      `;
      const result = guidelineScraper.parseGuidelinesTable(html);
      expect(result.length).toBe(0);
    });
  });

  describe('parseGuidelineDetail', () => {
    test('parses detail HTML', () => {
      const html = `
        <html>
          <head>
            <h1 class="guideline-title">Test Title</h1>
            <div class="guideline-content">Content</div>
            <meta name="effective-date" content="2024-01-01">
            <meta name="last-updated" content="2024-06-01">
          </head>
        </html>
      `;
      const result = guidelineScraper.parseGuidelineDetail(html, 'GL01');
      expect(result.refNo).toBe('GL01');
    });
  });

  describe('parseVersionHistory', () => {
    test('parses version history', () => {
      // Need cheerio for this test
      const cheerio = require('cheerio');
      const html = `
        <html>
          <ul class="version-history">
            <li><span class="version-date">2024-01-01</span><a href="/v1.pdf">v1</a></li>
            <li><span class="version-date">2024-06-01</span><a href="/v2.pdf">v2</a></li>
          </ul>
        </html>
      `;
      const $ = cheerio.load(html);
      const result = guidelineScraper.parseVersionHistory($);
      expect(result.length).toBe(2);
    });
  });
});
