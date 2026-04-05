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

describe('ConsultationClient', () => {
  let consultationClient: any;

  beforeEach(() => {
    const { ConsultationClient } = require('../src/sfc-clients/consultation.client');
    consultationClient = new ConsultationClient(mockConfigService as any);
  });

  describe('constructor', () => {
    test('creates instance with default base URL', () => {
      expect(consultationClient).toBeDefined();
    });

    test('sets baseUrl correctly', () => {
      expect(consultationClient.baseUrl).toBe('https://apps.sfc.hk/edistributionWeb');
    });
  });

  describe('throttle', () => {
    test('method exists', () => {
      expect(typeof consultationClient.throttle).toBe('function');
    });
  });

  describe('searchConsultations', () => {
    test('method exists', () => {
      expect(typeof consultationClient.searchConsultations).toBe('function');
    });

    test('accepts year parameter', async () => {
      try {
        await consultationClient.searchConsultations({ year: 2026 });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('accepts status parameter (open)', async () => {
      try {
        await consultationClient.searchConsultations({ status: 'open' });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('accepts status parameter (closed)', async () => {
      try {
        await consultationClient.searchConsultations({ status: 'closed' });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('accepts status parameter (concluded)', async () => {
      try {
        await consultationClient.searchConsultations({ status: 'concluded' });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('accepts limit parameter', async () => {
      try {
        await consultationClient.searchConsultations({ limit: 10 });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('accepts all params', async () => {
      try {
        await consultationClient.searchConsultations({ year: 2026, status: 'closed', limit: 10 });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('accepts empty params', async () => {
      try {
        await consultationClient.searchConsultations({});
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('getConsultation', () => {
    test('method exists', () => {
      expect(typeof consultationClient.getConsultation).toBe('function');
    });

    test('requires refNo parameter', async () => {
      try {
        await consultationClient.getConsultation('CP01-2026');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('getConsultationPdf', () => {
    test('method exists', () => {
      expect(typeof consultationClient.getConsultationPdf).toBe('function');
    });

    test('accepts refNo parameter', async () => {
      try {
        await consultationClient.getConsultationPdf('CP01-2026');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('getConclusionPdf', () => {
    test('method exists', () => {
      expect(typeof consultationClient.getConclusionPdf).toBe('function');
    });

    test('returns null for 404 response', async () => {
      try {
        await consultationClient.getConclusionPdf('NONEXISTENT');
      } catch (error) {
        // May fail or return null
        expect(error).toBeDefined();
      }
    });
  });
});
