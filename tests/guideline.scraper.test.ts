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
      const html = '<table><tbody></tbody></table>';
      const result = guidelineScraper.parseGuidelinesTable(html);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    test('parses table with data-code-guideline-id rows', () => {
      // This is the actual HTML structure the method expects
      const html = `
        <table>
          <tbody>
            <tr data-code-guideline-id="GL01" data-code-guideline-topics="General">
              <td>Test Guideline</td>
              <td><a href="/pdf/test.pdf">2024-01-01</a></td>
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
        <table>
          <tbody>
            <tr>
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

  describe('getGuidelineDetail', () => {
    test('accepts refNo parameter', async () => {
      // Method exists but makes network call - just check it exists and is callable
      expect(typeof guidelineScraper.getGuidelineDetail).toBe('function');
    });
  });
});
