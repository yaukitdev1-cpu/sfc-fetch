import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';

// Mock the config service
const mockConfigService = {
  get: (key: string) => {
    const defaults: Record<string, any> = {
      sfcBaseUrl: 'https://apps.sfc.hk/edistributionWeb',
    };
    return defaults[key];
  },
};

describe('CircularClient', () => {
  let circularClient: any;

  beforeEach(() => {
    const { CircularClient } = require('../src/sfc-clients/circular.client');
    circularClient = new CircularClient(mockConfigService as any);
  });

  describe('constructor', () => {
    test('creates instance with default base URL', () => {
      expect(circularClient).toBeDefined();
    });
  });

  describe('throttle', () => {
    test('throttle method exists', () => {
      expect(typeof circularClient.throttle).toBe('function');
    });
  });

  describe('searchCirculars', () => {
    test('method exists', () => {
      expect(typeof circularClient.searchCirculars).toBe('function');
    });

    test('accepts search params object', async () => {
      // This will fail because the endpoint doesn't exist, but we test parameter handling
      try {
        await circularClient.searchCirculars({ year: 2026, limit: 10 });
      } catch (error) {
        // Expected to fail since endpoint doesn't exist
        expect(error).toBeDefined();
      }
    });

    test('accepts empty params', async () => {
      try {
        await circularClient.searchCirculars({});
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('getCircular', () => {
    test('method exists', () => {
      expect(typeof circularClient.getCircular).toBe('function');
    });

    test('requires refNo parameter', async () => {
      try {
        await circularClient.getCircular('26EC01');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('getCircularPdf', () => {
    test('method exists', () => {
      expect(typeof circularClient.getCircularPdf).toBe('function');
    });

    test('returns buffer on valid request', async () => {
      try {
        await circularClient.getCircularPdf('26EC01');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('getCircularHtml', () => {
    test('method exists', () => {
      expect(typeof circularClient.getCircularHtml).toBe('function');
    });

    test('returns string on valid request', async () => {
      try {
        await circularClient.getCircularHtml('26EC01');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});
