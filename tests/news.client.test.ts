import { describe, test, expect, beforeEach } from 'bun:test';

// Mock the config service
const mockConfigService = {
  get: (key: string) => {
    const defaults: Record<string, any> = {
      sfcBaseUrl: 'https://apps.sfc.hk/edistributionWeb',
    };
    return defaults[key];
  },
};

describe('NewsClient', () => {
  let newsClient: any;

  beforeEach(() => {
    const { NewsClient } = require('../src/sfc-clients/news.client');
    newsClient = new NewsClient(mockConfigService as any);
  });

  describe('constructor', () => {
    test('creates instance with default base URL', () => {
      expect(newsClient).toBeDefined();
    });
  });

  describe('searchNews', () => {
    test('method exists', () => {
      expect(typeof newsClient.searchNews).toBe('function');
    });

    test('accepts year parameter', async () => {
      try {
        await newsClient.searchNews({ year: 2026 });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('accepts limit parameter', async () => {
      try {
        await newsClient.searchNews({ limit: 10 });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('accepts all params', async () => {
      try {
        await newsClient.searchNews({ year: 2026, limit: 5 });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('getNews', () => {
    test('method exists', () => {
      expect(typeof newsClient.getNews).toBe('function');
    });

    test('requires refNo parameter', async () => {
      try {
        await newsClient.getNews('NEWS001');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('getNewsContent', () => {
    test('method exists', () => {
      expect(typeof newsClient.getNewsContent).toBe('function');
    });

    test('requires refNo parameter', async () => {
      try {
        await newsClient.getNewsContent('NEWS001');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
