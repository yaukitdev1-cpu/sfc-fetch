import { Test, TestingModule } from '@nestjs/testing';
import { DoclingService } from './docling.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('DoclingService Integration Tests', () => {
  let doclingService: DoclingService;
  let testInputDir: string;
  let testOutputDir: string;

  beforeEach(async () => {
    // Create temporary test directories
    testInputDir = `./data/test-docling-input-${Date.now()}`;
    testOutputDir = `./data/test-docling-output-${Date.now()}`;
    await fs.ensureDir(testInputDir);
    await fs.ensureDir(testOutputDir);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoclingService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            doclingInputDir: testInputDir,
            doclingOutputDir: testOutputDir,
            doclingApiKey: 'test-api-key'
          })
        },
        Logger
      ]
    }).compile();

    doclingService = module.get<DoclingService>(DoclingService);
  });

  afterEach(async () => {
    // Clean up test directories
    if (testInputDir) await fs.remove(testInputDir);
    if (testOutputDir) await fs.remove(testOutputDir);
  });

  test('should convert PDF to markdown successfully', async () => {
    // Create test PDF file (simplified binary placeholder)
    const testPdfPath = path.join(testInputDir, 'test-file.pdf');
    await fs.writeFile(testPdfPath, Buffer.from('test-pdf-content'));

    // Mock API response for testing
    (doclingService as any).callDoclingApi = jest.fn().mockResolvedValue({
      markdown: '# Converted Content\n\nThis is test content from PDF'
    });

    const result = await doclingService.convertPdfToMarkdown('test-file.pdf');

    expect(result.success).toBe(true);
    expect(result.markdownPath).toContain('test-file.md');
    expect(result.markdownContent).toContain('# Converted Content');
  });

  test('should handle conversion errors', async () => {
    // Create test PDF file
    const testPdfPath = path.join(testInputDir, 'invalid-file.pdf');
    await fs.writeFile(testPdfPath, Buffer.from('invalid-pdf-content'));

    // Mock API failure
    (doclingService as any).callDoclingApi = jest.fn().mockRejectedValue(new Error('Conversion failed'));

    const result = await doclingService.convertPdfToMarkdown('invalid-file.pdf');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Conversion failed');
  });

  test('should validate input file existence', async () => {
    const result = await doclingService.convertPdfToMarkdown('non-existent.pdf');

    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found');
  });
});

// Bun test runner configuration
if (import.meta.vitest) {
  const { describe, test, beforeEach, afterEach, expect } = import.meta.vitest;
  export { describe, test, beforeEach, afterEach, expect };
}