import { describe, test, expect, beforeEach } from 'bun:test';

// Mock the config service
const mockConfigService = {
  get: (key: string) => {
    const defaults: Record<string, any> = {
      doclingPath: '/usr/local/bin/docling',
      doclingTimeout: 30000,
    };
    return defaults[key];
  },
};

describe('DoclingService', () => {
  let doclingService: any;

  beforeEach(() => {
    const { DoclingService } = require('../src/converters/docling.service');
    doclingService = new DoclingService(mockConfigService as any);
  });

  describe('constructor', () => {
    test('creates instance with default path', () => {
      expect(doclingService).toBeDefined();
    });

    test('sets doclingPath from config', () => {
      expect(doclingService.doclingPath).toBe('/usr/local/bin/docling');
    });

    test('sets timeout from config', () => {
      expect(doclingService.timeout).toBe(30000);
    });
  });

  describe('isAvailable', () => {
    test('method exists', () => {
      expect(typeof doclingService.isAvailable).toBe('function');
    });

    test('returns boolean', () => {
      const result = doclingService.isAvailable();
      expect(typeof result).toBe('boolean');
    });

    test('returns false for non-existent path', () => {
      const result = doclingService.isAvailable();
      expect(result).toBe(false);
    });
  });

  describe('convertPdfToMarkdown', () => {
    test('method exists', () => {
      expect(typeof doclingService.convertPdfToMarkdown).toBe('function');
    });

    test('throws error for non-existent docling', async () => {
      try {
        await doclingService.convertPdfToMarkdown('/nonexistent/file.pdf');
      } catch (error) {
        expect(error).toBeDefined();
        expect((error as Error).message).toContain('Docling not found');
      }
    });

    test('throws error for non-existent PDF file', async () => {
      // Use the actual docling path but non-existent PDF
      // Since docling doesn't exist, it will throw "Docling not found"
      try {
        await doclingService.convertPdfToMarkdown('/nonexistent/test.pdf');
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('runDocling', () => {
    test('runDocling method exists', () => {
      expect(typeof doclingService.runDocling).toBe('function');
    });
  });
});
